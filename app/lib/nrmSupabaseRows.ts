import type { PostgrestError } from '@supabase/supabase-js';

import type { NrmAlarmItem } from '@/lib/nrmAlarmClient';
import type { NrmInquiryItem } from '@/lib/nrmInquiryClient';
import type { NrmUserBanItem } from '@/lib/nrmUserBanClient';
import type { NrmUserListEntry } from '@/lib/nrmUserListClient';
import type {
  NrmSupabaseAlarmRow,
  NrmSupabaseApkVersionRow,
  NrmSupabaseInquiryRow,
  NrmSupabaseMusicListRow,
  NrmSupabaseUserBanRow,
  NrmSupabaseUserListRow,
} from '@/lib/nrmSupabaseDatabase.types';
import type { NrmMusicListItem } from '@/lib/nrmMusicListTypes';

export function throwSupabaseError(
  error: PostgrestError | { message: string } | null,
  context: string,
): never | void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function inquiryAlarmTitle(userName: string): string {
  const name = userName.trim();
  return name ? `${name} 님의 문의` : '문의';
}

export function formatNrmTimestamp(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

export function toInquiryCreatedDisplay(value: string): string {
  const s = value.trim();
  if (!s) return s;
  if (s.includes('T')) {
    return s.replace('T', ' ').replace(/Z$/, '').slice(0, 23);
  }
  return s;
}

export function mapApkVersionRow(row: NrmSupabaseApkVersionRow): { version: string; createdDate: string } {
  return {
    version: String(row.version ?? '').trim(),
    createdDate: toInquiryCreatedDisplay(String(row.created_date ?? '')),
  };
}

export function mapAlarmRow(row: NrmSupabaseAlarmRow): NrmAlarmItem | null {
  const id = row.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  const title = String(row.title ?? '').trim();
  const date = String(row.alarm_date ?? '').trim().slice(0, 10);
  if (!title || !date) return null;
  return {
    id,
    isNoti: row.is_noti === true,
    title,
    content: String(row.content ?? ''),
    SerialNo: String(row.serial_no ?? '').trim(),
    date,
  };
}

export function mapUserBanRow(row: NrmSupabaseUserBanRow): NrmUserBanItem | null {
  const id = row.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  return {
    id,
    userName: String(row.user_name ?? '').trim(),
    SerialNo: String(row.serial_no ?? '').trim(),
    deviceId: String(row.device_id ?? '').trim(),
    content: String(row.content ?? ''),
    isBanned: row.is_banned === true,
    date: String(row.ban_date ?? '').trim().slice(0, 10),
  };
}

export function mapInquiryRow(row: NrmSupabaseInquiryRow): NrmInquiryItem | null {
  const id = row.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  return {
    id,
    userName: String(row.user_name ?? '').trim(),
    SerialNo: String(row.serial_no ?? '').trim(),
    version: String(row.version ?? '').trim(),
    content: String(row.content ?? ''),
    attachedFile: String(row.attached_file ?? '').trim(),
    isAnswered: row.is_answered === true,
    replyContent: String(row.reply_content ?? ''),
    Createddate: toInquiryCreatedDisplay(String(row.created_date ?? '')),
  };
}

export function mapUserListRow(row: NrmSupabaseUserListRow): NrmUserListEntry | null {
  const id = row.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  const oauthUserName = String(row.user_name ?? '').trim();
  const userCustomName = String(row.user_custom_name ?? '').trim() || null;
  const userName = userCustomName || oauthUserName;
  const SerialNo = String(row.serial_no ?? '').trim();
  if (!userName || !SerialNo) return null;
  const deviceIdRaw = row.device_id;
  const deviceId =
    deviceIdRaw === null || deviceIdRaw === undefined
      ? null
      : String(deviceIdRaw);
  const lastRaw = row.last_access_date;
  const lastAccessDate =
    lastRaw === null || lastRaw === undefined
      ? null
      : toInquiryCreatedDisplay(String(lastRaw));
  return {
    id,
    appKind: String(row.app_kind ?? '').trim() || 'google',
    userName,
    userCustomName,
    userEmail: String(row.user_email ?? '').trim(),
    SerialNo,
    version: String(row.version ?? '').trim(),
    Createddate: String(row.created_date ?? '').trim().slice(0, 10),
    deviceId,
    lastAccessDate,
    isAdmin: String(row.is_admin ?? 'n').trim().toLowerCase() === 'y' ? 'y' : 'n',
  };
}

export function mapMusicListRow(row: NrmSupabaseMusicListRow): NrmMusicListItem {
  return {
    id: row.id,
    rank: row.rank,
    year: row.year,
    artist: String(row.artist ?? '').trim(),
    title: String(row.title ?? '').trim(),
    album: String(row.album ?? '').trim(),
    genre: String(row.genre ?? '').trim(),
    updatedAt: row.updated_at ?? null,
  };
}

/** attached_file 컬럼·구 GitHub 경로 → Storage object 이름 */
export function normalizeInquiryAttachmentObjectName(attachedFile: string): string {
  const raw = attachedFile.trim().replace(/\\/g, '/');
  if (!raw) return '';
  const parts = raw.split('/');
  return parts[parts.length - 1] ?? raw;
}
