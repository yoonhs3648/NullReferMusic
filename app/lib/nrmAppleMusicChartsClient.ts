import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type { AppleMusicChartTabId } from '@/lib/nrmAppleMusicChartCatalog';
import {
  appleMusicErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import type { ChartFetchOutcome, ChartTrackItem, SpotifyChartPayload } from '@/lib/nrmChartsTypes';

type FetchFail = { ok: false; errorCode: ChartErrorCode };
type FetchSuccess = { ok: true; data: SpotifyChartPayload };
type FetchResult = FetchSuccess | FetchFail;

// ─── Direct RSS (Standalone APK / IPA) ────────────────────────────────────────

const APPLE_RSS_BASE = 'https://rss.marketingtools.apple.com/api/v2';

const APPLE_CHART_FEED: Record<AppleMusicChartTabId, { url: string; market: string; name: string }> = {
  'top100-kr': { url: `${APPLE_RSS_BASE}/kr/music/most-played/100/songs.json`, market: 'KR', name: 'Top 100 - Korea' },
  'top100-global': { url: `${APPLE_RSS_BASE}/us/music/most-played/100/songs.json`, market: 'GLOBAL', name: 'Top 100 - Global' },
};

async function fetchAppleMusicDirect(chart: AppleMusicChartTabId): Promise<FetchResult> {
  const meta = APPLE_CHART_FEED[chart];
  if (!meta) return { ok: false, errorCode: 'not_found' };
  try {
    const res = await fetch(meta.url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) return { ok: false, errorCode: 'forbidden' };
      if (res.status === 404) return { ok: false, errorCode: 'not_found' };
      return { ok: false, errorCode: 'server' };
    }
    const root = (await res.json()) as { feed?: { results?: Record<string, unknown>[]; title?: string } };
    const results = root?.feed?.results;
    if (!results || !Array.isArray(results) || results.length === 0) {
      return { ok: false, errorCode: 'empty' };
    }
    const items: ChartTrackItem[] = results.slice(0, 100).map((row, i) => {
      const genres = row?.genres as { name?: string }[] | undefined;
      const genre =
        Array.isArray(genres) && genres.length > 0
          ? String(genres[0]?.name ?? '').trim()
          : '';
      return {
        rank: i + 1,
        trackId: String(row?.id ?? ''),
        title: String(row?.name ?? ''),
        artists: String(row?.artistName ?? ''),
        album: '',
        genre,
        imageUrl: String(row?.artworkUrl100 ?? ''),
        externalUrl: String(row?.url ?? ''),
        durationMs: 0,
        popularity: 0,
        releaseDate: String(row?.releaseDate ?? ''),
      };
    });
    const data: SpotifyChartPayload = {
      platform: 'appleMusic',
      playlistId: chart,
      playlistName: (root?.feed?.title as string | undefined) ?? meta.name,
      market: meta.market,
      fetchedAt: new Date().toISOString(),
      items,
    };
    return { ok: true, data };
  } catch {
    return { ok: false, errorCode: 'network' };
  }
}

// ─── Backend proxy (Dev / Expo Go) ────────────────────────────────────────────

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
    return { ok: false, errorCode: 'backend_unreachable' };
  }
}

async function fetchWithDevFallback(
  chart: AppleMusicChartTabId,
): Promise<FetchResult> {
  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return { ok: false, errorCode: 'backend_unreachable' };
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
  const result = isStandaloneApp()
    ? await fetchAppleMusicDirect(chart)
    : await fetchWithDevFallback(chart);
  if (result.ok) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errorCode: result.errorCode };
}
