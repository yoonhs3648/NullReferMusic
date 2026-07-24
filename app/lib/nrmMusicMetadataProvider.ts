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
import { searchMelonTracks } from '@/lib/nrmMelonSearchClient';
import { logNrmRunError } from '@/lib/nrmDevLog';

export type { MusicProviderCapabilities };

export type MusicMetadataSearchResult = {
  hits: NrmAiLabTrackHit[];
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

function toChoices(hits: NrmAiLabTrackHit[]): NrmAiLabChoice[] {
  return hits.map((h) => ({
    id: h.ref,
    label: `${h.artist} - ${h.title}`.trim(),
  }));
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
      const out = await searchMelonTracks(q);
      if (!out.ok) {
        return {
          hits: [],
          choices: [],
          error: out.errorCode ?? 'search_failed',
          providerId: this.id,
        };
      }
      const hits: NrmAiLabTrackHit[] = (out.data.tracks ?? []).slice(0, 8).map((t) => ({
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
      return { hits, choices: toChoices(hits), providerId: this.id };
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
