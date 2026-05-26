import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

/** 오디오 파일에 쓸 ID3/컨테이너 메타데이터 (빈 문자열 = 태그 미설정) */
export type NrmAudioFileMetadata = {
  artist: string;
  title: string;
  album: string;
  genre: string;
  releaseDate: string;
  coverUrl: string;
};

export type NrmDownloadMetadataSource = 'mainSearch' | 'chart' | 'lastfm';

/** 메인 검색: 가수·곡 제목만 사용자 입력, 나머지 비움 */
export function buildMainSearchAudioMetadata(
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: '',
    genre: '',
    releaseDate: '',
    coverUrl: '',
  };
}

/** 차트 플랫폼 API 필드 + 가수·곡 제목은 사용자가 모달에서 확정한 값 */
export function buildChartAudioMetadata(
  track: ChartTrackItem,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: (track.album ?? '').trim(),
    genre: (track.genre ?? '').trim(),
    releaseDate: (track.releaseDate ?? '').trim(),
    coverUrl: (track.imageUrl ?? '').trim(),
  };
}

/** Last.fm·차트와 동일 필드 — 가수·곡 제목만 사용자 확정 */
export function buildPlatformTrackAudioMetadata(
  fields: {
    album?: string;
    genre?: string;
    releaseDate?: string;
    imageUrl?: string;
  },
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: (fields.album ?? '').trim(),
    genre: (fields.genre ?? '').trim(),
    releaseDate: (fields.releaseDate ?? '').trim(),
    coverUrl: (fields.imageUrl ?? '').trim(),
  };
}

export function hasEmbeddableAudioMetadata(meta: NrmAudioFileMetadata): boolean {
  return !!(
    meta.artist ||
    meta.title ||
    meta.album ||
    meta.genre ||
    meta.releaseDate ||
    meta.coverUrl
  );
}
