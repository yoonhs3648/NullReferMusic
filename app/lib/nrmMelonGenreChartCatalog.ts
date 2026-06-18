/** 멜론 장르별 기간 차트 — 장르·주간/월간/연간·날짜 선택 */

import {
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
} from '@/lib/nrmPeriodChartCatalog';
import {
  countSpotifyWeekSlotsInMonth,
  listSpotifyWeekOfMonthOptions,
  listSpotifyWeekSlotsInMonth,
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

/** Melon 시대별(연간) 차트 — chartGenre 파라미터 기준 3종만 존재 */
export const MELON_YEARLY_GENRE_OPTIONS = [
  { id: 'GN0000', label: '장르종합', chartGenre: 'GN0000' },
  { id: 'DM0000', label: '국내', chartGenre: 'KPOP' },
  { id: 'AB0000', label: '해외', chartGenre: 'POP' },
] as const;

export type MelonYearlyGenreId = (typeof MELON_YEARLY_GENRE_OPTIONS)[number]['id'];

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

export function listMelonGenreOptionsForKind(
  kind: MelonPeriodChartKind,
): readonly { id: MelonGenreId; label: string }[] {
  return kind === 'yearly' ? MELON_YEARLY_GENRE_OPTIONS : MELON_GENRE_OPTIONS;
}

export function melonGenreIndexForKind(classCd: MelonGenreId, kind: MelonPeriodChartKind): number {
  const options = listMelonGenreOptionsForKind(kind);
  const idx = options.findIndex((g) => g.id === classCd);
  return idx >= 0 ? idx : 0;
}

export function melonGenreByIndexForKind(index: number, kind: MelonPeriodChartKind): MelonGenreId {
  const options = listMelonGenreOptionsForKind(kind);
  return options[Math.min(options.length - 1, Math.max(0, index))]!.id;
}

const MELON_OVERSEAS_PERIOD_GENRE_IDS = new Set<MelonGenreId>([
  'AB0000',
  'GN0900',
  'GN1000',
  'GN1100',
  'GN1200',
  'GN1300',
  'GN1900',
]);

/** 연간 차트에 없는 classCd → 국내(DM0000) 또는 해외(AB0000)로 보정 */
export function clampMelonGenreForKind(
  classCd: MelonGenreId,
  kind: MelonPeriodChartKind,
): MelonGenreId {
  if (kind !== 'yearly') return classCd;
  if (classCd === 'GN0000' || classCd === 'DM0000' || classCd === 'AB0000') return classCd;
  return MELON_OVERSEAS_PERIOD_GENRE_IDS.has(classCd) ? 'AB0000' : 'DM0000';
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

function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** 오늘이 속한 주차 (1-based). 해당 월에 없으면 0 */
function currentMelonWeekOfMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): number {
  const today = utcToday(now).getTime();
  for (const slot of listSpotifyWeekSlotsInMonth(year, month, MELON_WEEK_ANCHOR_DOW)) {
    const [y, mo, d] = slot.anchor.split('-').map(Number);
    if (!y || !mo || !d) continue;
    const start = Date.UTC(y, mo - 1, d);
    const end = start + 6 * 24 * 60 * 60 * 1000;
    if (today >= start && today <= end) return slot.weekIndex;
  }
  return 0;
}

export function listMelonSelectableYears(
  kind: MelonPeriodChartKind,
  now: Date = new Date(),
): number[] {
  const years = listPeriodChartSelectableYears(now);
  if (kind !== 'yearly') return years;
  const cy = now.getFullYear();
  return years.filter((y) => y < cy);
}

export function listMelonWeekOfMonthOptions(
  year: number,
  month: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const options = listSpotifyWeekOfMonthOptions(year, month, MELON_WEEK_ANCHOR_DOW, now);
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  if (year !== cy || month !== cm) return options;
  const currentWeek = currentMelonWeekOfMonth(year, month, now);
  if (currentWeek <= 0) return options;
  return options.filter((o) => o.value < currentWeek);
}

export function clampMelonWeekOfMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  now: Date = new Date(),
): number {
  const allowed = listMelonWeekOfMonthOptions(year, month, now);
  if (allowed.length === 0) return 1;
  if (allowed.some((w) => w.value === weekOfMonth)) return weekOfMonth;
  return allowed[allowed.length - 1]!.value;
}

export function defaultMelonWeekOfMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): number {
  const allowed = listMelonWeekOfMonthOptions(year, month, now);
  if (allowed.length === 0) return 1;
  return allowed[allowed.length - 1]!.value;
}

export function listMelonSelectableMonths(
  year: number,
  now: Date = new Date(),
  kind: MelonPeriodChartKind = 'monthly',
): { value: number; label: string }[] {
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);

  if (kind === 'weekly') {
    const maxMonth = year === cy ? cm : 12;
    const out: { value: number; label: string }[] = [];
    for (let m = 1; m <= maxMonth; m++) {
      if (listMelonWeekOfMonthOptions(year, m, now).length > 0) {
        out.push({ value: m, label: `${m}월` });
      }
    }
    return out;
  }

  const lastMonth = year === cy ? cm - 1 : 12;
  if (lastMonth < 1) return [];
  return Array.from({ length: lastMonth }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}월`,
  }));
}

export function clampMelonMonth(
  year: number,
  month: number,
  now: Date = new Date(),
  kind: MelonPeriodChartKind = 'monthly',
): number {
  const allowed = listMelonSelectableMonths(year, now, kind);
  if (allowed.length === 0) return 1;
  if (allowed.some((m) => m.value === month)) return month;
  return allowed[allowed.length - 1]!.value;
}

export function melonPeriodChartPlaylistLabel(query: {
  kind: MelonPeriodChartKind;
  classCd: MelonGenreId;
  year: number;
  month: number;
  weekOfMonth: number;
}): string {
  const genre =
    listMelonGenreOptionsForKind(query.kind).find((g) => g.id === query.classCd)?.label ??
    query.classCd;
  if (query.kind === 'yearly') {
    return `${genre} · ${query.year} · 연간`;
  }
  if (query.kind === 'monthly') {
    return `${genre} · ${query.year}.${query.month} · 월간`;
  }
  const { startDay, endDay } = melonWeekRange(query.year, query.month, query.weekOfMonth);
  return `${genre} · ${formatYmdDisplay(startDay)} ~ ${formatYmdDisplay(endDay)} · 주간`;
}

/** 멜론 연간(시대별) 차트 chartGenre — GN0000 / KPOP / POP 만 유효 */
export function melonYearlyChartGenre(classCd: MelonGenreId): string {
  const yearlyId = clampMelonGenreForKind(classCd, 'yearly');
  const hit = MELON_YEARLY_GENRE_OPTIONS.find((g) => g.id === yearlyId);
  return hit?.chartGenre ?? 'GN0000';
}

export function createInitialMelonGenreChartDate(now: Date = new Date()) {
  const { year, month } = getPeriodChartCurrentDate(now);
  const monthOptions = listMelonSelectableMonths(year, now, 'weekly');
  const pickMonth =
    monthOptions.length > 0
      ? monthOptions[monthOptions.length - 1]!.value
      : Math.max(1, month - 1);
  const weekOptions = listMelonWeekOfMonthOptions(year, pickMonth, now);
  const pickWeek =
    weekOptions.length > 0
      ? weekOptions[weekOptions.length - 1]!.value
      : defaultMelonWeekOfMonth(year, pickMonth, now);
  return {
    year,
    month: pickMonth,
    weekOfMonth: pickWeek,
  };
}

export type MelonGenreDateSelection = {
  year: number;
  month: number;
  weekOfMonth: number;
};

export type MelonGenreTabSnapshot = MelonGenreDateSelection & {
  classCd: MelonGenreId;
};

/** 탭별 저장 장르가 해당 탭 옵션에 없을 때만 연간 보정 */
export function restoreMelonGenreForKind(
  classCd: MelonGenreId,
  kind: MelonPeriodChartKind,
): MelonGenreId {
  const options = listMelonGenreOptionsForKind(kind);
  if (options.some((g) => g.id === classCd)) return classCd;
  return clampMelonGenreForKind(classCd, kind);
}

/** 탭별 첫 진입 기본값 (이후 탭 전환 시에는 저장된 선택 복원) */
export function createDefaultMelonGenreChartDateForKind(
  kind: MelonPeriodChartKind,
  now: Date = new Date(),
): MelonGenreDateSelection {
  if (kind === 'weekly') {
    return createInitialMelonGenreChartDate(now);
  }
  if (kind === 'monthly') {
    const { year } = getPeriodChartCurrentDate(now);
    const months = listMelonSelectableMonths(year, now, 'monthly');
    const pickMonth = months.length > 0 ? months[months.length - 1]!.value : 1;
    return { year, month: pickMonth, weekOfMonth: 1 };
  }
  const years = listMelonSelectableYears('yearly', now);
  return {
    year: years.length > 0 ? years[0]! : now.getFullYear() - 1,
    month: 1,
    weekOfMonth: 1,
  };
}

export {
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
  countSpotifyWeekSlotsInMonth,
};
