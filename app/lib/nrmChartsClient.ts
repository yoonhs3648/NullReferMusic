import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
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
