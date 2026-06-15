export type LastfmTag = { name: string; url: string };

export type LastfmArtistSearchHit = {
  name: string;
  mbid: string;
  url: string;
  imageUrl: string;
  listeners: number;
};

export type LastfmArtistInfo = {
  name: string;
  mbid: string;
  url: string;
  imageUrl: string;
  bioSummary: string;
  listeners: number;
  playcount: number;
  onTour: boolean;
};

export type LastfmSimilarArtist = {
  name: string;
  url: string;
  imageUrl: string;
};

export type LastfmTrackSummary = {
  name: string;
  artist: string;
  /** MusicBrainz ID — UI 비표시, 다운로드 메타 보강용 */
  mbid: string;
  url: string;
  imageUrl: string;
  rank: number;
  playcount: number;
};

export type LastfmAlbumSummary = {
  name: string;
  artist: string;
  url: string;
  imageUrl: string;
  playcount: number;
};

export type LastfmArtistDetail = {
  info: LastfmArtistInfo;
  similarArtists: LastfmSimilarArtist[];
  topTracks: LastfmTrackSummary[];
  topAlbums: LastfmAlbumSummary[];
  tags: LastfmTag[];
};

export type LastfmAlbumSearchHit = {
  name: string;
  artist: string;
  mbid: string;
  url: string;
  imageUrl: string;
};

export type LastfmAlbumTrack = {
  name: string;
  mbid: string;
  rank: number;
  durationSec: number;
};

export type LastfmAlbumInfo = {
  name: string;
  artist: string;
  mbid: string;
  url: string;
  imageUrl: string;
  listeners: number;
  playcount: number;
  published: string;
  wikiSummary: string;
  tracks: LastfmAlbumTrack[];
};

export type LastfmAlbumDetail = {
  info: LastfmAlbumInfo;
  tags: LastfmTag[];
};

export type LastfmTrackSearchHit = {
  name: string;
  artist: string;
  /** MusicBrainz ID — UI 비표시 */
  mbid: string;
  url: string;
  imageUrl: string;
};

export type LastfmTrackInfo = {
  name: string;
  artist: string;
  /** MusicBrainz ID */
  mbid: string;
  album: string;
  albumMbid: string;
  artistMbid: string;
  url: string;
  imageUrl: string;
  durationSec: number;
  playcount: number;
  listeners: number;
  /** album @attr position */
  albumTrackPosition: string;
};

export type LastfmTrackDetail = {
  info: LastfmTrackInfo;
  similarTracks: LastfmTrackSummary[];
  tags: LastfmTag[];
};

export type LastfmSearchErrorCode =
  | 'not_configured'
  | 'auth_failed'
  | 'network'
  | 'bad_request'
  | 'unknown';

export type LastfmSearchOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: LastfmSearchErrorCode; message: string };

export type LastfmArtistSearchPage = {
  artists: LastfmArtistSearchHit[];
  nextCursor: string | null;
};

export type LastfmAlbumSearchPage = {
  albums: LastfmAlbumSearchHit[];
  nextCursor: string | null;
};

export type LastfmTrackSearchPage = {
  tracks: LastfmTrackSearchHit[];
  nextCursor: string | null;
};
