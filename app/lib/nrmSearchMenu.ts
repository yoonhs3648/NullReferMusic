import type { ChartPlatformIconKey } from '@/lib/nrmChartsPlatforms';

export type SearchMenuPanel = 'search' | 'searchSpotify' | 'searchLastfm' | 'searchMelon';

export type SearchKind = 'artist' | 'album' | 'track';

/** @deprecated SearchKind 사용 */
export type SearchLastfmKind = SearchKind;

export type SearchSpotifyKind = SearchKind;

export type SearchPlatformId = 'spotify' | 'lastfm' | 'melon';

export type SearchPlatformRow = {
  id: SearchPlatformId;
  label: string;
  iconKey: ChartPlatformIconKey;
};

/** 검색 메뉴 플랫폼 (표시 순서) */
export const NRM_SEARCH_PLATFORM_ROWS: SearchPlatformRow[] = [
  { id: 'lastfm', label: 'Last.fm', iconKey: 'lastfm' },
  { id: 'spotify', label: 'Spotify (Premium)', iconKey: 'spotify' },
  { id: 'melon', label: 'Melon', iconKey: 'melon' },
];

export function getSearchPlatformLabel(id: SearchPlatformId): string {
  return NRM_SEARCH_PLATFORM_ROWS.find((r) => r.id === id)?.label ?? id;
}

export type SearchKindRow = {
  kind: SearchKind;
  label: string;
};

export const NRM_SEARCH_KIND_ROWS: SearchKindRow[] = [
  { kind: 'artist', label: '아티스트 검색' },
  { kind: 'album', label: '앨범 검색' },
  { kind: 'track', label: '트랙 검색' },
];

/** @deprecated NRM_SEARCH_KIND_ROWS 사용 */
export const NRM_SEARCH_LASTFM_ROWS = NRM_SEARCH_KIND_ROWS;

export function isSearchMenuPanel(panel: string): panel is SearchMenuPanel {
  return (
    panel === 'search' ||
    panel === 'searchSpotify' ||
    panel === 'searchLastfm' ||
    panel === 'searchMelon'
  );
}
