/** Spotify Charts 기간별 — slug·날짜·주차 (주간 anchor = 설정한 스냅샷 요일) */

import {
  clampPeriodChartMonth,
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
  type PeriodChartRegion,
} from '@/lib/nrmPeriodChartCatalog';
import {
  DEFAULT_WEEKLY_SNAPSHOT_DAY,
  type WeeklySnapshotDay,
} from '@/lib/nrmWeeklySnapshotSettings';

export type SpotifyPeriodChartKind = 'daily' | 'weekly' | 'monthly';

export const SPOTIFY_PERIOD_CHART_SINGLE_MAX = 200;
/** 일간 차트 선택 가능 최대일 = 오늘(UTC) − N일 */
export const SPOTIFY_DAILY_LAG_DAYS = 3;
/** Charts API 연속 호출 간격 (429 방지) */
export const SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS = 750;

export type SpotifyWeekInMonth = {
  weekIndex: number;
  /** weekly API 세그먼트 (해당 주 스냅샷 요일, YYYY-MM-DD) */
  anchor: string;
  /** anchor 날짜가 조회 월 안에 있는지 */
  snapshotInMonth: boolean;
};

export function spotifyPeriodChartMaxRank(_kind: SpotifyPeriodChartKind): number {
  return SPOTIFY_PERIOD_CHART_SINGLE_MAX;
}

export function buildSpotifyPeriodSlug(
  region: PeriodChartRegion,
  kind: 'daily' | 'weekly',
): string {
  const r = region === 'kr' ? 'kr' : 'global';
  return kind === 'daily' ? `regional-${r}-daily` : `regional-${r}-weekly`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function todayUtc(now: Date = new Date()): Date {
  return utcDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/** 일간 선택 상한일 (UTC, 오늘 − 3일) */
export function spotifyMaxSelectableUtcDate(now: Date = new Date()): Date {
  const d = todayUtc(now);
  d.setUTCDate(d.getUTCDate() - SPOTIFY_DAILY_LAG_DAYS);
  return d;
}

/** 해당 일(UTC)이 속한 주의 일요일 */
function sundayOnOrBeforeUtc(year: number, month: number, day: number): Date {
  const d = utcDate(year, month, day);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

/** 달력 그리드상 해당 월 주차 수 (보통 4~6) */
export function countSpotifyWeekSlotsInMonth(year: number, month: number): number {
  const m = Math.min(12, Math.max(1, month));
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const firstDow = utcDate(year, m, 1).getUTCDay();
  return Math.ceil((lastDay + firstDow) / 7);
}

/** N번째 주 슬롯의 스냅샷 요일 날짜 (0=일 … 6=토) */
export function spotifySnapshotAnchorForWeekSlot(
  year: number,
  month: number,
  weekIndex: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
): string {
  const week1Sunday = sundayOnOrBeforeUtc(year, month, 1);
  const d = new Date(week1Sunday.getTime());
  d.setUTCDate(d.getUTCDate() + 7 * (weekIndex - 1) + snapshotDow);
  return formatYmd(d);
}

/** 스냅샷 날짜가 오늘(UTC)보다 이전인지 — 당일은 아직 지나지 않음 */
export function spotifySnapshotAnchorHasPassed(
  anchorYmd: string,
  now: Date = new Date(),
): boolean {
  const [y, mo, d] = anchorYmd.split('-').map(Number);
  if (!y || !mo || !d) return false;
  return utcDate(y, mo, d).getTime() < todayUtc(now).getTime();
}

export function listSpotifyWeekSlotsInMonth(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
): SpotifyWeekInMonth[] {
  const m = Math.min(12, Math.max(1, month));
  const total = countSpotifyWeekSlotsInMonth(year, m);
  const out: SpotifyWeekInMonth[] = [];
  for (let i = 1; i <= total; i++) {
    const anchor = spotifySnapshotAnchorForWeekSlot(year, m, i, snapshotDow);
    const [ay, am] = anchor.split('-').map(Number);
    out.push({
      weekIndex: i,
      anchor,
      snapshotInMonth: ay === year && am === m,
    });
  }
  return out;
}

/** 현재 월 — 스냅샷 요일이 지난 주까지 선택 가능 */
export function maxSelectableSpotifyWeekOfMonth(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): number {
  const slots = listSpotifyWeekSlotsInMonth(year, month, snapshotDow);
  if (slots.length === 0) return 1;
  let maxWeek = 0;
  for (const w of slots) {
    if (spotifySnapshotAnchorHasPassed(w.anchor, now)) {
      maxWeek = w.weekIndex;
    }
  }
  return maxWeek > 0 ? maxWeek : 1;
}

/** 해당 월에 스냅샷 요일이 달 안에서 한 번이라도 지났는지 (월간 드롭다운용) */
export function spotifyMonthHasPassedSnapshotDay(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): boolean {
  return listSpotifyWeekSlotsInMonth(year, month, snapshotDow).some((w) => {
    const [ay, am] = w.anchor.split('-').map(Number);
    return ay === year && am === month && spotifySnapshotAnchorHasPassed(w.anchor, now);
  });
}

/** 월간 합산용 주 목록 */
export function listSpotifyWeeksInMonth(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): SpotifyWeekInMonth[] {
  const slots = listSpotifyWeekSlotsInMonth(year, month, snapshotDow);
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  if (year < cy || (year === cy && month < cm)) {
    return slots;
  }
  if (year === cy && month === cm) {
    return slots.filter((w) => spotifySnapshotAnchorHasPassed(w.anchor, now));
  }
  return slots;
}

export function listSpotifyWeekOfMonthOptions(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const slots = listSpotifyWeekSlotsInMonth(year, month, snapshotDow);
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const maxWeek =
    year === cy && month === cm
      ? maxSelectableSpotifyWeekOfMonth(year, month, snapshotDow, now)
      : slots.length;
  return slots
    .filter((w) => w.weekIndex <= maxWeek)
    .map((w) => ({
      value: w.weekIndex,
      label: `${w.weekIndex}주`,
    }));
}

export function listSpotifyMonthlySelectableMonths(
  year: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const lastMonth = year === cy ? cm : 12;
  const out: { value: number; label: string }[] = [];
  for (let m = 1; m <= lastMonth; m++) {
    if (year === cy && m === cm) {
      if (!spotifyMonthHasPassedSnapshotDay(year, m, snapshotDow, now)) {
        continue;
      }
    }
    out.push({ value: m, label: `${m}월` });
  }
  return out;
}

export function clampSpotifyMonthlyMonth(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): number {
  const allowed = listSpotifyMonthlySelectableMonths(year, snapshotDow, now);
  if (allowed.length === 0) return 1;
  if (allowed.some((o) => o.value === month)) return month;
  return allowed[allowed.length - 1]!.value;
}

export function spotifyWeeklyAnchorForWeek(
  year: number,
  month: number,
  weekOfMonth: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
): string | null {
  const hit = listSpotifyWeekSlotsInMonth(year, month, snapshotDow).find(
    (w) => w.weekIndex === weekOfMonth,
  );
  return hit?.anchor ?? null;
}

export function clampSpotifyWeekOfMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): number {
  const slots = listSpotifyWeekSlotsInMonth(year, month, snapshotDow);
  if (slots.length === 0) return 1;
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const maxWeek =
    year === cy && month === cm
      ? maxSelectableSpotifyWeekOfMonth(year, month, snapshotDow, now)
      : slots[slots.length - 1]!.weekIndex;
  if (weekOfMonth < 1) return 1;
  if (weekOfMonth > maxWeek) return maxWeek;
  if (slots.some((w) => w.weekIndex === weekOfMonth)) return weekOfMonth;
  return maxWeek;
}

export function defaultSpotifyWeekOfMonth(
  year: number,
  month: number,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): number {
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  if (year === cy && month === cm) {
    return maxSelectableSpotifyWeekOfMonth(year, month, snapshotDow, now);
  }
  const slots = listSpotifyWeekSlotsInMonth(year, month, snapshotDow);
  return slots.length > 0 ? slots[slots.length - 1]!.weekIndex : 1;
}

export function spotifyPeriodChartKindLabel(kind: SpotifyPeriodChartKind): string {
  switch (kind) {
    case 'monthly':
      return '월간';
    case 'weekly':
      return '주간';
    case 'daily':
      return '일간';
  }
}

export const SPOTIFY_PERIOD_KIND_TABS: { id: SpotifyPeriodChartKind; label: string }[] = [
  { id: 'daily', label: '일간' },
  { id: 'weekly', label: '주간' },
  { id: 'monthly', label: '월간' },
];

export function spotifyPeriodChartPlaylistLabel(query: {
  region: PeriodChartRegion;
  spotifyKind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
  snapshotDow?: number;
}): string {
  const region = query.region === 'kr' ? '한국' : '글로벌';
  const kind = spotifyPeriodChartKindLabel(query.spotifyKind);
  const dow = query.snapshotDow ?? DEFAULT_WEEKLY_SNAPSHOT_DAY;
  if (query.spotifyKind === 'monthly') {
    return `${region} · ${query.year}.${query.month} · ${kind}`;
  }
  if (query.spotifyKind === 'weekly') {
    const anchor = spotifyWeeklyAnchorForWeek(
      query.year,
      query.month,
      query.weekOfMonth,
      dow,
    );
    return `${region} · ${query.year}.${query.month} ${query.weekOfMonth}주${anchor ? ` (${anchor})` : ''} · ${kind}`;
  }
  return `${region} · ${query.year}.${query.month}.${query.day} · ${kind}`;
}

export function spotifyDailyChartSegment(year: number, month: number, day: number): string {
  const m = Math.min(12, Math.max(1, month));
  const d = Math.max(1, day);
  return `${year}-${pad2(m)}-${pad2(d)}`;
}

export function listSpotifyPeriodChartSelectableDays(
  year: number,
  month: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const m = Math.min(12, Math.max(1, month));
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const maxSelectable = spotifyMaxSelectableUtcDate(now);
  const maxY = maxSelectable.getUTCFullYear();
  const maxM = maxSelectable.getUTCMonth() + 1;
  const maxD = maxSelectable.getUTCDate();

  if (year > maxY || (year === maxY && m > maxM)) {
    return [];
  }

  const endDay =
    year === maxY && m === maxM ? Math.min(lastDay, maxD) : lastDay;

  if (endDay < 1) return [];

  return Array.from({ length: endDay }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}일`,
  }));
}

export function clampSpotifyPeriodChartDay(
  year: number,
  month: number,
  day: number,
  now: Date = new Date(),
): number {
  const allowed = listSpotifyPeriodChartSelectableDays(year, month, now);
  if (allowed.length === 0) return 1;
  const max = allowed[allowed.length - 1]!.value;
  if (day > max) return max;
  if (day < 1) return 1;
  if (!allowed.some((d) => d.value === day)) return allowed[0]!.value;
  return day;
}

export function clampSpotifyPeriodChartMonth(
  year: number,
  month: number,
  kind: SpotifyPeriodChartKind,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): number {
  if (kind === 'monthly') {
    return clampSpotifyMonthlyMonth(year, month, snapshotDow, now);
  }
  return clampPeriodChartMonth(year, month, now);
}

export function listSpotifyPeriodChartSelectableMonths(
  year: number,
  kind: SpotifyPeriodChartKind,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): { value: number; label: string }[] {
  if (kind === 'monthly') {
    return listSpotifyMonthlySelectableMonths(year, snapshotDow, now);
  }
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const lastMonth = year === cy ? cm : 12;
  return Array.from({ length: lastMonth }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}월`,
  }));
}

export function createInitialSpotifyPeriodDate(
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
) {
  const max = spotifyMaxSelectableUtcDate(now);
  const year = max.getUTCFullYear();
  const month = max.getUTCMonth() + 1;
  const day = max.getUTCDate();
  return {
    year,
    month,
    day,
    weekOfMonth: defaultSpotifyWeekOfMonth(year, month, snapshotDow, now),
  };
}

export type SpotifyPeriodDateSelection = {
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
};

/** 탭별 첫 진입 기본값 (이후 탭 전환 시에는 저장된 선택 복원) */
export function createDefaultSpotifyPeriodDateForKind(
  kind: SpotifyPeriodChartKind,
  snapshotDow: number = DEFAULT_WEEKLY_SNAPSHOT_DAY,
  now: Date = new Date(),
): SpotifyPeriodDateSelection {
  const base = createInitialSpotifyPeriodDate(snapshotDow, now);
  if (kind === 'daily') {
    return base;
  }
  if (kind === 'weekly') {
    return {
      ...base,
      weekOfMonth: defaultSpotifyWeekOfMonth(base.year, base.month, snapshotDow, now),
    };
  }
  const { year } = getPeriodChartCurrentDate(now);
  const months = listSpotifyMonthlySelectableMonths(year, snapshotDow, now);
  const pickMonth = months.length > 0 ? months[months.length - 1]!.value : base.month;
  return {
    year,
    month: pickMonth,
    day: 1,
    weekOfMonth: 1,
  };
}

export {
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
  clampPeriodChartMonth,
};

export type { WeeklySnapshotDay };
