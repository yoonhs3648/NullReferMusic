export type MelonArtistSearchHit = {
  artistId: string;
  name: string;
  imageUrl: string;
  genre: string;
  profile: string;
  fanCount: number;
  url: string;
};

export type MelonDebutSong = {
  songId: string;
  name: string;
  imageUrl: string;
};

export type MelonGroupMember = {
  artistId: string;
  name: string;
  imageUrl: string;
  profile: string;
};

export type MelonSnsSubLink = {
  label: string;
  url: string;
};

export type MelonExternalLink = {
  label: string;
  value: string;
  url: string;
  /** SNS(Facebook·X) 묶음 — label이 SNS일 때 하위 링크 */
  snsItems?: MelonSnsSubLink[];
};

export type MelonTrackCredits = {
  lyricists: string;
  composers: string;
  arrangers: string;
};

export type MelonArtistInfo = {
  artistId: string;
  name: string;
  imageUrl: string;
  bioSummary: string;
  genre: string;
  fanCount: number;
  debutDate: string;
  artistType: string;
  activeEra: string;
  agency: string;
  nationality: string;
  debutSong: MelonDebutSong | null;
  groupMembers: MelonGroupMember[];
  links: MelonExternalLink[];
  url: string;
};

export type MelonArtistDetail = {
  info: MelonArtistInfo;
  popularTracks: MelonTrackSummary[];
  popularAlbums: MelonAlbumSearchHit[];
};

export type MelonAlbumSearchHit = {
  albumId: string;
  name: string;
  artist: string;
  artistId: string;
  imageUrl: string;
  releaseDate: string;
  albumKind: string;
  trackCount: number;
  url: string;
};

export type MelonAlbumTrack = {
  songId: string;
  name: string;
  rank: number;
  artist: string;
};

export type MelonAlbumInfo = {
  albumId: string;
  name: string;
  artist: string;
  artistId: string;
  imageUrl: string;
  releaseDate: string;
  genre: string;
  albumKind: string;
  likeCount: number;
  trackCount: number;
  label: string;
  agency: string;
  description: string;
  url: string;
  tracks: MelonAlbumTrack[];
};

export type MelonAlbumDetail = {
  info: MelonAlbumInfo;
};

export type MelonTrackSearchHit = {
  songId: string;
  name: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  imageUrl: string;
  url: string;
};

export type MelonTrackSummary = {
  songId: string;
  name: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  imageUrl: string;
  rank: number;
  likeCount: number;
};

export type MelonTrackInfo = {
  songId: string;
  name: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  imageUrl: string;
  releaseDate: string;
  genre: string;
  likeCount: number;
  url: string;
  lyrics: string;
  credits: MelonTrackCredits;
};

export type MelonTrackDetail = {
  info: MelonTrackInfo;
  similarTracks: MelonTrackSummary[];
  albumDetail: MelonAlbumDetail | null;
};

export type MelonSearchErrorCode = 'network' | 'bad_request' | 'unknown';

export type MelonSearchOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: MelonSearchErrorCode; message: string };

export type MelonArtistSearchPage = {
  artists: MelonArtistSearchHit[];
  nextCursor: string | null;
};

export type MelonAlbumSearchPage = {
  albums: MelonAlbumSearchHit[];
  nextCursor: string | null;
};

export type MelonTrackSearchPage = {
  tracks: MelonTrackSearchHit[];
  nextCursor: string | null;
};
