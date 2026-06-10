import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import { pickLastfmCoverUrl } from '@/lib/nrmCoverArtUrl';
import {
  markLastfmApiRateLimited,
  runLastfmThrottledByMbid,
} from '@/lib/nrmLastfmApiThrottle';
import {
  getLastfmArtistImageFromCache,
  setLastfmArtistImageCache,
} from '@/lib/nrmLastfmArtistImageCache';
import { normalizeLastfmMbid } from '@/lib/nrmLastfmMbid';
import {
  buildLastfmChartAuthHeaders,
  refreshLastfmChartToken,
} from '@/lib/nrmLastfmTokenSync';

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';

export class LastfmArtistImageRateLimitError extends Error {
  constructor() {
    super('lastfm_rate_limited');
    this.name = 'LastfmArtistImageRateLimitError';
  }
}

type ImageFetchResult = { imageUrl: string };

export function lastfmArtistImageCacheKey(artist: string, mbid: string): string {
  const id = normalizeLastfmMbid(mbid);
  if (id) return `mbid:${id}`;
  return `name:${artist.trim().toLowerCase()}`;
}

function parseImageFromArtistNode(artistNode: Record<string, unknown>): string {
  const images = artistNode.image as { '#text'?: string; size?: string }[] | undefined;
  return pickLastfmCoverUrl(images);
}

async function fetchImageDirect(
  apiKey: string,
  artist: string,
  mbid: string,
): Promise<ImageFetchResult> {
  const qs = new URLSearchParams({
    method: 'artist.getInfo',
    api_key: apiKey,
    artist: artist.trim(),
    format: 'json',
  });
  const id = normalizeLastfmMbid(mbid);
  if (id) qs.set('mbid', id);

  const res = await nrmDirectFetch(
    `${LASTFM_API}?${qs.toString()}`,
    undefined,
    'lastfm-artist-image',
  );
  if (res.status === 429) {
    markLastfmApiRateLimited();
    throw new LastfmArtistImageRateLimitError();
  }
  if (!res.ok) {
    return { imageUrl: '' };
  }
  const root = (await res.json()) as Record<string, unknown>;
  if (typeof root.error === 'number') {
    if (root.error === 29) {
      markLastfmApiRateLimited();
      throw new LastfmArtistImageRateLimitError();
    }
    return { imageUrl: '' };
  }
  const artistNode = root.artist as Record<string, unknown> | undefined;
  if (!artistNode) return { imageUrl: '' };
  return { imageUrl: parseImageFromArtistNode(artistNode) };
}

async function fetchImageViaBackend(
  artist: string,
  mbid: string,
): Promise<ImageFetchResult> {
  const auth = await buildLastfmChartAuthHeaders();
  if ('error' in auth) {
    return { imageUrl: '' };
  }

  const run = async (headers: HeadersInit): Promise<ImageFetchResult> => {
    const resolved = await getResolvedApiBaseUrl();
    const primary =
      resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
    if (!primary) return { imageUrl: '' };

    const params = new URLSearchParams({ artist: artist.trim() });
    const id = normalizeLastfmMbid(mbid);
    if (id) params.set('mbid', id);
    const path = `/api/search/lastfm/artist-image?${params.toString()}`;
    const res = await nrmBackendFetch(`${primary}${path}`, { headers });
    if (res.status === 429) {
      markLastfmApiRateLimited();
      throw new LastfmArtistImageRateLimitError();
    }
    if (!res.ok) return { imageUrl: '' };
    const data = (await res.json()) as { imageUrl?: string };
    return { imageUrl: (data.imageUrl ?? '').trim() };
  };

  let result = await run(auth.headers);
  if (result.imageUrl) return result;

  const refreshed = await refreshLastfmChartToken();
  if (refreshed.ok) {
    result = await run(refreshed.headers);
  }
  return result;
}

async function fetchImageOnce(artist: string, mbid: string): Promise<string> {
  if (isStandaloneApp()) {
    const auth = await buildLastfmChartAuthHeaders();
    if ('error' in auth) return '';
    const h = auth.headers as Record<string, string>;
    const apiKey =
      h['X-NRM-Lastfm-Api-Key'] ??
      h.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
      '';
    if (!apiKey) return '';

    let out = await fetchImageDirect(apiKey, artist, mbid);
    if (out.imageUrl) return out.imageUrl;

    const refreshed = await refreshLastfmChartToken();
    if (refreshed.ok) {
      const rh = refreshed.headers as Record<string, string>;
      const rKey =
        rh['X-NRM-Lastfm-Api-Key'] ??
        rh.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
        '';
      if (rKey) {
        out = await fetchImageDirect(rKey, artist, mbid);
      }
    }
    return out.imageUrl;
  }

  const out = await fetchImageViaBackend(artist, mbid);
  return out.imageUrl;
}

export type LastfmArtistImageResolve = {
  imageUrl: string;
  settled: boolean;
};

/** artist.getInfo 1회로 아티스트 사진 URL (쓰로틀·캐시 적용) */
export async function resolveLastfmArtistImageUrl(
  artist: string,
  mbid: string,
): Promise<LastfmArtistImageResolve> {
  const name = artist.trim();
  if (!name) {
    return { imageUrl: '', settled: true };
  }

  const cacheKey = lastfmArtistImageCacheKey(name, mbid);
  const cached = await getLastfmArtistImageFromCache(cacheKey);
  if (cached !== undefined) {
    return { imageUrl: cached, settled: true };
  }

  const throttled = await runLastfmThrottledByMbid(cacheKey, () =>
    fetchImageOnce(name, mbid),
  );
  if (!throttled.ok) {
    if ('rateLimited' in throttled && throttled.rateLimited) {
      await setLastfmArtistImageCache(cacheKey, '');
      return { imageUrl: '', settled: true };
    }
    return { imageUrl: '', settled: false };
  }

  const imageUrl = throttled.value;
  await setLastfmArtistImageCache(cacheKey, imageUrl);
  return { imageUrl, settled: true };
}
