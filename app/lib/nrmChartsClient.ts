import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
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
import {
  isSpotifyChartsDirectTabSupported,
  type SpotifyChartSource,
  type SpotifyChartTabId,
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
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

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

/** APK 직접 호출 — 탭 연타 시 Spotify rate limit 완화 */
let spotifyDirectFetchChain: Promise<unknown> = Promise.resolve();

function runSpotifyDirectSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = spotifyDirectFetchChain.then(() => fn(), () => fn());
  spotifyDirectFetchChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

const SPOTIFY_CHART_SLUGS: Record<SpotifyChartTabId, { slug: string; market: string; name: string }> = {
  'top100-kr-daily':      { slug: 'regional-kr-daily',     market: 'KR',     name: 'Top 100 - Korea Daily' },
  'top100-kr-weekly':     { slug: 'regional-kr-weekly',    market: 'KR',     name: 'Top 100 - Korea Weekly' },
  'top100-global-daily':  { slug: 'regional-global-daily', market: 'GLOBAL', name: 'Top 100 - Global Daily' },
  'top100-global-weekly': { slug: 'regional-global-weekly',market: 'GLOBAL', name: 'Top 100 - Global Weekly' },
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
      for (const r of responses) {
        const maybe = r?.entries;
        if (Array.isArray(maybe) && maybe.length > 0) {
          entries = maybe;
          break;
        }
      }
    }
  }
  if (!Array.isArray(entries)) return [];
  const items: ChartTrackItem[] = [];
  for (const row of entries) {
    const r = row as Record<string, unknown>;
    const meta = r.trackMetadata as Record<string, unknown> | undefined;
    if (!meta) continue;
    const entryData = r.chartEntryData as Record<string, unknown> | undefined;
    const rankFromData = entryData?.currentRank ?? entryData?.current_rank;
    const rankFromRow = r.currentRank ?? r.current_rank;
    const rankRaw = rankFromData ?? rankFromRow;
    const rank = typeof rankRaw === 'number' ? rankRaw : items.length + 1;
    const trackUri = String(meta.trackUri ?? '');
    const trackId = trackUri.includes(':') ? (trackUri.split(':').pop() ?? '') : trackUri;
    const artists = (meta.artists as { name?: string }[] | undefined ?? [])
      .map((a) => a?.name ?? '')
      .filter(Boolean)
      .join(', ');
    const album = String(meta.albumName ?? meta.album ?? '');
    items.push({
      rank,
      trackId,
      title: String(meta.trackName ?? ''),
      artists,
      album,
      imageUrl: normalizeCoverArtUrl(String(meta.displayImageUri ?? '')),
      externalUrl: trackId ? `https://open.spotify.com/track/${trackId}` : '',
      durationMs: 0,
      popularity: 0,
      releaseDate: String(meta.releaseDate ?? ''),
    });
    if (items.length >= maxTracks) break;
  }
  return items;
}

async function fetchSpotifyChartDirectInner(
  chart: SpotifyChartTabId,
  bearerToken: string,
  signal?: AbortSignal,
): Promise<SpotifyFetchResult> {
  if (!isSpotifyChartsDirectTabSupported(chart)) {
    return { ok: false, errorCode: 'empty', authFailed: false, premiumBlocked: false };
  }
  const meta = SPOTIFY_CHART_SLUGS[chart];
  if (!meta) {
    return { ok: false, errorCode: 'not_found', authFailed: false, premiumBlocked: false };
  }
  let hadNetworkFailure = false;
  for (const date of chartDateCandidates()) {
    if (signal?.aborted) {
      return { ok: false, errorCode: 'unknown', authFailed: false, premiumBlocked: false };
    }
    try {
      const url = `${CHARTS_API_BASE}/auth/v0/charts/${meta.slug}/${date}`;
      const res = await nrmDirectFetch(
        url,
        {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            Accept: 'application/json',
            Origin: 'https://charts.spotify.com',
            Referer: 'https://charts.spotify.com/',
          },
          signal,
        },
        'spotify-charts',
      );
      if (!res.ok) {
        if (res.status === 401) return { ok: false, errorCode: 'auth_failed', authFailed: true, premiumBlocked: false };
        if (res.status === 403) {
          return {
            ok: false,
            errorCode: 'forbidden',
            authFailed: true,
            premiumBlocked: false,
          };
        }
        if (res.status === 404) continue;
        if (res.status === 429) {
          return { ok: false, errorCode: 'server', authFailed: false, premiumBlocked: false };
        }
        return { ok: false, errorCode: 'server', authFailed: false, premiumBlocked: false };
      }
      const root = (await res.json()) as Record<string, unknown>;
      const items = parseSpotifyChartEntries(root, 100);
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
      hadNetworkFailure = true;
      continue;
    }
  }
  return hadNetworkFailure
    ? { ok: false, errorCode: 'network', authFailed: false, premiumBlocked: false }
    : { ok: false, errorCode: 'empty', authFailed: false, premiumBlocked: false };
}

async function fetchSpotifyChartDirect(
  chart: SpotifyChartTabId,
  bearerToken: string,
  signal?: AbortSignal,
): Promise<SpotifyFetchResult> {
  return runSpotifyDirectSerialized(() =>
    fetchSpotifyChartDirectInner(chart, bearerToken, signal),
  );
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
      errorCode: 'backend_unreachable',
      authFailed: false,
      premiumBlocked: false,
    };
  }
}

async function fetchPlaylistWithDevFallback(
  chart: SpotifyChartTabId,
  source: SpotifyChartSource,
  headers: HeadersInit,
  signal?: AbortSignal,
): Promise<SpotifyFetchResult> {
  if (signal?.aborted) {
    return { ok: false, errorCode: 'unknown', authFailed: false, premiumBlocked: false };
  }
  if (isStandaloneApp() && source === 'charts') {
    const h = headers as Record<string, string>;
    const bearer = (h.Authorization ?? h.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer) {
      return { ok: false, errorCode: 'charts_session', authFailed: false, premiumBlocked: false };
    }
    return fetchSpotifyChartDirect(chart, bearer, signal);
  }

  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return {
      ok: false,
      errorCode: 'backend_unreachable',
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
  signal?: AbortSignal,
): Promise<ChartFetchOutcome> {
  return fetchSpotifyChartWithAuthRetry(source, (headers) =>
    fetchPlaylistWithDevFallback(chart, source, headers, signal),
  );
}

export type { SpotifyChartSource };

/** 설정 화면 등 — 기술 문구 유지 */
export { nrmChartsSpotifyNotConfiguredMessage };
