import type { ChartErrorCode } from '@/lib/nrmChartErrors';

export type SpotifyArtistSearchHit = {
  id: string;
  name: string;
  imageUrl: string;
  spotifyUrl: string;
  followers: number;
};

export type SpotifyArtistInfo = {
  id: string;
  name: string;
  imageUrl: string;
  spotifyUrl: string;
  followers: number;
  popularity: number;
  genres: string[];
};

export type SpotifyTrackSummary = {
  id: string;
  name: string;
  artists: string;
  imageUrl: string;
  spotifyUrl: string;
  durationMs: number;
  popularity: number;
};

export type SpotifyAlbumSummary = {
  id: string;
  name: string;
  artists: string;
  imageUrl: string;
  spotifyUrl: string;
  releaseDate: string;
};

export type SpotifyArtistDetail = {
  info: SpotifyArtistInfo;
  topTracks: SpotifyTrackSummary[];
  albums: SpotifyAlbumSummary[];
};

export type SpotifyAlbumSearchHit = {
  id: string;
  name: string;
  artists: string;
  imageUrl: string;
  spotifyUrl: string;
  releaseDate: string;
};

export type SpotifyAlbumTrack = {
  id: string;
  name: string;
  trackNumber: number;
  durationMs: number;
};

export type SpotifyAlbumInfo = {
  id: string;
  name: string;
  artists: string;
  imageUrl: string;
  spotifyUrl: string;
  releaseDate: string;
  totalTracks: number;
  label: string;
};

export type SpotifyAlbumDetail = {
  info: SpotifyAlbumInfo;
  tracks: SpotifyAlbumTrack[];
};

export type SpotifyTrackSearchHit = {
  id: string;
  name: string;
  artists: string;
  imageUrl: string;
  spotifyUrl: string;
  albumName: string;
  durationMs: number;
};

export type SpotifyTrackInfo = {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string;
  spotifyUrl: string;
  durationMs: number;
  popularity: number;
  previewUrl: string;
};

export type SpotifyTrackDetail = {
  info: SpotifyTrackInfo;
};

export type SpotifySearchOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: ChartErrorCode; message: string };

export type SpotifyArtistSearchPage = {
  artists: SpotifyArtistSearchHit[];
  nextCursor: string | null;
};

export type SpotifyAlbumSearchPage = {
  albums: SpotifyAlbumSearchHit[];
  nextCursor: string | null;
};

export type SpotifyTrackSearchPage = {
  tracks: SpotifyTrackSearchHit[];
  nextCursor: string | null;
};
