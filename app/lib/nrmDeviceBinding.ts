import {
  fetchGithubJsonDocument,
  putGithubContents,
  utf8ToBase64,
} from '@/lib/nrmGithubContentsApi';
import {
  setCachedUserListIsAdmin,
} from '@/lib/nrmAdminAlarmReceiver';
import { getNrmGithubDataPat } from '@/lib/nrmGithubDataPat';
import { getNrmAppSerialNo, getNrmAndroidIdSha256 } from '@/lib/nrmAppSerialNo';
import { getNrmAppVersion } from '@/lib/nrmAppInfo';
import { NRM_USER_LIST_JSON_API_PATH } from '@/lib/nrmRemoteDataConfig';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

type UserListRawEntry = {
  id?: number;
  appName?: string;
  userName?: string;
  SerialNo?: string;
  version?: string;
  Createddate?: string;
  deviceId?: string | null;
  lastAccessDate?: string | null;
  isAdmin?: boolean;
};

type UserListJson = {
  userList: UserListRawEntry[];
};

/** lastAccessDate 포맷: yyyy-MM-dd HH:mm:ss.SSS */
function formatLastAccessDate(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const p3 = (n: number) => String(n).padStart(3, '0');
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`
  );
}

/**
 * 버전 비교: current < required 이면 true (outdated).
 * "major.minor.patch" 형식 기준.
 */
function isVersionOutdated(current: string, required: string): boolean {
  const parse = (v: string) => v.trim().split('.').map((n) => parseInt(n, 10) || 0);
  const [cMaj, cMin, cPat] = parse(current);
  const [rMaj, rMin, rPat] = parse(required);
  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPat > cPat;
}

/** SerialNo 일치 항목 중 id가 가장 큰 항목 반환 */
function findTargetEntry(doc: UserListJson, serialNo: string): UserListRawEntry | null {
  const trimmed = serialNo.trim();
  const matches = doc.userList.filter((e) => String(e.SerialNo ?? '').trim() === trimmed);
  if (!matches.length) return null;
  return matches.reduce((best, cur) =>
    (cur.id ?? 0) > (best.id ?? 0) ? cur : best,
  );
}

async function writeEntryUpdate(
  doc: UserListJson,
  sha: string,
  targetId: number,
  deviceId: string,
  lastAccessDate: string,
  pat: string,
): Promise<void> {
  const updated = doc.userList.map((e) =>
    e.id === targetId ? { ...e, deviceId, lastAccessDate } : e,
  );
  const content = utf8ToBase64(JSON.stringify({ userList: updated }, null, '\t') + '\n');
  await putGithubContents(
    NRM_USER_LIST_JSON_API_PATH,
    pat,
    content,
    `device: update id=${targetId}`,
    sha || undefined,
  );
}

export type DeviceBindingResult =
  | { status: 'skip' | 'ok' | 'mismatch' | 'unregistered' }
  | { status: 'outdated'; requiredVersion: string }
  | { status: 'error'; message: string };

/**
 * 커스텀 APK 디바이스 바인딩 검사.
 *
 * - SerialNo 없음 → 일반 APK, 즉시 'skip' 반환
 * - deviceId === null → 최초 설치, ANDROID_ID 해시를 기록 후 'ok'
 * - deviceId === 해시 → 일치, lastAccessDate 백그라운드 업데이트 후 'ok'
 * - deviceId 불일치 → 'mismatch'
 */
export async function runDeviceBindingCheck(): Promise<DeviceBindingResult> {
  const tag = 'device-binding';

  const serialNo = await getNrmAppSerialNo();
  if (!serialNo) {
    logNrmDev(tag, { event: 'skip-no-serial' });
    return { status: 'skip' };
  }

  logNrmDev(tag, { event: 'check-start' });

  const pat = await getNrmGithubDataPat();
  if (!pat) {
    const msg = 'GitHub PAT not available';
    logNrmRunError(tag, new Error(msg), { event: 'pat-missing' });
    return { status: 'error', message: msg };
  }

  const { doc, sha } = await fetchGithubJsonDocument<UserListJson>(
    NRM_USER_LIST_JSON_API_PATH,
    pat,
    { userList: [] },
  );

  const entry = findTargetEntry(doc, serialNo);
  if (!entry || typeof entry.id !== 'number') {
    logNrmRunError(tag, new Error('SerialNo not registered in userList'), { event: 'serial-not-found' });
    return { status: 'unregistered' };
  }

  setCachedUserListIsAdmin(entry.isAdmin === true);

  const androidIdHash = await getNrmAndroidIdSha256();
  if (!androidIdHash) {
    const msg = 'ANDROID_ID unavailable';
    logNrmRunError(tag, new Error(msg), { event: 'android-id-missing' });
    return { status: 'error', message: msg };
  }

  const now = formatLastAccessDate(new Date());

  // ── ANDROID_ID 검사 ──────────────────────────────────────
  // 기존 deviceId가 있고 불일치하면 즉시 차단
  if (entry.deviceId && entry.deviceId !== androidIdHash) {
    logNrmDev(tag, { event: 'device-mismatch', entryId: entry.id });
    return { status: 'mismatch' };
  }

  // ── 버전 검사 ─────────────────────────────────────────────
  const requiredVersion = String(entry.version ?? '').trim();
  const currentVersion = getNrmAppVersion();
  if (requiredVersion && isVersionOutdated(currentVersion, requiredVersion)) {
    logNrmDev(tag, {
      event: 'version-outdated',
      currentVersion,
      requiredVersion,
      entryId: entry.id,
    });
    return { status: 'outdated', requiredVersion };
  }

  // ── 최초 설치: deviceId 등록 ──────────────────────────────
  if (!entry.deviceId) {
    logNrmDev(tag, { event: 'first-install', entryId: entry.id });
    await writeEntryUpdate(doc, sha, entry.id, androidIdHash, now, pat);
    logNrmDev(tag, { event: 'device-bound', entryId: entry.id });
    return { status: 'ok' };
  }

  // ── 재실행: 일치 확인 후 lastAccessDate 백그라운드 업데이트 ──
  logNrmDev(tag, { event: 'device-matched', entryId: entry.id });
  void writeEntryUpdate(doc, sha, entry.id, androidIdHash, now, pat).catch((e: unknown) => {
    logNrmRunError(tag, e, { event: 'background-update-failed' });
  });
  return { status: 'ok' };
}
