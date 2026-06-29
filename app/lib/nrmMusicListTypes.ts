/** Discover 연도 필터: 전체 | 연도 숫자 | ~2000(1999 이하) */
export type NrmDiscoverYearFilter = 'all' | 'legacy' | number;

export type NrmMusicListItem = {
  id: number;
  rank: number;
  year: number;
  artist: string;
  title: string;
  album: string;
  genre: string;
  /** 관리자 화면 전용 (미수정 시 null) */
  updatedAt?: string | null;
};

export type NrmMusicListTextSearchField = 'artist' | 'title' | 'album';

export const NRM_MUSIC_LIST_PAGE_SIZE = 50;

export const NRM_MUSIC_LIST_GENRE_CUSTOM = '__custom__' as const;
