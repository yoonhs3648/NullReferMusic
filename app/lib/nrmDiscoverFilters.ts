import type { NrmDiscoverYearFilter } from '@/lib/nrmMusicListTypes';

export type NrmDiscoverFilterOption<T extends string | number> = {
  value: T;
  label: string;
};

export const NRM_DISCOVER_YEAR_ALL = 'all' as const;
export const NRM_DISCOVER_GENRE_ALL = 'all';

export const NRM_DISCOVER_YEAR_OPTIONS: NrmDiscoverFilterOption<NrmDiscoverYearFilter>[] = [
  { value: 'all', label: '전체선택' },
  ...Array.from({ length: 26 }, (_, i) => {
    const year = 2025 - i;
    return { value: year as NrmDiscoverYearFilter, label: `${year}년` };
  }),
  { value: 'legacy', label: '~2000년' },
];

export function discoverYearLabel(value: NrmDiscoverYearFilter): string {
  const hit = NRM_DISCOVER_YEAR_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? '전체선택';
}
