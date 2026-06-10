import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartFetchOutcome, SpotifyChartPayload } from '@/lib/nrmChartsTypes';
import {
  MELON_REALTIME_CHART_URLS,
  melonRealtimeChartPlaylistName,
  type MelonRealtimeChartTabId,
} from '@/lib/nrmMelonRealtimeChartCatalog';
import { parseMelonGenreChartHtml } from '@/lib/nrmMelonGenreChartsParse';

const MELON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type FetchFail = { ok: false; errorCode: ChartErrorCode };
type FetchSuccess = { ok: true; data: SpotifyChartPayload };
type FetchResult = FetchSuccess | FetchFail;

function melonErrorFromBody(error: string | undefined, status: number): ChartErrorCode {
  if (error === 'melon_invalid_chart') return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  if (status === 404) return 'not_found';
  if (error === 'melon_fetch_failed') return 'network';
  return 'unknown';
}

async function fetchMelonRealtimeDirect(tab: MelonRealtimeChartTabId): Promise<FetchResult> {
  try {
    const url = MELON_REALTIME_CHART_URLS[tab];
    const res = await nrmDirectFetch(
      url,
      {
        headers: {
          'User-Agent': MELON_UA,
          Accept: 'text/html,application/xhtml+xml',
          Referer: 'https://www.melon.com/chart/index.htm',
        },
      },
      'melon-realtime-chart',
    );
    if (!res.ok) {
      return { ok: false, errorCode: melonErrorFromBody(undefined, res.status) };
    }
    const html = await res.text();
    const items = parseMelonGenreChartHtml(html);
    if (items.length === 0) {
      return { ok: false, errorCode: 'empty' };
    }
    return {
      ok: true,
      data: {
        platform: 'melon',
        playlistId: tab,
        playlistName: melonRealtimeChartPlaylistName(tab),
        market: 'KR',
        fetchedAt: new Date().toISOString(),
        items,
      },
    };
  } catch {
    return { ok: false, errorCode: 'network' };
  }
}

async function fetchMelonRealtimeViaBackend(
  tab: MelonRealtimeChartTabId,
  baseUrl: string,
): Promise<FetchResult> {
  try {
    const res = await nrmBackendFetch(
      `${baseUrl}/api/charts/melon/realtime?chart=${encodeURIComponent(tab)}`,
      { method: 'GET' },
    );
    const body = (await res.json().catch(() => ({}))) as SpotifyChartPayload & {
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, errorCode: melonErrorFromBody(body.error, res.status) };
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return { ok: false, errorCode: 'empty' };
    }
    return {
      ok: true,
      data: {
        platform: body.platform ?? 'melon',
        playlistId: body.playlistId ?? tab,
        playlistName: body.playlistName ?? melonRealtimeChartPlaylistName(tab),
        market: body.market ?? 'KR',
        fetchedAt: body.fetchedAt ?? new Date().toISOString(),
        items: body.items,
      },
    };
  } catch {
    return { ok: false, errorCode: 'backend_unreachable' };
  }
}

export async function fetchMelonRealtimeChart(
  tab: MelonRealtimeChartTabId,
): Promise<ChartFetchOutcome> {
  const useBackend = usesPcBackendInDev() && !isStandaloneApp();
  if (useBackend) {
    const primary = await getResolvedApiBaseUrl();
    const fallback = getDefaultApiBaseUrl();
    const first = await fetchMelonRealtimeViaBackend(tab, primary);
    if (first.ok || primary === fallback) return first;
    return fetchMelonRealtimeViaBackend(tab, fallback);
  }

  if (usesPcBackendInDev()) {
    const base = await getResolvedApiBaseUrl();
    const viaBackend = await fetchMelonRealtimeViaBackend(tab, base);
    if (viaBackend.ok) return viaBackend;
  }

  return fetchMelonRealtimeDirect(tab);
}
