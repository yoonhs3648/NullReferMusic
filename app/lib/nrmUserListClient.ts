import { fetchGithubRawJson } from '@/lib/nrmGithubRawFetch';
import { NRM_USER_LIST_JSON_RAW_URL } from '@/lib/nrmRemoteDataConfig';

export type NrmUserListEntry = {
  id: number;
  appName: string;
  userName: string;
  SerialNo: string;
  version: string;
  Createddate: string;
  deviceId: string | null;
  lastAccessDate: string | null;
};

type UserListJson = {
  userList?: Array<{
    id?: number;
    appName?: string;
    userName?: string;
    SerialNo?: string;
    version?: string;
    Createddate?: string;
    deviceId?: string | null;
    lastAccessDate?: string | null;
  }>;
};

/** SerialNo별 id가 가장 큰 항목만 유지 */
export function dedupeUserListBySerialNo(rows: NrmUserListEntry[]): NrmUserListEntry[] {
  const bySerial = new Map<string, NrmUserListEntry>();
  for (const row of rows) {
    const serial = row.SerialNo.trim();
    if (!serial) continue;
    const prev = bySerial.get(serial);
    if (!prev || row.id > prev.id) {
      bySerial.set(serial, row);
    }
  }
  return [...bySerial.values()].sort((a, b) => b.id - a.id);
}

export async function fetchDedupedUserListEntries(): Promise<NrmUserListEntry[]> {
  const json = await fetchGithubRawJson<UserListJson>(NRM_USER_LIST_JSON_RAW_URL);
  const rows = Array.isArray(json.userList) ? json.userList : [];
  const normalized: NrmUserListEntry[] = [];
  for (const row of rows) {
    const id = row.id;
    if (typeof id !== 'number' || !Number.isFinite(id)) continue;
    const userName = String(row.userName ?? '').trim();
    const SerialNo = String(row.SerialNo ?? '').trim();
    if (!userName || !SerialNo) continue;
    normalized.push({
      id,
      appName: String(row.appName ?? '').trim(),
      userName,
      SerialNo,
      version: String(row.version ?? '').trim(),
      Createddate: String(row.Createddate ?? '').trim(),
      deviceId: row.deviceId ?? null,
      lastAccessDate: row.lastAccessDate ?? null,
    });
  }
  return dedupeUserListBySerialNo(normalized);
}
