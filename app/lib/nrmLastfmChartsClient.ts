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
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

type LastfmFetchFail = {
  ok: false;
  errorCode: ChartErrorCode;
  authFailed: boolean;
};

type LastfmFetchSuccess = { ok: true; data: SpotifyChartPayload };

type LastfmFetchResult = LastfmFetchSuccess | LastfmFetchFail;

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_PAGE_SIZE = 100;
const LASTFM_MAX_TRACKS = 100;

const LASTFM_CHART_PARAMS: Record<
  LastfmChartTabId,
  { method: string; countries?: string[]; market: string; name: string }
> = {
  'top100-kr': {
    method: 'geo.getTopTracks',
    countries: ['Korea, Republic of'],
    market: 'KR',
    name: 'Top 100 - Korea',
  },
  'top100-global': {
    method: 'chart.gettoptracks',
    market: 'GLOBAL',
    name: 'Top 100 - Global',
  },
};

function isAuthError(code: string | undefined, httpStatus: number): boolean {
  return code === 'lastfm_auth_failed' || httpStatus === 401;
}

function pickLastfmImage(images: { '#text'?: string; size?: string }[]): string {
  if (!Array.isArray(images)) return '';
  const priority = ['mega', 'extralarge', 'large', 'medium', 'small', ''];
  for (const size of priority) {
    for (const img of images) {
      const url = (img['#text'] ?? '').trim();
      const imgSize = img.size ?? '';
      if (!url || url.includes('2a96cbd8b46e442fc41c2b86b821562f')) continue;
      if (imgSize === size || (size === '' && imgSize)) return url;
    }
  }
  return '';
}

function mapLastfmTrack(
  track: Record<string, unknown>,
  fallbackRank: number,
): ChartTrackItem {
  const attrRank = (track['@attr'] as { rank?: string } | undefined)?.rank;
  const rank = parseInt(String(attrRank ?? track.rank ?? '0'), 10) || fallbackRank;
  const artistNode = track.artist as { name?: string } | string | undefined;
  const artists =
    typeof artistNode === 'object' ? (artistNode?.name ?? '') : String(artistNode ?? '');
  const imageUrl = normalizeCoverArtUrl(
    pickLastfmImage(
      (track.image as { '#text'?: string; size?: string }[] | undefined) ?? [],
    ),
  );
  const externalUrl = String(track.url ?? '');
  const mbidRaw = String(track.mbid ?? '').trim();
  const trackId = mbidRaw || externalUrl;
  return {
    rank,
    trackId,
    mbid: mbidRaw || undefined,
    title: String(track.name ?? ''),
    artists,
    album: '',
    imageUrl,
    externalUrl,
    durationMs: 0,
    popularity: 0,
    releaseDate: '',
  };
}

async function fetchLastfmPage(
  apiKey: string,
  method: string,
  page: number,
  limit: number,
  country?: string,
): Promise<{ ok: true; tracks: Record<string, unknown>[] } | LastfmFetchFail> {
  const pairs: [string, string][] = [
    ['method', method],
    ['api_key', apiKey],
    ['format', 'json'],
    ['limit', String(limit)],
    ['page', String(page)],
  ];
  if (country) {
    pairs.push(['country', country]);
  }
  const qs = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  try {
    const res = await fetch(`${LASTFM_API}?${qs}`);
    if (!res.ok) return { ok: false, errorCode: 'server', authFailed: false };
    const root = (await res.json()) as Record<string, unknown>;
    if (typeof root.error === 'number') {
      const code = root.error as number;
      if (code === 10 || code === 4 || code === 26) {
        return { ok: false, errorCode: 'auth_failed', authFailed: true };
      }
      if (code === 6) {
        const msg = String((root as { message?: string }).message ?? '').toLowerCase();
        if (msg.includes('country')) {
          return { ok: false, errorCode: 'empty', authFailed: false };
        }
      }
      return { ok: false, errorCode: 'server', authFailed: false };
    }
    const trackNode = (root.tracks as { track?: unknown } | undefined)?.track;
    const trackArr: Record<string, unknown>[] = Array.isArray(trackNode)
      ? (trackNode as Record<string, unknown>[])
      : trackNode
        ? [trackNode as Record<string, unknown>]
        : [];
    return { ok: true, tracks: trackArr };
  } catch {
    return { ok: false, errorCode: 'network', authFailed: false };
  }
}

async function fetchLastfmChartDirect(
  chart: LastfmChartTabId,
  apiKey: string,
): Promise<LastfmFetchResult> {
  const params = LASTFM_CHART_PARAMS[chart];
  if (!params) return { ok: false, errorCode: 'not_found', authFailed: false };

  const items: ChartTrackItem[] = [];
  const country = params.countries?.[0];
  const pagesNeeded = Math.ceil(LASTFM_MAX_TRACKS / LASTFM_PAGE_SIZE);

  for (let page = 1; page <= pagesNeeded && items.length < LASTFM_MAX_TRACKS; page++) {
    const limit = Math.min(LASTFM_PAGE_SIZE, LASTFM_MAX_TRACKS - items.length);
    const out = await fetchLastfmPage(apiKey, params.method, page, limit, country);
    if (!out.ok) {
      return out;
    }
    for (const track of out.tracks) {
      items.push(mapLastfmTrack(track, items.length + 1));
      if (items.length >= LASTFM_MAX_TRACKS) break;
    }
    if (out.tracks.length < limit) break;
  }

  if (items.length > 0) {
    return {
      ok: true,
      data: {
        platform: 'lastfm',
        playlistId: chart,
        playlistName: params.name,
        market: params.market,
        fetchedAt: new Date().toISOString(),
        items,
      },
    };
  }

  return { ok: false, errorCode: 'empty', authFailed: false };
}

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
      errorCode: 'backend_unreachable',
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
      errorCode: 'backend_unreachable',
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
    const apiKey =
      h['X-NRM-Lastfm-Api-Key'] ??
      h.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
      '';
    if (!apiKey) return { ok: false, errorCode: 'not_configured' };
    let result = await fetchLastfmChartDirect(chart, apiKey);
    if (!result.ok && result.authFailed) {
      const refreshed = await refreshLastfmChartToken();
      if (refreshed.ok) {
        const rh = refreshed.headers as Record<string, string>;
        const rKey =
          rh['X-NRM-Lastfm-Api-Key'] ??
          rh.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
          '';
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
