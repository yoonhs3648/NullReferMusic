import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import {
  melonPeriodChartPlaylistLabel,
  melonYearlyChartGenre,
  type MelonGenreId,
  type MelonPeriodChartKind,
  MELON_PERIOD_MAX_RANK,
  MELON_PERIOD_PAGE_SIZE,
  melonWeekRange,
} from '@/lib/nrmMelonGenreChartCatalog';
import { parseMelonGenreChartHtml } from '@/lib/nrmMelonGenreChartsParse';
import type { PeriodChartPagePayload } from '@/lib/nrmPeriodChartsTypes';

const MELON_BASE = 'https://www.melon.com';
const MELON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type MelonGenreChartQuery = {
  kind: MelonPeriodChartKind;
  classCd: MelonGenreId;
  year: number;
  month: number;
  weekOfMonth: number;
  offset: number;
  limit?: number;
};

type PageFail = { ok: false; errorCode: ChartErrorCode };
type PageOk = { ok: true; data: PeriodChartPagePayload };

function melonErrorFromBody(error: string | undefined, status: number): ChartErrorCode {
  if (error === 'melon_invalid_kind' || error === 'melon_invalid_genre') return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  if (status === 404) return 'not_found';
  if (error === 'melon_fetch_failed') return 'network';
  return 'unknown';
}

function buildMelonFetchUrl(query: MelonGenreChartQuery): string {
  const { kind, classCd, year, month, weekOfMonth } = query;
  if (kind === 'yearly') {
    return `${MELON_BASE}/chart/age/list.htm?chartType=YE&chartGenre=${melonYearlyChartGenre(classCd)}&chartDate=${year}&moved=Y`;
  }
  if (kind === 'monthly') {
    const rankMonth = `${year}${String(month).padStart(2, '0')}`;
    return `${MELON_BASE}/chart/month/index.htm?classCd=${classCd}&moved=Y&rankMonth=${rankMonth}`;
  }
  const { startDay, endDay } = melonWeekRange(year, month, weekOfMonth);
  return `${MELON_BASE}/chart/week/index.htm?classCd=${classCd}&moved=Y&startDay=${startDay}&endDay=${endDay}`;
}

function slicePage(
  all: ChartTrackItem[],
  query: MelonGenreChartQuery,
): PeriodChartPagePayload {
  const limit = query.limit ?? MELON_PERIOD_PAGE_SIZE;
  const offset = Math.max(0, query.offset);
  const end = Math.min(all.length, offset + limit);
  const items = offset >= all.length ? [] : all.slice(offset, end);
  return {
    platform: 'melon',
    playlistId: `${query.classCd}:${query.kind}:${query.year}:${query.month}:${query.weekOfMonth}`,
    playlistName: melonPeriodChartPlaylistLabel(query),
    market: 'KR',
    fetchedAt: new Date().toISOString(),
    items,
    offset,
    limit,
    hasMore: end < all.length && end < MELON_PERIOD_MAX_RANK,
  };
}

async function fetchMelonGenreDirect(query: MelonGenreChartQuery): Promise<PageOk | PageFail> {
  try {
    const url = buildMelonFetchUrl(query);
    const res = await nrmDirectFetch(
      url,
      {
        headers: {
          'User-Agent': MELON_UA,
          Accept: 'text/html,application/xhtml+xml',
          Referer: `${MELON_BASE}/chart/search/index.htm`,
        },
      },
      'melon-genre-chart',
    );
    if (!res.ok) {
      return { ok: false, errorCode: melonErrorFromBody(undefined, res.status) };
    }
    const html = await res.text();
    const all = parseMelonGenreChartHtml(html);
    if (all.length === 0) {
      return { ok: false, errorCode: 'empty' };
    }
    return { ok: true, data: slicePage(all, query) };
  } catch {
    return { ok: false, errorCode: 'network' };
  }
}

async function fetchMelonGenreViaBackend(
  query: MelonGenreChartQuery,
  baseUrl: string,
): Promise<PageOk | PageFail> {
  const limit = query.limit ?? MELON_PERIOD_PAGE_SIZE;
  const params = new URLSearchParams({
    kind: query.kind,
    classCd: query.classCd,
    year: String(query.year),
    offset: String(query.offset),
    limit: String(limit),
  });
  if (query.kind !== 'yearly') {
    params.set('month', String(query.month));
  }
  if (query.kind === 'weekly') {
    params.set('week', String(query.weekOfMonth));
  }
  try {
    const res = await nrmBackendFetch(`${baseUrl}/api/charts/melon/genre?${params.toString()}`, {
      method: 'GET',
    });
    const body = (await res.json().catch(() => ({}))) as PeriodChartPagePayload & {
      error?: string;
      chartKey?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        errorCode: melonErrorFromBody(body.error, res.status),
      };
    }
    if (!body.items || !Array.isArray(body.items)) {
      return { ok: false, errorCode: 'empty' };
    }
    return {
      ok: true,
      data: {
        platform: body.platform ?? 'melon',
        playlistId: body.playlistId || body.chartKey || '',
        playlistName: body.playlistName ?? melonPeriodChartPlaylistLabel(query),
        market: body.market ?? 'KR',
        fetchedAt: body.fetchedAt ?? new Date().toISOString(),
        items: body.items,
        offset: body.offset ?? query.offset,
        limit: body.limit ?? limit,
        hasMore: !!body.hasMore,
      },
    };
  } catch {
    return { ok: false, errorCode: 'backend_unreachable' };
  }
}

export async function fetchMelonGenreChartPage(
  query: MelonGenreChartQuery,
  signal?: AbortSignal,
): Promise<PageOk | PageFail> {
  if (signal?.aborted) {
    return { ok: false, errorCode: 'unknown' };
  }

  const useBackend = usesPcBackendInDev() && !isStandaloneApp();
  if (useBackend) {
    const primary = await getResolvedApiBaseUrl();
    const fallback = getDefaultApiBaseUrl();
    const first = await fetchMelonGenreViaBackend(query, primary);
    if (first.ok || primary === fallback) return first;
    return fetchMelonGenreViaBackend(query, fallback);
  }

  if (usesPcBackendInDev()) {
    const base = await getResolvedApiBaseUrl();
    const viaBackend = await fetchMelonGenreViaBackend(query, base);
    if (viaBackend.ok) return viaBackend;
  }

  return fetchMelonGenreDirect(query);
}
