export type ChartTrackItem = {
  rank: number;
  trackId: string;
  title: string;
  artists: string;
  album: string;
  imageUrl: string;
  externalUrl: string;
  durationMs: number;
};

export type SpotifyChartPayload = {
  platform: string;
  playlistId: string;
  playlistName: string;
  market: string;
  fetchedAt: string;
  items: ChartTrackItem[];
};

export type SpotifyChartOutcome =
  | { ok: true; data: SpotifyChartPayload }
  | { ok: false; message: string };
