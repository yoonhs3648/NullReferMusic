import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';
import type {
  LastfmAlbumDetail,
  LastfmArtistDetail,
  LastfmTag,
  LastfmTrackDetail,
} from '@/lib/nrmLastfmSearchTypes';

function joinTags(tags: LastfmTag[], max = 3): string {
  return tags
    .map((t) => t.name.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(', ');
}

/** Last.fm 트랙 상세 → 다운로드 메타 (가수·곡 제목은 사용자 확정값) */
export function buildLastfmTrackAudioMetadata(
  detail: LastfmTrackDetail,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  const info = detail.info;
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: (info.album ?? '').trim(),
    genre: joinTags(detail.tags),
    releaseDate: '',
    coverUrl: (info.imageUrl ?? '').trim(),
  };
}

/** Last.fm 앨범 상세 → 다운로드 메타 (곡 제목 없을 때 앨범명을 title 대용) */
export function buildLastfmAlbumAudioMetadata(
  detail: LastfmAlbumDetail,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  const info = detail.info;
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: (info.name ?? '').trim(),
    genre: joinTags(detail.tags),
    releaseDate: (info.published ?? '').trim(),
    coverUrl: (info.imageUrl ?? '').trim(),
  };
}

/** Last.fm 아티스트 상세 → 다운로드 메타 (트랙명 없을 때 아티스트명을 title 대용) */
export function buildLastfmArtistAudioMetadata(
  detail: LastfmArtistDetail,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  const info = detail.info;
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: '',
    genre: joinTags(detail.tags),
    releaseDate: '',
    coverUrl: (info.imageUrl ?? '').trim(),
  };
}

/** YouTube·다운로드 모달용 ChartTrackItem 호환 필드 */
export function lastfmFieldsToChartTrack(fields: {
  artist: string;
  title: string;
  mbid?: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  imageUrl?: string;
}): import('@/lib/nrmChartsTypes').ChartTrackItem {
  const mbid = (fields.mbid ?? '').trim();
  return {
    rank: 0,
    trackId: mbid || '',
    mbid: mbid || undefined,
    title: fields.title,
    artists: fields.artist,
    album: fields.album ?? '',
    genre: fields.genre,
    imageUrl: normalizeCoverArtUrl(fields.imageUrl),
    externalUrl: '',
    durationMs: 0,
    popularity: 0,
    releaseDate: fields.releaseDate ?? '',
  };
}
