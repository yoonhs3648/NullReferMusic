import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import {
  spotifyErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import { nrmChartsSpotifyNotConfiguredMessage } from '@/lib/nrmChartsStrings';
import type {
  SpotifyChartSource,
  SpotifyChartTabId,
} from '@/lib/nrmSpotifyChartCatalog';
import type {
  ChartFetchOutcome,
  ChartTrackItem,
  SpotifyChartPayload,
} from '@/lib/nrmChartsTypes';
import {
  buildSpotifyChartAuthHeaders,
  refreshSpotifyChartToken,
} from '@/lib/nrmSpotifyTokenSync';

type SpotifyFetchFail = {
  ok: false;
  errorCode: ChartErrorCode;
  authFailed: boolean;
  premiumBlocked: boolean;
};

type SpotifyFetchSuccess = { ok: true; data: SpotifyChartPayload };

type SpotifyFetchResult = SpotifyFetchSuccess | SpotifyFetchFail;

function isAuthError(code: string | undefined, httpStatus: number): boolean {
  return (
    code === 'spotify_auth_failed' ||
    code === 'spotify_charts_auth_failed' ||
    httpStatus === 401
  );
}

// ─── Direct Spotify Charts API (Standalone APK / IPA) ─────────────────────────

const CHARTS_API_BASE = 'https://charts-spotify-com-service.spotify.com';

const SPOTIFY_CHART_SLUGS: Record<SpotifyChartTabId, { slug: string; market: string; name: string }> = {
  'top50-kr':      { slug: 'regional-kr-daily',    market: 'KR',     name: 'Top 50 - Korea' },
  'viral50-kr':    { slug: 'viral-kr-daily',        market: 'KR',     name: 'Viral 50 - Korea' },
  'top50-global':  { slug: 'regional-global-daily', market: 'GLOBAL', name: 'Top 50 - Global' },
  'viral50-global':{ slug: 'viral-global-daily',    market: 'GLOBAL', name: 'Viral 50 - Global' },
};

function chartDateCandidates(): string[] {
  const dates = ['latest'];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function parseSpotifyChartEntries(root: Record<string, unknown>, maxTracks: number): ChartTrackItem[] {
  let entries = root.entries as unknown[] | undefined;
  if (!Array.isArray(entries) || entries.length === 0) {
    const responses = root.chartEntryViewResponses as { entries?: unknown[] }[] | undefined;
    if (Array.isArray(responses) && responses.length > 0) {
      entries = responses[0]?.entries;
    }
  }
  if (!Array.isArray(entries)) return [];
  const items: ChartTrackItem[] = [];
  for (const row of entries) {
    const r = row as Record<string, unknown>;
    const meta = r.trackMetadata as Record<string, unknown> | undefined;
    if (!meta) continue;
    const rankData = (r.chartEntryData as Record<string, unknown> | undefined)?.currentRank;
    const rank = typeof rankData === 'number' ? rankData : items.length + 1;
    const trackUri = String(meta.trackUri ?? '');
    const trackId = trackUri.includes(':') ? (trackUri.split(':').pop() ?? '') : trackUri;
    const artists = (meta.artists as { name?: string }[] | undefined ?? [])
      .map((a) => a?.name ?? '')
      .filter(Boolean)
      .join(', ');
    items.push({
      rank,
      trackId,
      title: String(meta.trackName ?? ''),
      artists,
      album: '',
      imageUrl: String(meta.displayImageUri ?? ''),
      externalUrl: trackId ? `https://open.spotify.com/track/${trackId}` : '',
      durationMs: 0,
      popularity: 0,
      releaseDate: String(meta.releaseDate ?? ''),
    });
    if (items.length >= maxTracks) break;
  }
  return items;
}

async function fetchSpotifyChartDirect(
  chart: SpotifyChartTabId,
  bearerToken: string,
): Promise<SpotifyFetchResult> {
  const meta = SPOTIFY_CHART_SLUGS[chart];
  if (!meta) {
    return { ok: false, errorCode: 'not_found', authFailed: false, premiumBlocked: false };
  }
  for (const date of chartDateCandidates()) {
    try {
      const url = `${CHARTS_API_BASE}/auth/v0/charts/${meta.slug}/${date}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
          Origin: 'https://charts.spotify.com',
          Referer: 'https://charts.spotify.com/',
        },
      });
      if (!res.ok) {
        if (res.status === 401) return { ok: false, errorCode: 'auth_failed', authFailed: true, premiumBlocked: false };
        if (res.status === 403) return { ok: false, errorCode: 'auth_failed', authFailed: true, premiumBlocked: false };
        if (res.status === 404) continue;
        return { ok: false, errorCode: 'server', authFailed: false, premiumBlocked: false };
      }
      const root = (await res.json()) as Record<string, unknown>;
      const items = parseSpotifyChartEntries(root, 50);
      if (items.length === 0) continue;
      const displayChart = root.displayChart as { chartMetadata?: { readableTitle?: string } } | undefined;
      const playlistName = displayChart?.chartMetadata?.readableTitle ?? meta.name;
      const data: SpotifyChartPayload = {
        platform: 'spotify',
        playlistId: meta.slug,
        playlistName,
        market: meta.market,
        fetchedAt: new Date().toISOString(),
        items,
      };
      return { ok: true, data };
    } catch {
      return { ok: false, errorCode: 'network', authFailed: false, premiumBlocked: false };
    }
  }
  return { ok: false, errorCode: 'empty', authFailed: false, premiumBlocked: false };
}

async function fetchSpotifyPlaylistWithBase(
  base: string,
  chart: SpotifyChartTabId,
  source: SpotifyChartSource,
  credHeaders: HeadersInit,
): Promise<SpotifyFetchResult> {
  try {
    const q = `?chart=${encodeURIComponent(chart)}&source=${encodeURIComponent(source)}`;
    const res = await nrmBackendFetch(`${base}/api/charts/spotify/playlist${q}`, {
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
      const errorCode = spotifyErrorFromApi(code, res.status);
      return {
        ok: false,
        errorCode,
        authFailed: isAuthError(code, res.status),
        premiumBlocked:
          errorCode === 'premium_required' || code === 'spotify_premium_required',
      };
    }
    const data = JSON.parse(rawText) as SpotifyChartPayload;
    if (!data?.items || !Array.isArray(data.items)) {
      return {
        ok: false,
        errorCode: 'unknown',
        authFailed: false,
        premiumBlocked: false,
      };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      errorCode: 'network',
      authFailed: false,
      premiumBlocked: false,
    };
  }
}

async function fetchPlaylistWithDevFallback(
  chart: SpotifyChartTabId,
  source: SpotifyChartSource,
  headers: HeadersInit,
): Promise<SpotifyFetchResult> {
  if (isStandaloneApp() && source === 'charts') {
    const h = headers as Record<string, string>;
    const bearer = (h.Authorization ?? h.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer) {
      return { ok: false, errorCode: 'charts_session', authFailed: false, premiumBlocked: false };
    }
    return fetchSpotifyChartDirect(chart, bearer);
  }

  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return {
      ok: false,
      errorCode: 'network',
      authFailed: false,
      premiumBlocked: false,
    };
  }

  const first = await fetchSpotifyPlaylistWithBase(primary, chart, source, headers);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return fetchSpotifyPlaylistWithBase(fallback, chart, source, headers);
}

async function fetchSpotifyChartWithAuthRetry(
  source: SpotifyChartSource,
  fetchFn: (headers: HeadersInit) => Promise<SpotifyFetchResult>,
): Promise<ChartFetchOutcome> {
  const auth = await buildSpotifyChartAuthHeaders(source);
  if ('error' in auth) {
    return {
      ok: false,
      errorCode:
        source === 'charts' ? 'charts_session' : 'not_configured',
    };
  }

  let result = await fetchFn(auth.headers);

  if (
    source === 'official' &&
    !result.ok &&
    (result.authFailed || result.premiumBlocked)
  ) {
    const refreshed = await refreshSpotifyChartToken();
    if (refreshed.ok) {
      result = await fetchFn(refreshed.headers);
    }
  }

  if (result.ok) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errorCode: result.errorCode };
}

export async function fetchSpotifyPlaylistChart(
  chart: SpotifyChartTabId,
  source: SpotifyChartSource = 'charts',
): Promise<ChartFetchOutcome> {
  return fetchSpotifyChartWithAuthRetry(source, (headers) =>
    fetchPlaylistWithDevFallback(chart, source, headers),
  );
}

export type { SpotifyChartSource };

/** 설정 화면 등 — 기술 문구 유지 */
export { nrmChartsSpotifyNotConfiguredMessage };
