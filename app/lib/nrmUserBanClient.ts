import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import { mapUserBanRow } from '@/lib/nrmSupabaseRows';
import type { NrmSupabaseUserBanRow } from '@/lib/nrmSupabaseDatabase.types';
import {
  formatNrmUserListSubtitle,
  type NrmUserListEntry,
} from '@/lib/nrmUserListClient';

export const NRM_USER_BAN_POLL_INTERVAL_MS = 30 * 60 * 1000;

export type NrmUserBanItem = {
  id: number;
  userName: string;
  SerialNo: string;
  deviceId: string;
  content: string;
  isBanned: boolean;
  date: string;
};

/** 관리자 리스트용 — user_list에서 보강한 표시 정보 */
export type NrmUserBanListRow = NrmUserBanItem & {
  userEmail: string;
  appKind: string;
  deviceRegistered: boolean;
  linkedUserNames: string[];
  linkedAccountLabels: string[];
};

function banGroupKey(row: NrmUserBanItem): string {
  const device = row.deviceId.trim();
  if (device) return `d:${device}`;
  return `s:${row.SerialNo.trim()}`;
}

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

/** 이 기기의 ANDROID_ID 해시가 차단 목록의 최신 행에서 is_banned=true 인지 */
export function resolveBanStateForDevice(
  rows: NrmUserBanItem[],
  deviceId: string,
): { banned: boolean; content: string; entry: NrmUserBanItem | null } {
  const device = deviceId.trim();
  if (!device) return { banned: false, content: '', entry: null };

  let latest: NrmUserBanItem | null = null;
  for (const row of rows) {
    if (row.deviceId.trim() !== device) continue;
    if (!latest || row.id > latest.id) latest = row;
  }
  if (!latest || !latest.isBanned) {
    return { banned: false, content: '', entry: null };
  }
  return { banned: true, content: latest.content, entry: latest };
}

export function listCurrentlyBannedUsers(rows: NrmUserBanItem[]): NrmUserBanItem[] {
  const latestByKey = new Map<string, NrmUserBanItem>();
  for (const row of rows) {
    const key = banGroupKey(row);
    if (key === 'd:' || key === 's:') continue;
    const prev = latestByKey.get(key);
    if (!prev || row.id > prev.id) latestByKey.set(key, row);
  }
  return [...latestByKey.values()]
    .filter((row) => row.isBanned)
    .sort((a, b) => b.id - a.id);
}

export function enrichBanRowsForAdmin(
  bannedRows: NrmUserBanItem[],
  users: NrmUserListEntry[],
): NrmUserBanListRow[] {
  return bannedRows.map((ban) => {
    const device = ban.deviceId.trim();
    const onDevice = device
      ? users.filter((u) => (u.deviceId ?? '').trim() === device)
      : [];
    const bySerial = users.find((u) => u.SerialNo.trim() === ban.SerialNo.trim());
    const primary = bySerial ?? onDevice[0];
    const names = [...new Set(onDevice.map((u) => u.userName.trim()).filter(Boolean))];
    const linkedAccountLabels = onDevice.map((u) => {
      const name = u.userName.trim() || '-';
      return `${name} · ${formatNrmUserListSubtitle(u)}`;
    });
    return {
      ...ban,
      userEmail: (primary?.userEmail ?? '').trim(),
      appKind: (primary?.appKind ?? '').trim(),
      deviceRegistered: device.length > 0,
      linkedUserNames: names,
      linkedAccountLabels,
    };
  });
}
