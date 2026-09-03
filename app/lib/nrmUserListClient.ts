import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbMaybeSingle, nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import { mapUserListRow } from '@/lib/nrmSupabaseRows';
import type { NrmSupabaseUserListRow } from '@/lib/nrmSupabaseDatabase.types';

export function formatNrmLoginKindLabel(appKind: string): string {
  const kind = appKind.trim().toLowerCase();
  if (kind === 'kakao') return '카카오';
  if (kind === 'google') return 'Google';
  return appKind.trim() || '-';
}

export function formatNrmLoginSubtitle(appKind: string, userEmail: string): string {
  const kind = formatNrmLoginKindLabel(appKind);
  const email = userEmail.trim();
  return email ? `${kind} · ${email}` : kind;
}

export function formatNrmUserListSubtitle(entry: NrmUserListEntry): string {
  return formatNrmLoginSubtitle(entry.appKind, entry.userEmail);
}

export type NrmUserListEntry = {
  id: number;
  appKind: string;
  userName: string;
  userEmail: string;
  SerialNo: string;
  version: string;
  Createddate: string;
  deviceId: string | null;
  lastAccessDate: string | null;
  isAdmin: string;
};

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

async function fetchUserListRows(): Promise<NrmUserListEntry[]> {
  const rows = await nrmSbSelect<NrmSupabaseUserListRow>(NRM_SUPABASE_TABLES.userList, (q) =>
    q.select('*').order('id', { ascending: true }),
  );
  const out: NrmUserListEntry[] = [];
  for (const row of rows) {
    const item = mapUserListRow(row);
    if (item) out.push(item);
  }
  return out;
}

export async function fetchDedupedUserListEntries(): Promise<NrmUserListEntry[]> {
  return dedupeUserListBySerialNo(await fetchUserListRows());
}

export async function fetchDedupedUserListEntriesViaApi(): Promise<NrmUserListEntry[]> {
  return fetchDedupedUserListEntries();
}

export async function fetchUserListEntryBySerialNo(
  serialNo: string,
): Promise<NrmUserListEntry | null> {
  const trimmed = serialNo.trim();
  if (!trimmed) return null;
  const data = await nrmSbMaybeSingle<NrmSupabaseUserListRow>(NRM_SUPABASE_TABLES.userList, (q) =>
    q
      .select('*')
      .eq('serial_no', trimmed)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!data) return null;
  return mapUserListRow(data);
}

/** 릴리스 APK 업데이트 후 identity 복구 — device_id 바인딩 기준 */
export async function fetchUserListEntryByDeviceId(
  deviceId: string,
): Promise<NrmUserListEntry | null> {
  const trimmed = deviceId.trim();
  if (!trimmed) return null;
  const data = await nrmSbMaybeSingle<NrmSupabaseUserListRow>(NRM_SUPABASE_TABLES.userList, (q) =>
    q
      .select('*')
      .eq('device_id', trimmed)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!data) return null;
  return mapUserListRow(data);
}
