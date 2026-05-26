/** Spotify Charts 기간별 — slug·날짜·주차 */

import {
  clampPeriodChartMonth,
  getPeriodChartCurrentDate,
  listPeriodChartSelectableMonths,
  listPeriodChartSelectableYears,
  type PeriodChartRegion,
} from '@/lib/nrmPeriodChartCatalog';

export type SpotifyPeriodChartKind = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const SPOTIFY_PERIOD_CHART_SINGLE_MAX = 200;
export const SPOTIFY_PERIOD_CHART_YEARLY_MAX = 1000;
/** Charts API 연속 호출 간격 (429 방지) */
export const SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS = 750;

export type SpotifyWeekInMonth = {
  weekIndex: number;
  fridayDay: number;
  anchor: string;
};

export function spotifyPeriodChartMaxRank(kind: SpotifyPeriodChartKind): number {
  return kind === 'yearly' ? SPOTIFY_PERIOD_CHART_YEARLY_MAX : SPOTIFY_PERIOD_CHART_SINGLE_MAX;
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

export function spotifyDailyChartSegment(year: number, month: number, day: number): string {
  const m = Math.min(12, Math.max(1, month));
  const d = Math.max(1, day);
  return `${year}-${pad2(m)}-${pad2(d)}`;
}

/** 해당 월의 금요일(주간 차트 anchor) 목록 — 4~5주 */
export function listSpotifyWeeksInMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): SpotifyWeekInMonth[] {
  const m = Math.min(12, Math.max(1, month));
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const maxDay =
    year === cy && m === cm ? Math.min(lastDay, now.getUTCDate()) : lastDay;
  const out: SpotifyWeekInMonth[] = [];
  let idx = 0;
  for (let d = 1; d <= maxDay; d++) {
    if (new Date(Date.UTC(year, m - 1, d)).getUTCDay() !== 5) continue;
    idx += 1;
    out.push({
      weekIndex: idx,
      fridayDay: d,
      anchor: `${year}-${pad2(m)}-${pad2(d)}`,
    });
  }
  return out;
}

export function listSpotifyWeekOfMonthOptions(
  year: number,
  month: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  return listSpotifyWeeksInMonth(year, month, now).map((w) => ({
    value: w.weekIndex,
    label: `${w.weekIndex}주`,
  }));
}

export function spotifyWeeklyAnchorForWeek(
  year: number,
  month: number,
  weekOfMonth: number,
  now: Date = new Date(),
): string | null {
  const weeks = listSpotifyWeeksInMonth(year, month, now);
  const hit = weeks.find((w) => w.weekIndex === weekOfMonth);
  return hit?.anchor ?? null;
}

export function clampSpotifyWeekOfMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  now: Date = new Date(),
): number {
  const weeks = listSpotifyWeeksInMonth(year, month, now);
  if (weeks.length === 0) return 1;
  if (weeks.some((w) => w.weekIndex === weekOfMonth)) return weekOfMonth;
  return weeks[weeks.length - 1]!.weekIndex;
}

export function defaultSpotifyWeekOfMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): number {
  const weeks = listSpotifyWeeksInMonth(year, month, now);
  if (weeks.length === 0) return 1;
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  if (year === cy && month === cm) {
    const today = now.getUTCDate();
    const containing =
      [...weeks].reverse().find((w) => w.fridayDay <= today) ?? weeks[weeks.length - 1];
    return containing!.weekIndex;
  }
  return weeks[weeks.length - 1]!.weekIndex;
}

export function spotifyPeriodChartKindLabel(kind: SpotifyPeriodChartKind): string {
  switch (kind) {
    case 'yearly':
      return '연간';
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
  { id: 'yearly', label: '연간' },
];

export function spotifyPeriodChartPlaylistLabel(query: {
  region: PeriodChartRegion;
  spotifyKind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
}): string {
  const region = query.region === 'kr' ? '한국' : '글로벌';
  const kind = spotifyPeriodChartKindLabel(query.spotifyKind);
  if (query.spotifyKind === 'yearly') {
    return `${region} · ${query.year} · ${kind}`;
  }
  if (query.spotifyKind === 'monthly') {
    return `${region} · ${query.year}.${query.month} · ${kind}`;
  }
  if (query.spotifyKind === 'weekly') {
    const anchor = spotifyWeeklyAnchorForWeek(
      query.year,
      query.month,
      query.weekOfMonth,
    );
    return `${region} · ${query.year}.${query.month} ${query.weekOfMonth}주${anchor ? ` (${anchor})` : ''} · ${kind}`;
  }
  return `${region} · ${query.year}.${query.month}.${query.day} · ${kind}`;
}

export function listSpotifyPeriodChartSelectableDays(
  year: number,
  month: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const m = Math.min(12, Math.max(1, month));
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const { year: cy, month: cm } = getPeriodChartCurrentDate(now);
  const maxDay =
    year === cy && m === cm ? Math.min(lastDay, now.getUTCDate()) : lastDay;
  return Array.from({ length: maxDay }, (_, i) => ({
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

export function createInitialSpotifyPeriodDate(now: Date = new Date()) {
  const { year, month } = getPeriodChartCurrentDate(now);
  return {
    year,
    month,
    day: now.getUTCDate(),
    weekOfMonth: defaultSpotifyWeekOfMonth(year, month, now),
  };
}

export {
  getPeriodChartCurrentDate,
  listPeriodChartSelectableYears,
  listPeriodChartSelectableMonths,
  clampPeriodChartMonth,
};
