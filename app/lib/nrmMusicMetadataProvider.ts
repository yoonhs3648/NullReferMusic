/**
 * MusicMetadataProvider + Factory.
 * 이번 버전: 실제 검색은 MelonProvider만. 그 외 Provider는 목록/확장용 stub.
 */

import {
  getMusicPlatformCapabilities,
  MusicPlatformId,
  normalizeMusicPlatformArg,
  resolveMusicPlatformIdForSearch,
  type MusicPlatformId as MusicPlatformIdType,
  type MusicProviderCapabilities,
} from '@/lib/nrmAiLabMusicPlatform';
import type { NrmAiLabChoice, NrmAiLabDownloadPlatformId, NrmAiLabTrackHit } from '@/lib/nrmAiLabDownloadTools';
import { beginAiLabMusicListPage, trackHitsToChoices } from '@/lib/nrmAiLabMusicChoicePager';
import {
  searchMelonAlbumsPage,
  searchMelonArtistsPage,
  searchMelonTracksPage,
} from '@/lib/nrmMelonSearchClient';
import { logNrmRunError } from '@/lib/nrmDevLog';

export type { MusicProviderCapabilities };

export type MusicMetadataSearchResult = {
  hits: NrmAiLabTrackHit[];
  choices: NrmAiLabChoice[];
  error?: string;
  providerId: MusicPlatformIdType;
};

export type MusicArtistSearchResult = {
  artists: Array<{
    ref: string;
    artistId: string;
    name: string;
    imageUrl: string;
    genre: string;
    externalUrl: string;
  }>;
  choices: NrmAiLabChoice[];
  error?: string;
  providerId: MusicPlatformIdType;
};

export type MusicAlbumSearchResult = {
  albums: Array<{
    ref: string;
    albumId: string;
    name: string;
    artist: string;
    imageUrl: string;
    releaseDate: string;
    externalUrl: string;
  }>;
  choices: NrmAiLabChoice[];
  error?: string;
  providerId: MusicPlatformIdType;
};

export interface MusicMetadataProvider {
  id: MusicPlatformIdType;
  label: string;
  enabled: () => Promise<boolean> | boolean;
  capabilities: MusicProviderCapabilities;
  search(query: string): Promise<MusicMetadataSearchResult>;
}

const LOG = 'ailab.musicMetadata';

/** 트랙 선택 칩: 가수 - 노래제목 (앨범명) */
export function formatAiLabTrackChoiceLabel(hit: {
  artist: string;
  title: string;
  album?: string;
}): string {
  const artist = hit.artist.trim();
  const title = hit.title.trim();
  const album = (hit.album ?? '').trim();
  const base = `${artist} - ${title}`.trim();
  return album ? `${base} (${album})` : base;
}

/** hit.platform — 다운로드 파이프라인 레거시 id */
export function toDownloadPlatformId(
  id: MusicPlatformIdType,
): NrmAiLabDownloadPlatformId | null {
  switch (id) {
    case MusicPlatformId.MELON:
      return 'melon';
    case MusicPlatformId.SPOTIFY:
    case MusicPlatformId.SPOTIFY_PREMIUM:
      return 'spotify';
    case MusicPlatformId.LAST_FM:
      return 'lastfm';
    case MusicPlatformId.APPLE_MUSIC:
      return 'appleMusic';
    default:
      return null;
  }
}

function stubProvider(
  id: MusicPlatformIdType,
  label: string,
): MusicMetadataProvider {
  return {
    id,
    label,
    capabilities: getMusicPlatformCapabilities(id),
    // 이번 버전: Melon 외 비활성
    enabled: () => false,
    async search() {
      return {
        hits: [],
        choices: [],
        error: `search_unsupported:${id}`,
        providerId: id,
      };
    },
  };
}

export const MelonProvider: MusicMetadataProvider = {
  id: MusicPlatformId.MELON,
  label: 'Melon',
  capabilities: getMusicPlatformCapabilities(MusicPlatformId.MELON),
  enabled: () => true,
  async search(query) {
    const q = query.trim();
    if (!q) return { hits: [], choices: [], error: 'empty_query', providerId: this.id };
    try {
      const out = await searchMelonTracksPage(q, null);
      if (!out.ok) {
        return {
          hits: [],
          choices: [],
          error: out.errorCode ?? 'search_failed',
          providerId: this.id,
        };
      }
      const hits: NrmAiLabTrackHit[] = (out.data.tracks ?? []).map((t) => ({
        ref: `melon:${t.songId}`,
        platform: 'melon',
        title: t.name,
        artist: t.artist,
        album: t.album,
        imageUrl: t.imageUrl,
        externalUrl: t.url,
        releaseDate: '',
        genre: '',
      }));
      const paged = beginAiLabMusicListPage({
        kind: 'track',
        items: trackHitsToChoices(hits),
        trackHits: hits,
        query: q,
        remoteCursor: out.data.nextCursor ?? null,
      });
      // 화면에 보이는 페이지만 hits로 노출(전체는 페이저·캐시에 유지)
      const pageIds = new Set(
        paged.choices.filter((c) => c.id !== 'ailab_more_music_list').map((c) => c.id),
      );
      const pageHits = hits.filter((h) => pageIds.has(h.ref));
      return {
        hits: pageHits,
        choices: paged.choices,
        providerId: this.id,
        hasMore: paged.hasMore,
        totalMatched: hits.length,
      };
    } catch (e) {
      logNrmRunError(LOG, e, { event: 'melon_search_failed', query: q.slice(0, 80) });
      return {
        hits: [],
        choices: [],
        error: e instanceof Error ? e.message : String(e),
        providerId: this.id,
      };
    }
  },
};

export const SpotifyProvider = stubProvider(MusicPlatformId.SPOTIFY, 'Spotify');
export const SpotifyPremiumProvider = stubProvider(
  MusicPlatformId.SPOTIFY_PREMIUM,
  'Spotify Premium',
);
export const LastFmProvider = stubProvider(MusicPlatformId.LAST_FM, 'Last.fm');
export const AppleMusicProvider = stubProvider(MusicPlatformId.APPLE_MUSIC, 'Apple Music');
export const YouTubeMusicProvider = stubProvider(
  MusicPlatformId.YOUTUBE_MUSIC,
  'YouTube Music',
);
export const GenieProvider = stubProvider(MusicPlatformId.GENIE, 'Genie');
export const BillboardProvider = stubProvider(MusicPlatformId.BILLBOARD, 'Billboard');
export const SoundCloudProvider = stubProvider(MusicPlatformId.SOUNDCLOUD, 'SoundCloud');

const providers = new Map<MusicPlatformIdType, MusicMetadataProvider>();

function register(p: MusicMetadataProvider): void {
  providers.set(p.id, p);
}

register(MelonProvider);
register(SpotifyProvider);
register(SpotifyPremiumProvider);
register(AppleMusicProvider);
register(LastFmProvider);
register(YouTubeMusicProvider);
register(GenieProvider);
register(BillboardProvider);
register(SoundCloudProvider);

export const MusicMetadataProviderFactory = {
  get(id: MusicPlatformIdType): MusicMetadataProvider {
    return providers.get(id) ?? MelonProvider;
  },
  list(): MusicMetadataProvider[] {
    return [...providers.values()];
  },
  /**
   * FC platform 있으면 해당 Provider, 없으면 Preference.
   * (비 Melon은 enabled=false — 호출 측에서 안내)
   */
  resolve(
    fcPlatform: string | null | undefined,
    preferenceId: MusicPlatformIdType,
  ): MusicMetadataProvider {
    const id = resolveMusicPlatformIdForSearch(fcPlatform, preferenceId);
    return this.get(id);
  },
  async listSearchReady(): Promise<MusicMetadataProvider[]> {
    // 이번 버전: Melon만
    return [MelonProvider];
  },
};

export async function searchViaMusicMetadataProvider(
  query: string,
  platformId: MusicPlatformIdType,
): Promise<MusicMetadataSearchResult> {
  if (platformId !== MusicPlatformId.MELON) {
    return {
      hits: [],
      choices: [],
      error: `search_unsupported:${platformId}`,
      providerId: platformId,
    };
  }
  return MelonProvider.search(query);
}

export async function searchMelonArtistsViaProvider(
  query: string,
): Promise<MusicArtistSearchResult> {
  const q = query.trim();
  if (!q) {
    return {
      artists: [],
      choices: [],
      error: 'empty_query',
      providerId: MusicPlatformId.MELON,
    };
  }
  try {
    const out = await searchMelonArtistsPage(q, null);
    if (!out.ok) {
      return {
        artists: [],
        choices: [],
        error: out.errorCode ?? 'search_failed',
        providerId: MusicPlatformId.MELON,
      };
    }
    const artists = (out.data.artists ?? []).map((a) => ({
      ref: `melon-artist:${a.artistId}`,
      artistId: a.artistId,
      name: a.name,
      imageUrl: a.imageUrl,
      genre: a.genre,
      externalUrl: a.url,
    }));
    const allChoices = artists.map((a) => ({ id: a.ref, label: a.name.trim() }));
    const paged = beginAiLabMusicListPage({
      kind: 'artist',
      items: allChoices,
      query: q,
      remoteCursor: out.data.nextCursor ?? null,
    });
    const pageIds = new Set(
      paged.choices.filter((c) => c.id !== 'ailab_more_music_list').map((c) => c.id),
    );
    return {
      artists: artists.filter((a) => pageIds.has(a.ref)),
      choices: paged.choices,
      providerId: MusicPlatformId.MELON,
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'melon_artist_search_failed', query: q.slice(0, 80) });
    return {
      artists: [],
      choices: [],
      error: e instanceof Error ? e.message : String(e),
      providerId: MusicPlatformId.MELON,
    };
  }
}

export async function searchMelonAlbumsViaProvider(
  query: string,
): Promise<MusicAlbumSearchResult> {
  const q = query.trim();
  if (!q) {
    return {
      albums: [],
      choices: [],
      error: 'empty_query',
      providerId: MusicPlatformId.MELON,
    };
  }
  try {
    const out = await searchMelonAlbumsPage(q, null);
    if (!out.ok) {
      return {
        albums: [],
        choices: [],
        error: out.errorCode ?? 'search_failed',
        providerId: MusicPlatformId.MELON,
      };
    }
    const albums = (out.data.albums ?? []).map((a) => ({
      ref: `melon-album:${a.albumId}`,
      albumId: a.albumId,
      name: a.name,
      artist: a.artist,
      imageUrl: a.imageUrl,
      releaseDate: a.releaseDate,
      externalUrl: a.url,
    }));
    const allChoices = albums.map((a) => ({
      id: a.ref,
      label: `${a.artist.trim()} - ${a.name.trim()}`.trim(),
    }));
    const paged = beginAiLabMusicListPage({
      kind: 'album',
      items: allChoices,
      query: q,
      remoteCursor: out.data.nextCursor ?? null,
    });
    const pageIds = new Set(
      paged.choices.filter((c) => c.id !== 'ailab_more_music_list').map((c) => c.id),
    );
    return {
      albums: albums.filter((a) => pageIds.has(a.ref)),
      choices: paged.choices,
      providerId: MusicPlatformId.MELON,
    };
  } catch (e) {
    logNrmRunError(LOG, e, { event: 'melon_album_search_failed', query: q.slice(0, 80) });
    return {
      albums: [],
      choices: [],
      error: e instanceof Error ? e.message : String(e),
      providerId: MusicPlatformId.MELON,
    };
  }
}

/** @deprecated Factory.resolve 사용 */
export function resolveMusicMetadataProvider(
  platform?: string | null,
): MusicMetadataProvider {
  const id = normalizeMusicPlatformArg(platform) ?? MusicPlatformId.MELON;
  return MusicMetadataProviderFactory.get(id);
}

export function listMusicMetadataProviders(): MusicMetadataProvider[] {
  return MusicMetadataProviderFactory.list();
}
