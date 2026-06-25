import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { countUnreadAlarmIds, pruneAlarmReadIds } from '@/lib/nrmAlarmReadState';
import { fetchGithubRawJson } from '@/lib/nrmGithubRawFetch';

import { NRM_ALARM_JSON_RAW_URL, NRM_ALARM_DISPLAY_DAYS } from '@/lib/nrmRemoteDataConfig';

/** 원격 알림 주기적 갱신 간격 */
export const NRM_ALARM_POLL_INTERVAL_MS = 1 * 60 * 1000;

export { NRM_ALARM_DISPLAY_DAYS };

export type NrmAlarmItem = {
  id: number;
  isNoti: boolean;
  title: string;
  content: string;
  SerialNo: string;
  date: string;
};

type AlarmJson = {
  alarm?: Array<{
    id?: number;
    isNoti?: boolean;
    title?: string;
    content?: string;
    SerialNo?: string | null;
    date?: string;
  }>;
};

type AlarmMemoryCache = {
  items: NrmAlarmItem[];
  fetchedAt: number;
  appSerialNo: string;
};

let memoryCache: AlarmMemoryCache | null = null;
let inflight: Promise<NrmAlarmItem[]> | null = null;

function parseAlarmDateMs(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const ms = new Date(y, mo, d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isWithinDisplayWindow(dateStr: string, nowMs: number): boolean {
  const itemMs = parseAlarmDateMs(dateStr);
  if (itemMs === null) return false;
  const cutoff = nowMs - NRM_ALARM_DISPLAY_DAYS * 24 * 60 * 60 * 1000;
  return itemMs >= cutoff;
}

function isSerialVisible(alarmSerial: string, appSerial: string): boolean {
  const app = appSerial.trim();
  if (!app) return false;
  const target = alarmSerial.trim();
  if (!target) return true;
  return target === app;
}

function normalizeAlarmRow(
  row: NonNullable<AlarmJson['alarm']>[number],
): NrmAlarmItem | null {
  const id = row.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  const title = String(row.title ?? '').trim();
  const content = String(row.content ?? '');
  const date = String(row.date ?? '').trim();
  if (!title || !date) return null;
  return {
    id,
    isNoti: row.isNoti === true,
    title,
    content,
    SerialNo: String(row.SerialNo ?? '').trim(),
    date,
  };
}

function sortAlarms(items: NrmAlarmItem[]): NrmAlarmItem[] {
  return [...items].sort((a, b) => {
    // 공지(isNoti=true)를 먼저, 그룹 안에서는 최신순(date 내림차순 → id 내림차순)
    if (a.isNoti !== b.isNoti) return a.isNoti ? -1 : 1;
    const da = parseAlarmDateMs(a.date) ?? 0;
    const db = parseAlarmDateMs(b.date) ?? 0;
    if (db !== da) return db - da;
    return b.id - a.id;
  });
}

function filterAlarms(
  rows: NrmAlarmItem[],
  appSerialNo: string,
  nowMs: number,
): NrmAlarmItem[] {
  return sortAlarms(
    rows.filter(
      (row) =>
        isWithinDisplayWindow(row.date, nowMs) &&
        isSerialVisible(row.SerialNo, appSerialNo),
    ),
  );
}

async function fetchAlarmPayload(signal?: AbortSignal): Promise<NrmAlarmItem[]> {
  const json = await fetchGithubRawJson<AlarmJson>(NRM_ALARM_JSON_RAW_URL, { signal });
  const rows = Array.isArray(json.alarm) ? json.alarm : [];
  const normalized: NrmAlarmItem[] = [];
  for (const row of rows) {
    const item = normalizeAlarmRow(row);
    if (item) normalized.push(item);
  }
  return normalized;
}

export function peekAlarmCache(maxAgeMs = NRM_ALARM_POLL_INTERVAL_MS): NrmAlarmItem[] | null {
  const cached = memoryCache;
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > maxAgeMs) return null;
  return cached.items;
}

export async function fetchAlarmsForApp(options?: {
  force?: boolean;
  signal?: AbortSignal;
}): Promise<NrmAlarmItem[]> {
  const force = options?.force === true;
  if (force) {
    memoryCache = null;
  } else {
    const peek = peekAlarmCache();
    if (peek) return peek;
  }

  if (inflight) {
    if (!force) return inflight;
    try {
      await inflight;
    } catch {
      /* force 재조회 */
    }
  }

  inflight = (async () => {
    const appSerialNo = await getNrmAppSerialNo();
    const nowMs = Date.now();
    if (!appSerialNo.trim()) {
      memoryCache = { items: [], fetchedAt: nowMs, appSerialNo: '' };
      return [];
    }
    const raw = await fetchAlarmPayload(options?.signal);
    const items = filterAlarms(raw, appSerialNo, nowMs);
    memoryCache = { items, fetchedAt: nowMs, appSerialNo };
    await pruneAlarmReadIds(items.map((row) => row.id));
    return items;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function getUnreadAlarmCount(items: NrmAlarmItem[]): Promise<number> {
  return countUnreadAlarmIds(items.map((row) => row.id));
}

export function invalidateAlarmCache(): void {
  memoryCache = null;
}
