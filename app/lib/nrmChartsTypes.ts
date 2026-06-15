export type ChartTrackItem = {
  rank: number;
  trackId: string;
  /** Last.fm 트랙 MusicBrainz ID (있을 때만) — UI 비표시 */
  mbid?: string;
  title: string;
  artists: string;
  album: string;
  /** Apple Music RSS 등에서만 채워질 수 있음 */
  genre?: string;
  imageUrl: string;
  externalUrl: string;
  durationMs: number;
  popularity: number;
  releaseDate: string;
};

/** 플랫폼 트랙 표시·확인 팝업용 `가수 - 제목` 라벨 */
export function chartTrackDisplayLabel(
  track: Pick<ChartTrackItem, 'artists' | 'title'>,
): string {
  const artist = (track.artists ?? '').trim();
  const title = (track.title ?? '').trim();
  if (artist && title) return `${artist} - ${title}`;
  return artist || title || '';
}

export type SpotifyChartPayload = {
  platform: string;
  playlistId: string;
  playlistName: string;
  market: string;
  fetchedAt: string;
  items: ChartTrackItem[];
};

import type { ChartErrorCode } from '@/lib/nrmChartErrors';

export type ChartFetchOutcome =
  | { ok: true; data: SpotifyChartPayload }
  | { ok: false; errorCode: ChartErrorCode };

/** @deprecated ChartFetchOutcome 사용 */
export type SpotifyChartOutcome = ChartFetchOutcome;
