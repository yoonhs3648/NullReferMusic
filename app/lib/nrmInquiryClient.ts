import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { fetchGithubJsonDocument, resolveGithubDataPat } from '@/lib/nrmGithubContentsApi';
import { fetchGithubRawJson } from '@/lib/nrmGithubRawFetch';
import {
  NRM_INQUIRY_HISTORY_DAYS,
  NRM_INQUIRY_JSON_API_PATH,
  NRM_INQUIRY_JSON_RAW_URL,
} from '@/lib/nrmRemoteDataConfig';
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

type InquiryJson = {
  inquiry?: Array<{
    id?: number;
    userName?: string;
    SerialNo?: string;
    version?: string;
    content?: string;
    attachedFile?: string;
    isAnswered?: boolean;
    replyContent?: string;
    Createddate?: string;
  }>;
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

function normalizeInquiryRow(
  row: NonNullable<InquiryJson['inquiry']>[number],
): NrmInquiryItem | null {
  const id = row.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  return {
    id,
    userName: String(row.userName ?? '').trim(),
    SerialNo: String(row.SerialNo ?? '').trim(),
    version: String(row.version ?? '').trim(),
    content: String(row.content ?? ''),
    attachedFile: String(row.attachedFile ?? '').trim(),
    isAnswered: row.isAnswered === true,
    replyContent: String(row.replyContent ?? ''),
    Createddate: String(row.Createddate ?? '').trim(),
  };
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
  const json = await fetchGithubRawJson<InquiryJson>(NRM_INQUIRY_JSON_RAW_URL, { signal });
  const rows = Array.isArray(json.inquiry) ? json.inquiry : [];
  const items: NrmInquiryItem[] = [];
  for (const row of rows) {
    const item = normalizeInquiryRow(row);
    if (item) items.push(item);
  }
  return items;
}

export async function fetchAllInquiriesForAdmin(signal?: AbortSignal): Promise<NrmInquiryItem[]> {
  const items = await fetchInquiryRows(signal);
  return sortInquiriesByCreatedDesc(items);
}

/** GitHub Contents API로 최신 inquiry.json 조회 (관리자 패널 — CDN 캐시 우회) */
export async function fetchAllInquiriesForAdminViaApi(): Promise<NrmInquiryItem[]> {
  const pat = await resolveGithubDataPat();
  const { doc } = await fetchGithubJsonDocument<InquiryJson>(
    NRM_INQUIRY_JSON_API_PATH,
    pat,
    { inquiry: [] },
  );
  const rows = Array.isArray(doc.inquiry) ? doc.inquiry : [];
  const items: NrmInquiryItem[] = [];
  for (const row of rows) {
    const item = normalizeInquiryRow(row);
    if (item) items.push(item);
  }
  return sortInquiriesByCreatedDesc(items);
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
