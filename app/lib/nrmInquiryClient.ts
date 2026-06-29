import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import { mapInquiryRow } from '@/lib/nrmSupabaseRows';
import type { NrmSupabaseInquiryRow } from '@/lib/nrmSupabaseDatabase.types';

export const NRM_INQUIRY_HISTORY_DAYS = 90;

export type NrmInquiryItem = {
  id: number;
  userName: string;
  SerialNo: string;
  version: string;
  content: string;
  attachedFile: string;
  isAnswered: boolean;
  replyContent: string;
  Createddate: string;
};

function parseInquiryCreatedMs(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const ms = new Date(y, mo, d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isWithinHistoryWindow(dateStr: string, nowMs: number): boolean {
  const itemMs = parseInquiryCreatedMs(dateStr);
  if (itemMs === null) return false;
  const cutoff = nowMs - NRM_INQUIRY_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return itemMs >= cutoff;
}

export function formatInquiryCreatedYmd(dateStr: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(dateStr.trim());
  return m ? m[1] : dateStr.trim();
}

export function truncateInquiryPreview(text: string, maxLen = 42): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen)}...`;
}

export function inquiryListTitle(userName: string): string {
  const name = userName.trim();
  return name ? `${name} 님의 문의` : '문의';
}

export function sortInquiriesByCreatedDesc(items: NrmInquiryItem[]): NrmInquiryItem[] {
  return [...items].sort((a, b) => {
    const da = parseInquiryCreatedMs(a.Createddate) ?? 0;
    const db = parseInquiryCreatedMs(b.Createddate) ?? 0;
    if (db !== da) return db - da;
    return b.id - a.id;
  });
}

async function fetchInquiryRows(signal?: AbortSignal): Promise<NrmInquiryItem[]> {
  const rows = await nrmSbSelect<NrmSupabaseInquiryRow>(NRM_SUPABASE_TABLES.inquiry, (q) => {
    let query = q
      .select('*')
      .order('created_date', { ascending: false })
      .order('id', { ascending: false });
    if (signal) {
      query = query.abortSignal(signal);
    }
    return query;
  });
  const items: NrmInquiryItem[] = [];
  for (const row of rows) {
    const item = mapInquiryRow(row);
    if (item) items.push(item);
  }
  return items;
}

export async function fetchAllInquiriesForAdmin(signal?: AbortSignal): Promise<NrmInquiryItem[]> {
  return sortInquiriesByCreatedDesc(await fetchInquiryRows(signal));
}

export async function fetchAllInquiriesForAdminViaApi(): Promise<NrmInquiryItem[]> {
  return fetchAllInquiriesForAdmin();
}

export async function fetchInquiriesForApp(signal?: AbortSignal): Promise<NrmInquiryItem[]> {
  const serial = (await getNrmAppSerialNo()).trim();
  if (!serial) return [];

  const nowMs = Date.now();
  const items = await fetchInquiryRows(signal);
  return sortInquiriesByCreatedDesc(
    items.filter(
      (item) =>
        item.SerialNo === serial && isWithinHistoryWindow(item.Createddate, nowMs),
    ),
  );
}
