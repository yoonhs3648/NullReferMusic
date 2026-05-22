import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type { AppleMusicChartTabId } from '@/lib/nrmAppleMusicChartCatalog';
import {
  appleMusicErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import type { ChartFetchOutcome, SpotifyChartPayload } from '@/lib/nrmChartsTypes';

type FetchFail = { ok: false; errorCode: ChartErrorCode };
type FetchSuccess = { ok: true; data: SpotifyChartPayload };
type FetchResult = FetchSuccess | FetchFail;

async function fetchWithBase(
  base: string,
  chart: AppleMusicChartTabId,
): Promise<FetchResult> {
  try {
    const q = `?chart=${encodeURIComponent(chart)}`;
    const res = await nrmBackendFetch(`${base}/api/charts/apple-music/rss${q}`);
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
        errorCode: appleMusicErrorFromApi(code, res.status),
      };
    }
    const data = JSON.parse(rawText) as SpotifyChartPayload;
    if (!data?.items || !Array.isArray(data.items)) {
      return { ok: false, errorCode: 'unknown' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, errorCode: 'network' };
  }
}

async function fetchWithDevFallback(
  chart: AppleMusicChartTabId,
): Promise<FetchResult> {
  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return { ok: false, errorCode: 'network' };
  }

  const first = await fetchWithBase(primary, chart);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return fetchWithBase(fallback, chart);
}

export async function fetchAppleMusicChart(
  chart: AppleMusicChartTabId,
): Promise<ChartFetchOutcome> {
  const result = await fetchWithDevFallback(chart);
  if (result.ok) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errorCode: result.errorCode };
}
