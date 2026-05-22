import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import {
  lastfmErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import type { LastfmChartTabId } from '@/lib/nrmLastfmChartCatalog';
import type { ChartFetchOutcome, SpotifyChartPayload } from '@/lib/nrmChartsTypes';
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
