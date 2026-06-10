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
  getLastfmTrackCoverFromCache,
  setLastfmTrackCoverCache,
} from '@/lib/nrmLastfmTrackCoverCache';
import {
  buildLastfmChartAuthHeaders,
  refreshLastfmChartToken,
} from '@/lib/nrmLastfmTokenSync';
import { isValidLastfmMbid } from '@/lib/nrmLastfmMbid';

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';

export class LastfmTrackCoverRateLimitError extends Error {
  constructor() {
    super('lastfm_rate_limited');
    this.name = 'LastfmTrackCoverRateLimitError';
  }
}

type CoverFetchResult = { coverUrl: string };

function parseCoverFromTrackNode(trackNode: Record<string, unknown>): string {
  const album = trackNode.album as Record<string, unknown> | undefined;
  const images = album?.image as { '#text'?: string; size?: string }[] | undefined;
  return pickLastfmCoverUrl(images);
}

async function fetchCoverDirect(
  apiKey: string,
  mbid: string,
): Promise<CoverFetchResult> {
  const qs = new URLSearchParams({
    method: 'track.getInfo',
    api_key: apiKey,
    mbid,
    format: 'json',
  });
  const res = await nrmDirectFetch(
    `${LASTFM_API}?${qs.toString()}`,
    undefined,
    'lastfm-chart-cover',
  );
  if (res.status === 429) {
    markLastfmApiRateLimited();
    throw new LastfmTrackCoverRateLimitError();
  }
  if (!res.ok) {
    return { coverUrl: '' };
  }
  const root = (await res.json()) as Record<string, unknown>;
  if (typeof root.error === 'number') {
    if (root.error === 29) {
      markLastfmApiRateLimited();
      throw new LastfmTrackCoverRateLimitError();
    }
    return { coverUrl: '' };
  }
  const trackNode = root.track as Record<string, unknown> | undefined;
  if (!trackNode) return { coverUrl: '' };
  return { coverUrl: parseCoverFromTrackNode(trackNode) };
}

async function fetchCoverViaBackend(mbid: string): Promise<CoverFetchResult> {
  const auth = await buildLastfmChartAuthHeaders();
  if ('error' in auth) {
    return { coverUrl: '' };
  }

  const run = async (headers: HeadersInit): Promise<CoverFetchResult> => {
    const resolved = await getResolvedApiBaseUrl();
    const primary =
      resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
    if (!primary) return { coverUrl: '' };

    const path = `/api/charts/lastfm/track-cover?mbid=${encodeURIComponent(mbid)}`;
    const res = await nrmBackendFetch(`${primary}${path}`, { headers });
    if (res.status === 429) {
      markLastfmApiRateLimited();
      throw new LastfmTrackCoverRateLimitError();
    }
    if (!res.ok) return { coverUrl: '' };
    const data = (await res.json()) as { coverUrl?: string };
    return { coverUrl: (data.coverUrl ?? '').trim() };
  };

  let result = await run(auth.headers);
  if (result.coverUrl) return result;

  const refreshed = await refreshLastfmChartToken();
  if (refreshed.ok) {
    result = await run(refreshed.headers);
  }
  return result;
}

async function fetchCoverOnce(mbid: string): Promise<string> {
  if (isStandaloneApp()) {
    const auth = await buildLastfmChartAuthHeaders();
    if ('error' in auth) return '';
    const h = auth.headers as Record<string, string>;
    const apiKey =
      h['X-NRM-Lastfm-Api-Key'] ??
      h.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
      '';
    if (!apiKey) return '';

    let out = await fetchCoverDirect(apiKey, mbid);
    if (out.coverUrl) return out.coverUrl;

    const refreshed = await refreshLastfmChartToken();
    if (refreshed.ok) {
      const rh = refreshed.headers as Record<string, string>;
      const rKey =
        rh['X-NRM-Lastfm-Api-Key'] ??
        rh.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
        '';
      if (rKey) {
        out = await fetchCoverDirect(rKey, mbid);
      }
    }
    return out.coverUrl;
  }

  const out = await fetchCoverViaBackend(mbid);
  return out.coverUrl;
}

export type LastfmTrackCoverResolve = {
  coverUrl: string;
  /** API/캐시에서 확정됨 — 재큐잉 불필요 */
  settled: boolean;
};

/**
 * mbid 트랙의 앨범 커버 URL (track.getInfo 1회, 쓰로틀·캐시 적용).
 * settled=false 이면 큐 포화·쿨다운 등으로 스킵 — 스크롤 시 재시도 가능.
 */
export async function resolveLastfmTrackCoverUrl(
  mbid: string,
): Promise<LastfmTrackCoverResolve> {
  const id = mbid.trim().toLowerCase();
  if (!isValidLastfmMbid(id)) {
    return { coverUrl: '', settled: true };
  }

  const cached = await getLastfmTrackCoverFromCache(id);
  if (cached !== undefined) {
    return { coverUrl: cached, settled: true };
  }

  const throttled = await runLastfmThrottledByMbid(id, () => fetchCoverOnce(id));
  if (!throttled.ok) {
    if ('rateLimited' in throttled && throttled.rateLimited) {
      await setLastfmTrackCoverCache(id, '');
      return { coverUrl: '', settled: true };
    }
    return { coverUrl: '', settled: false };
  }

  const coverUrl = throttled.value;
  await setLastfmTrackCoverCache(id, coverUrl);
  return { coverUrl, settled: true };
}
