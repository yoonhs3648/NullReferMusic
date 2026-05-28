import {
  buildLastfmSeedAudioMetadata,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import {
  joinLastfmTagNames,
  lastfmRawToOptionalEmbed,
  normalizeLastfmReleaseDate,
  type LastfmRawEmbedFields,
} from '@/lib/nrmLastfmEmbedFields';
import { isValidLastfmMbid, normalizeLastfmMbid } from '@/lib/nrmLastfmMbid';
import {
  fetchLastfmAlbumDetail,
  fetchLastfmArtistDetail,
  fetchLastfmTrackDetail,
  searchLastfmAlbums,
  searchLastfmArtists,
} from '@/lib/nrmLastfmSearchClient';
import type { LastfmSearchErrorCode, LastfmTag } from '@/lib/nrmLastfmSearchTypes';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

/** Last.fm 메타 API 인증·설정 오류 (다운로드 흐름에서 처리) */
export class LastfmMetadataApiError extends Error {
  readonly errorCode: LastfmSearchErrorCode;

  constructor(errorCode: LastfmSearchErrorCode) {
    super('lastfm_metadata_api_error');
    this.name = 'LastfmMetadataApiError';
    this.errorCode = errorCode;
  }
}

function throwIfLastfmAuthFailure(
  errorCode: LastfmSearchErrorCode,
): void {
  if (errorCode === 'auth_failed' || errorCode === 'not_configured') {
    throw new LastfmMetadataApiError(errorCode);
  }
}

/** Last.fm → YouTube 유입 시 다운로드 직전에 전달하는 시드 */
export type LastfmDownloadSeed = {
  mbid?: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  imageUrl?: string;
};

function mergeRaw(
  target: LastfmRawEmbedFields,
  patch: LastfmRawEmbedFields,
): void {
  const keys = Object.keys(patch) as (keyof LastfmRawEmbedFields)[];
  for (const k of keys) {
    const v = patch[k];
    if (v != null && String(v).trim()) {
      target[k] = String(v).trim();
    }
  }
}

function tagsToGenre(tags: LastfmTag[], existing?: string): string {
  const fromTags = joinLastfmTagNames(tags, 5);
  const prev = (existing ?? '').trim();
  if (!fromTags) return prev;
  if (!prev) return fromTags;
  const parts = new Set(
    `${prev}, ${fromTags}`
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return [...parts].slice(0, 5).join(', ');
}

/**
 * Last.fm 다운로드 메타 보강.
 * - mbid 있음: track.getInfo → artist.search·album.search 후 동일 mbid 필터 → 상세 API
 * - mbid 없음: 시드(검색 화면) 데이터만 사용, artist/album API 호출 없음
 * - artist·title 은 항상 사용자가 모달에서 확정한 값 유지
 */
export async function enrichLastfmDownloadMetadata(
  seed: LastfmDownloadSeed,
  userArtist: string,
  userTitle: string,
): Promise<NrmAudioFileMetadata> {
  const base = buildLastfmSeedAudioMetadata(
    {
      album: seed.album,
      genre: seed.genre,
      releaseDate: seed.releaseDate,
      imageUrl: seed.imageUrl,
    },
    userArtist,
    userTitle,
  );

  const trackMbid = normalizeLastfmMbid(seed.mbid);
  if (!trackMbid) {
    return base;
  }

  const raw: LastfmRawEmbedFields = {
    album: base.album,
    genre: base.genre,
    releaseDate: base.releaseDate,
    coverUrl: base.coverUrl,
    albumArtist: userArtist.trim() || undefined,
  };

  const trackR = await fetchLastfmTrackDetail(
    seed.artist.trim() || userArtist,
    seed.title.trim() || userTitle,
    trackMbid,
  );
  if (!trackR.ok) {
    throwIfLastfmAuthFailure(trackR.errorCode);
    return base;
  }

  const { info, tags: trackTags } = trackR.data;
  mergeRaw(raw, {
    album: info.album,
    coverUrl: normalizeCoverArtUrl(info.imageUrl),
    website: info.url,
    trackNumber: info.albumTrackPosition,
    genre: tagsToGenre(trackTags),
    albumArtist: info.artist,
  });

  const artistMbid = normalizeLastfmMbid(info.artistMbid);
  const albumMbid = normalizeLastfmMbid(info.albumMbid);
  const artistName = info.artist || seed.artist || userArtist;

  if (artistMbid && artistName) {
    const searchA = await searchLastfmArtists(artistName);
    if (searchA.ok) {
      const hit = searchA.data.artists.find(
        (a) => normalizeLastfmMbid(a.mbid) === artistMbid,
      );
      if (hit) {
        const detailA = await fetchLastfmArtistDetail(hit.name, hit.mbid);
        if (detailA.ok) {
          mergeRaw(raw, {
            genre: tagsToGenre(detailA.data.tags, raw.genre),
            website: detailA.data.info.url || raw.website,
            albumArtist: detailA.data.info.name || raw.albumArtist,
          });
        }
      }
    }
  }

  const albumName = (info.album || seed.album || '').trim();
  if (albumMbid && albumName && artistName) {
    const searchAl = await searchLastfmAlbums(albumName);
    if (searchAl.ok) {
      const hit = searchAl.data.albums.find(
        (a) =>
          normalizeLastfmMbid(a.mbid) === albumMbid &&
          a.artist.toLowerCase() === artistName.toLowerCase(),
      );
      if (hit) {
        const detailAl = await fetchLastfmAlbumDetail(hit.artist, hit.name);
        if (detailAl.ok) {
          const al = detailAl.data.info;
          let trackNum = raw.trackNumber;
          if (!trackNum) {
            const byMbid = al.tracks.find(
              (t) => normalizeLastfmMbid(t.mbid) === trackMbid,
            );
            const byName = al.tracks.find(
              (t) =>
                t.name.toLowerCase() ===
                (info.name || seed.title || userTitle).toLowerCase(),
            );
            const match = byMbid ?? byName;
            if (match) trackNum = String(match.rank);
          }
          mergeRaw(raw, {
            album: al.name,
            albumArtist: al.artist || raw.albumArtist,
            coverUrl: normalizeCoverArtUrl(al.imageUrl) || raw.coverUrl,
            releaseDate:
              normalizeLastfmReleaseDate(al.published) || raw.releaseDate,
            genre: tagsToGenre(detailAl.data.tags, raw.genre),
            trackNumber: trackNum,
          });
        }
      }
    }
  }

  const optional = lastfmRawToOptionalEmbed(raw);
  return normalizeDownloadMetadata({
    ...base,
    ...optional,
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: optional.album ?? base.album,
    genre: optional.genre ?? base.genre,
    releaseDate: optional.releaseDate ?? base.releaseDate,
    coverUrl: optional.coverUrl ?? base.coverUrl,
  });
}
