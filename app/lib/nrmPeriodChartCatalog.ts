/** 기간별 차트 — 연·연월, 한국·글로벌 */

export type PeriodChartRegion = 'kr' | 'global';
export type PeriodChartGranularity = 'year' | 'month';
export type PeriodChartPlatform = 'spotify' | 'lastfm';

export const PERIOD_CHART_PAGE_SIZE = 50;
export const PERIOD_CHART_MAX_RANK = 1000;

/** 기간별 차트 연도 선택 하한 */
export const PERIOD_CHART_YEAR_MIN = 1996;

export type PeriodChartDateParts = {
  year: number;
  month: number;
  day?: number;
};

export function getPeriodChartCurrentDate(
  now: Date = new Date(),
): PeriodChartDateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** 1996 ~ 현재 연도 (내림차순) */
export function listPeriodChartSelectableYears(
  now: Date = new Date(),
): number[] {
  const end = now.getFullYear();
  const years: number[] = [];
  for (let y = end; y >= PERIOD_CHART_YEAR_MIN; y--) {
    years.push(y);
  }
  return years;
}

/** 선택 연도 기준 선택 가능 월 (현재 연도면 1~현재 월, 과거 연도면 1~12) */
export function listPeriodChartSelectableMonths(
  year: number,
  now: Date = new Date(),
): { value: number; label: string }[] {
  const { year: currentYear, month: currentMonth } = getPeriodChartCurrentDate(now);
  const maxMonth = year === currentYear ? currentMonth : 12;
  return Array.from({ length: maxMonth }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}월`,
  }));
}

/** 연 변경 시 월이 범위 밖이면 허용 최대 월(현재 연도) 또는 1월로 보정 */
export function clampPeriodChartMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): number {
  const allowed = listPeriodChartSelectableMonths(year, now);
  if (allowed.length === 0) return 1;
  const max = allowed[allowed.length - 1]!.value;
  if (month > max) return max;
  if (month < 1) return 1;
  if (!allowed.some((m) => m.value === month)) return allowed[0]!.value;
  return month;
}

/** @deprecated listPeriodChartSelectableYears() 사용 */
export function listPeriodChartYears(now?: Date): number[] {
  return listPeriodChartSelectableYears(now);
}

/** @deprecated listPeriodChartSelectableMonths(year) 사용 */
export function listPeriodChartMonths(year?: number, now?: Date): { value: number; label: string }[] {
  const y = year ?? getPeriodChartCurrentDate(now).year;
  return listPeriodChartSelectableMonths(y, now);
}

export function periodChartRegionLabel(region: PeriodChartRegion): string {
  return region === 'kr' ? '한국' : '글로벌';
}

export function periodChartGranularityLabel(g: PeriodChartGranularity): string {
  return g === 'year' ? '연도' : '연·월';
}

export function periodChartPlaylistLabel(query: {
  region: PeriodChartRegion;
  granularity: PeriodChartGranularity;
  year: number;
  month: number;
}): string {
  const region = query.region === 'kr' ? '한국' : '글로벌';
  if (query.granularity === 'month') {
    return `${region} · ${query.year}.${query.month}`;
  }
  return `${region} · ${query.year}`;
}

export function buildLastfmPeriodUnixRange(
  year: number,
  granularity: PeriodChartGranularity,
  month: number,
): { from: number; to: number } {
  if (granularity === 'month') {
    const m = Math.min(12, Math.max(1, month)) - 1;
    const start = new Date(Date.UTC(year, m, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59));
    return {
      from: Math.floor(start.getTime() / 1000),
      to: Math.floor(end.getTime() / 1000),
    };
  }
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  return {
    from: Math.floor(start.getTime() / 1000),
    to: Math.floor(end.getTime() / 1000),
  };
}
