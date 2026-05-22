export type ChartTrackItem = {
  rank: number;
  trackId: string;
  title: string;
  artists: string;
  album: string;
  imageUrl: string;
  externalUrl: string;
  durationMs: number;
  popularity: number;
  releaseDate: string;
};

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
