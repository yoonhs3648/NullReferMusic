import type { NrmDiscoverYearFilter } from '@/lib/nrmMusicListTypes';

export type NrmDiscoverFilterOption<T extends string | number> = {
  value: T;
  label: string;
};

export const NRM_DISCOVER_YEAR_ALL = 'all' as const;
/** API에서 연도 미지정 시 전체 조회용 (UI 드롭다운에는 노출하지 않음) */
export const NRM_DISCOVER_GENRE_ALL = 'all';
/** Discover 장르 필터 기본값 */
export const NRM_DISCOVER_GENRE_DEFAULT = '글로벌';

/** Discover 연도 드롭다운 최상단(가장 최근) 연도 */
export const NRM_DISCOVER_YEAR_LATEST = 2025;
/** Discover 연도 필터 UI 기본값 */
export const NRM_DISCOVER_YEAR_DEFAULT: NrmDiscoverYearFilter = NRM_DISCOVER_YEAR_LATEST;

export const NRM_DISCOVER_YEAR_OPTIONS: NrmDiscoverFilterOption<NrmDiscoverYearFilter>[] = [
  ...Array.from({ length: 26 }, (_, i) => {
    const year = NRM_DISCOVER_YEAR_LATEST - i;
    return { value: year as NrmDiscoverYearFilter, label: `${year}년` };
  }),
  { value: 'legacy', label: '~2000년' },
];

export function discoverYearLabel(value: NrmDiscoverYearFilter): string {
  if (value === NRM_DISCOVER_YEAR_ALL) return '전체';
  const hit = NRM_DISCOVER_YEAR_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? `${value}년`;
}
