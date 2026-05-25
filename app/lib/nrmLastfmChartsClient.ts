import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import {
  lastfmErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import type { LastfmChartTabId } from '@/lib/nrmLastfmChartCatalog';
import type { ChartFetchOutcome, ChartTrackItem, SpotifyChartPayload } from '@/lib/nrmChartsTypes';
import {
  buildLastfmChartAuthHeaders,
  refreshLastfmChartToken,
} from '@/lib/nrmLastfmTokenSync';

type LastfmFetchFail = {
  ok: false;
  errorCode: ChartErrorCode;
  authFailed: boolean;
};

type LastfmFetchSuccess = { ok: true; data: SpotifyChartPayload };

type LastfmFetchResult = LastfmFetchSuccess | LastfmFetchFail;

function isAuthError(code: string | undefined, httpStatus: number): boolean {
  return code === 'lastfm_auth_failed' || httpStatus === 401;
}

// ─── Direct Last.fm API (Standalone APK / IPA) ───────────────────────────────

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';

const LASTFM_CHART_PARAMS: Record<LastfmChartTabId, { method: string; country?: string; market: string; name: string }> = {
  'top50-kr':     { method: 'geo.gettoptracks', country: 'South Korea', market: 'KR',     name: 'Top 50 - Korea' },
  'top50-global': { method: 'chart.gettoptracks',                        market: 'GLOBAL', name: 'Top 50 - Global' },
};

function pickLastfmImage(images: { '#text'?: string; size?: string }[]): string {
  if (!Array.isArray(images)) return '';
  let large = '';
  let medium = '';
  for (const img of images) {
    const url = img['#text'] ?? '';
    const size = img.size ?? '';
    if (size === 'extralarge' || size === 'large') large = url;
    else if (size === 'medium') medium = url;
  }
  return large || medium;
}

async function fetchLastfmChartDirect(chart: LastfmChartTabId, apiKey: string): Promise<LastfmFetchResult> {
  const params = LASTFM_CHART_PARAMS[chart];
  if (!params) return { ok: false, errorCode: 'not_found', authFailed: false };
  try {
    const qs = new URLSearchParams({
      api_key: apiKey,
      format: 'json',
      limit: '50',
      method: params.method,
      ...(params.country ? { country: params.country } : {}),
    });
    const res = await fetch(`${LASTFM_API}?${qs.toString()}`);
    if (!res.ok) return { ok: false, errorCode: 'server', authFailed: false };
    const root = (await res.json()) as Record<string, unknown>;
    if (typeof root.error === 'number') {
      const code = root.error as number;
      if (code === 10 || code === 4 || code === 26) return { ok: false, errorCode: 'auth_failed', authFailed: true };
      return { ok: false, errorCode: 'server', authFailed: false };
    }
    const trackNode = (root.tracks as { track?: unknown } | undefined)?.track;
    const trackArr: Record<string, unknown>[] = Array.isArray(trackNode)
      ? (trackNode as Record<string, unknown>[])
      : trackNode ? [trackNode as Record<string, unknown>] : [];
    if (trackArr.length === 0) return { ok: false, errorCode: 'empty', authFailed: false };
    const items: ChartTrackItem[] = trackArr.slice(0, 50).map((track, i) => {
      const attrRank = (track['@attr'] as { rank?: string } | undefined)?.rank;
      const rank = parseInt(String(attrRank ?? track.rank ?? '0'), 10) || (i + 1);
      const artistNode = track.artist as { name?: string } | string | undefined;
      const artists = typeof artistNode === 'object' ? (artistNode?.name ?? '') : String(artistNode ?? '');
      const imageUrl = pickLastfmImage((track.image as { '#text'?: string; size?: string }[] | undefined) ?? []);
      const externalUrl = String(track.url ?? '');
      const trackId = String(track.mbid ?? externalUrl);
      return {
        rank,
        trackId,
        title: String(track.name ?? ''),
        artists,
        album: '',
        imageUrl,
        externalUrl,
        durationMs: 0,
        popularity: parseInt(String(track.playcount ?? '0'), 10),
        releaseDate: '',
      };
    });
    const data: SpotifyChartPayload = {
      platform: 'lastfm',
      playlistId: chart,
      playlistName: params.name,
      market: params.market,
      fetchedAt: new Date().toISOString(),
      items,
    };
    return { ok: true, data };
  } catch {
    return { ok: false, errorCode: 'network', authFailed: false };
  }
}

// ─── Backend proxy (Dev / Expo Go) ───────────────────────────────────────────

async function fetchLastfmTracksWithBase(
  base: string,
  chart: LastfmChartTabId,
  credHeaders: HeadersInit,
): Promise<LastfmFetchResult> {
  try {
    const q = `?chart=${encodeURIComponent(chart)}`;
    const res = await nrmBackendFetch(`${base}/api/charts/lastfm/tracks${q}`, {
      headers: credHeaders,
    });
    const rawText = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        const err = JSON.parse(rawText) as { error?: string };
        code = err.error;
      } catch {
        code = undefined;
      }
      return {
        ok: false,
        errorCode: lastfmErrorFromApi(code, res.status),
        authFailed: isAuthError(code, res.status),
      };
    }
    const data = JSON.parse(rawText) as SpotifyChartPayload;
    if (!data?.items || !Array.isArray(data.items)) {
      return {
        ok: false,
        errorCode: 'unknown',
        authFailed: false,
      };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      errorCode: 'network',
      authFailed: false,
    };
  }
}

async function fetchTracksWithDevFallback(
  chart: LastfmChartTabId,
  headers: HeadersInit,
): Promise<LastfmFetchResult> {
  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return {
      ok: false,
      errorCode: 'network',
      authFailed: false,
    };
  }

  const first = await fetchLastfmTracksWithBase(primary, chart, headers);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return fetchLastfmTracksWithBase(fallback, chart, headers);
}

export async function fetchLastfmChart(
  chart: LastfmChartTabId,
): Promise<ChartFetchOutcome> {
  const auth = await buildLastfmChartAuthHeaders();
  if ('error' in auth) {
    return { ok: false, errorCode: 'not_configured' };
  }

  if (isStandaloneApp()) {
    const h = auth.headers as Record<string, string>;
    const apiKey = h['X-NRM-Lastfm-Api-Key'] ?? h.Authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (!apiKey) return { ok: false, errorCode: 'not_configured' };
    let result = await fetchLastfmChartDirect(chart, apiKey);
    if (!result.ok && result.authFailed) {
      const refreshed = await refreshLastfmChartToken();
      if (refreshed.ok) {
        const rh = refreshed.headers as Record<string, string>;
        const rKey = rh['X-NRM-Lastfm-Api-Key'] ?? rh.Authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
        if (rKey) result = await fetchLastfmChartDirect(chart, rKey);
      }
    }
    if (result.ok) return { ok: true, data: result.data };
    return { ok: false, errorCode: result.errorCode };
  }

  let result = await fetchTracksWithDevFallback(chart, auth.headers);

  if (!result.ok && result.authFailed) {
    const refreshed = await refreshLastfmChartToken();
    if (refreshed.ok) {
      result = await fetchTracksWithDevFallback(chart, refreshed.headers);
    }
  }

  if (result.ok) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errorCode: result.errorCode };
}
