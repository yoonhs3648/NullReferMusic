import { fetchGithubJsonDocument, resolveGithubDataPat } from '@/lib/nrmGithubContentsApi';
import { fetchGithubRawJson } from '@/lib/nrmGithubRawFetch';
import {
  NRM_USER_BAN_LIST_JSON_API_PATH,
  NRM_USER_BAN_LIST_JSON_RAW_URL,
  NRM_USER_BAN_POLL_INTERVAL_MS,
} from '@/lib/nrmRemoteDataConfig';

export { NRM_USER_BAN_POLL_INTERVAL_MS };

export type NrmUserBanItem = {
  id: number;
  userName: string;
  SerialNo: string;
  content: string;
  isBanned: boolean;
  date: string;
};

type UserBanListJson = {
  userBanList?: Array<{
    id?: number;
    userName?: string;
    SerialNo?: string;
    content?: string;
    isBanned?: boolean;
    date?: string;
  }>;
};

function normalizeRows(json: UserBanListJson): NrmUserBanItem[] {
  const rows = Array.isArray(json.userBanList) ? json.userBanList : [];
  const out: NrmUserBanItem[] = [];
  for (const row of rows) {
    const id = row.id;
    if (typeof id !== 'number' || !Number.isFinite(id)) continue;
    out.push({
      id,
      userName: String(row.userName ?? '').trim(),
      SerialNo: String(row.SerialNo ?? '').trim(),
      content: String(row.content ?? ''),
      isBanned: row.isBanned === true,
      date: String(row.date ?? '').trim(),
    });
  }
  return out;
}

/** raw URL로 원격 userBanList.json 조회 (앱 클라이언트용) */
export async function fetchUserBanList(signal?: AbortSignal): Promise<NrmUserBanItem[]> {
  const json = await fetchGithubRawJson<UserBanListJson>(NRM_USER_BAN_LIST_JSON_RAW_URL, {
    signal,
  });
  return normalizeRows(json);
}

/** GitHub Contents API로 최신 userBanList.json 조회 (관리자 패널 — CDN 캐시 우회) */
export async function fetchUserBanListViaApi(): Promise<NrmUserBanItem[]> {
  const pat = await resolveGithubDataPat();
  const { doc } = await fetchGithubJsonDocument<UserBanListJson>(
    NRM_USER_BAN_LIST_JSON_API_PATH,
    pat,
    { userBanList: [] },
  );
  return normalizeRows(doc);
}

/** SerialNo별 최신(id 최대) 기록 기준 차단 여부 */
export function resolveBanStateForSerial(
  rows: NrmUserBanItem[],
  serialNo: string,
): { banned: boolean; content: string; entry: NrmUserBanItem | null } {
  const serial = serialNo.trim();
  if (!serial) return { banned: false, content: '', entry: null };

  let latest: NrmUserBanItem | null = null;
  for (const row of rows) {
    if (row.SerialNo.trim() !== serial) continue;
    if (!latest || row.id > latest.id) latest = row;
  }
  if (!latest || !latest.isBanned) {
    return { banned: false, content: '', entry: null };
  }
  return { banned: true, content: latest.content, entry: latest };
}

/** 관리자 블랙리스트 — SerialNo별 최신 기록이 isBanned true 인 항목 */
export function listCurrentlyBannedUsers(rows: NrmUserBanItem[]): NrmUserBanItem[] {
  const latestBySerial = new Map<string, NrmUserBanItem>();
  for (const row of rows) {
    const serial = row.SerialNo.trim();
    if (!serial) continue;
    const prev = latestBySerial.get(serial);
    if (!prev || row.id > prev.id) latestBySerial.set(serial, row);
  }
  return [...latestBySerial.values()]
    .filter((row) => row.isBanned)
    .sort((a, b) => b.id - a.id);
}
