/** 멜론 장르별 기간 차트 — 장르·주간/월간/연간·날짜 선택 */

import {
  clampPeriodChartMonth,
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
} from '@/lib/nrmPeriodChartCatalog';
import {
  clampSpotifyWeekOfMonth,
  countSpotifyWeekSlotsInMonth,
  defaultSpotifyWeekOfMonth,
  listSpotifyWeekOfMonthOptions,
  spotifySnapshotAnchorForWeekSlot,
} from '@/lib/nrmSpotifyPeriodChartCatalog';

export type MelonPeriodChartKind = 'weekly' | 'monthly' | 'yearly';

export const MELON_PERIOD_MAX_RANK = 100;
export const MELON_PERIOD_PAGE_SIZE = 50;

/** 멜론 주간 차트 주 시작 요일 (월요일) */
export const MELON_WEEK_ANCHOR_DOW = 1;

export const MELON_GENRE_OPTIONS = [
  { id: 'GN0000', label: '장르종합' },
  { id: 'DM0000', label: '국내종합' },
  { id: 'AB0000', label: '해외종합' },
  { id: 'GN0300', label: '국내 랩/힙합' },
  { id: 'GN0400', label: '국내 R&B/Soul' },
  { id: 'GN0100', label: '발라드' },
  { id: 'GN0200', label: '댄스' },
  { id: 'GN0500', label: '인디음악' },
  { id: 'GN0600', label: '국내 록/메탈' },
  { id: 'GN0900', label: 'POP' },
  { id: 'GN1200', label: '해외 랩/힙합' },
  { id: 'GN1300', label: '해외 R&B/Soul' },
  { id: 'GN1000', label: '해외 록/메탈' },
  { id: 'GN1100', label: '일렉트로니카' },
  { id: 'GN1500', label: 'OST' },
  { id: 'GN1900', label: 'J-POP' },
] as const;

export type MelonGenreId = (typeof MELON_GENRE_OPTIONS)[number]['id'];

export const MELON_DEFAULT_GENRE_ID: MelonGenreId = 'GN0000';

export const MELON_PERIOD_KIND_TABS: { id: MelonPeriodChartKind; label: string }[] = [
  { id: 'weekly', label: '주간' },
  { id: 'monthly', label: '월간' },
  { id: 'yearly', label: '연간' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmdCompact(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

function formatYmdDisplay(ymd: string): string {
  if (ymd.length !== 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

export function melonGenreIndex(classCd: MelonGenreId): number {
  const idx = MELON_GENRE_OPTIONS.findIndex((g) => g.id === classCd);
  return idx >= 0 ? idx : 0;
}

export function melonGenreByIndex(index: number): MelonGenreId {
  return MELON_GENRE_OPTIONS[Math.min(MELON_GENRE_OPTIONS.length - 1, Math.max(0, index))]!.id;
}

export function melonGenreLabel(classCd: MelonGenreId): string {
  return MELON_GENRE_OPTIONS.find((g) => g.id === classCd)?.label ?? classCd;
}

export function melonWeekRange(
  year: number,
  month: number,
  weekOfMonth: number,
): { startDay: string; endDay: string } {
  const anchor = spotifySnapshotAnchorForWeekSlot(year, month, weekOfMonth, MELON_WEEK_ANCHOR_DOW);
  if (!anchor) {
    return { startDay: `${year}${pad2(month)}01`, endDay: `${year}${pad2(month)}07` };
  }
  const [y, mo, d] = anchor.split('-').map(Number);
  const start = utcDate(y!, mo!, d!);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  return { startDay: formatYmdCompact(start), endDay: formatYmdCompact(end) };
}

export function listMelonWeekOfMonthOptions(
  year: number,
  month: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  return listSpotifyWeekOfMonthOptions(year, month, MELON_WEEK_ANCHOR_DOW, now);
}

export function clampMelonWeekOfMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  now: Date = new Date(),
): number {
  return clampSpotifyWeekOfMonth(year, month, weekOfMonth, MELON_WEEK_ANCHOR_DOW, now);
}

export function defaultMelonWeekOfMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): number {
  return defaultSpotifyWeekOfMonth(year, month, MELON_WEEK_ANCHOR_DOW, now);
}

export function listMelonSelectableMonths(
  year: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const lastMonth = year === cy ? cm : 12;
  return Array.from({ length: lastMonth }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}월`,
  }));
}

export function clampMelonMonth(year: number, month: number, now: Date = new Date()): number {
  return clampPeriodChartMonth(year, month, now);
}

export function melonPeriodChartPlaylistLabel(query: {
  kind: MelonPeriodChartKind;
  classCd: MelonGenreId;
  year: number;
  month: number;
  weekOfMonth: number;
}): string {
  const genre = melonGenreLabel(query.classCd);
  if (query.kind === 'yearly') {
    return `${genre} · ${query.year} · 연간`;
  }
  if (query.kind === 'monthly') {
    return `${genre} · ${query.year}.${query.month} · 월간`;
  }
  const { startDay, endDay } = melonWeekRange(query.year, query.month, query.weekOfMonth);
  return `${genre} · ${formatYmdDisplay(startDay)} ~ ${formatYmdDisplay(endDay)} · 주간`;
}

export function createInitialMelonGenreChartDate(now: Date = new Date()) {
  const { year, month } = getPeriodChartCurrentDate(now);
  return {
    year,
    month,
    weekOfMonth: defaultMelonWeekOfMonth(year, month, now),
  };
}

export {
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
  countSpotifyWeekSlotsInMonth,
};
