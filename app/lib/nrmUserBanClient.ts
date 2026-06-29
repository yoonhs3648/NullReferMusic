import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import { mapUserBanRow } from '@/lib/nrmSupabaseRows';
import type { NrmSupabaseUserBanRow } from '@/lib/nrmSupabaseDatabase.types';

export const NRM_USER_BAN_POLL_INTERVAL_MS = 30 * 60 * 1000;

export type NrmUserBanItem = {
  id: number;
  userName: string;
  SerialNo: string;
  content: string;
  isBanned: boolean;
  date: string;
};

async function fetchUserBanRows(signal?: AbortSignal): Promise<NrmUserBanItem[]> {
  const rows = await nrmSbSelect<NrmSupabaseUserBanRow>(NRM_SUPABASE_TABLES.userBanList, (q) => {
    let query = q.select('*').order('id', { ascending: true });
    if (signal) {
      query = query.abortSignal(signal);
    }
    return query;
  });
  const out: NrmUserBanItem[] = [];
  for (const row of rows) {
    const item = mapUserBanRow(row);
    if (item) out.push(item);
  }
  return out;
}

export async function fetchUserBanList(signal?: AbortSignal): Promise<NrmUserBanItem[]> {
  return fetchUserBanRows(signal);
}

export async function fetchUserBanListViaApi(): Promise<NrmUserBanItem[]> {
  return fetchUserBanRows();
}

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
