export type SearchMenuPanel = 'search';

export type SearchLastfmKind = 'artist' | 'album' | 'track';

export type SearchLastfmRow = {
  kind: SearchLastfmKind;
  label: string;
  subtitle: string;
};

export const NRM_SEARCH_LASTFM_ROWS: SearchLastfmRow[] = [
  {
    kind: 'artist',
    label: '아티스트 검색',
    subtitle: '상세 · 유사 아티스트 · 인기곡 · 앨범 · 태그',
  },
  {
    kind: 'album',
    label: '앨범 검색',
    subtitle: '앨범 상세 · 태그',
  },
  {
    kind: 'track',
    label: '트랙 검색',
    subtitle: '곡 상세 · 유사 곡 · 태그',
  },
];

export function isSearchMenuPanel(panel: string): panel is SearchMenuPanel {
  return panel === 'search';
}
