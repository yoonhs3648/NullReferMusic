/**
 * MusicMetadataProvider — Edge 계약 + Capability.
 * 실제 검색은 앱 클라이언트 Factory가 수행.
 */

export type MusicProviderCapabilities = {
  supportsSearch: boolean;
  supportsChart: boolean;
  supportsAlbum: boolean;
  supportsArtist: boolean;
  supportsLyrics: boolean;
};

export type MusicTrackHit = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  platform?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export type MusicSearchQuery = {
  q: string;
  limit?: number;
  platform?: string;
};

export interface MusicMetadataProvider {
  id: string;
  enabled: boolean;
  capabilities: MusicProviderCapabilities;
  searchMusic(query: MusicSearchQuery): Promise<MusicTrackHit[]>;
  searchAlbum(query: MusicSearchQuery): Promise<MusicTrackHit[]>;
  searchArtist(query: MusicSearchQuery): Promise<Array<{ id?: string; name: string }>>;
  searchPlaylist(query: MusicSearchQuery): Promise<Array<{ id?: string; name: string; tracks?: number }>>;
  searchLyrics(query: MusicSearchQuery): Promise<Array<{ title: string; artist: string; snippet?: string }>>;
  searchChart(params: { chart?: string; limit?: number }): Promise<MusicTrackHit[]>;
  searchRelease(params: { from?: string; to?: string; limit?: number }): Promise<MusicTrackHit[]>;
}

const DEFAULT_CAPS: MusicProviderCapabilities = {
  supportsSearch: false,
  supportsChart: false,
  supportsAlbum: false,
  supportsArtist: false,
  supportsLyrics: false,
};

const musicProviders = new Map<string, MusicMetadataProvider>();
let defaultProviderId = 'melon';

function emptyProvider(
  id: string,
  capabilities: MusicProviderCapabilities,
): MusicMetadataProvider {
  return {
    id,
    enabled: true,
    capabilities,
    async searchMusic() {
      return [];
    },
    async searchAlbum() {
      return [];
    },
    async searchArtist() {
      return [];
    },
    async searchPlaylist() {
      return [];
    },
    async searchLyrics() {
      return [];
    },
    async searchChart() {
      return [];
    },
    async searchRelease() {
      return [];
    },
  };
}

export const MelonProvider: MusicMetadataProvider = emptyProvider('melon', {
  supportsSearch: true,
  supportsChart: true,
  supportsAlbum: true,
  supportsArtist: true,
  supportsLyrics: true,
});

registerMusicMetadataProvider(MelonProvider);
setDefaultMusicMetadataProvider('melon');

export function registerMusicMetadataProvider(p: MusicMetadataProvider): void {
  musicProviders.set(p.id, p);
}

export function setDefaultMusicMetadataProvider(id: string): void {
  defaultProviderId = id;
}

export function getDefaultMusicMetadataProviderId(): string {
  return defaultProviderId;
}

export function listMusicMetadataProviders(): MusicMetadataProvider[] {
  return [...musicProviders.values()].filter((p) => p.enabled);
}

export function getMusicMetadataProvider(id: string): MusicMetadataProvider | undefined {
  return musicProviders.get(id);
}

/** platform 있으면 해당, 없으면 Default(Preference와 동일 역할) */
export function resolveMusicMetadataProvider(platform?: string | null): MusicMetadataProvider {
  const raw = String(platform ?? '').trim().toLowerCase();
  if (!raw || raw === 'youtube') {
    return musicProviders.get(defaultProviderId) ?? MelonProvider;
  }
  const id =
    raw === 'applemusic' || raw === 'apple_music'
      ? 'apple_music'
      : raw === 'spotifypremium' || raw === 'spotify_premium'
        ? 'spotify_premium'
        : raw === 'lastfm' || raw === 'last_fm'
          ? 'last_fm'
          : raw;
  return musicProviders.get(id) ?? musicProviders.get(defaultProviderId) ?? MelonProvider;
}

export function getProviderCapabilities(id: string): MusicProviderCapabilities {
  return getMusicMetadataProvider(id)?.capabilities ?? DEFAULT_CAPS;
}
