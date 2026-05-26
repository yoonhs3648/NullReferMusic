import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import type { PeriodChartRegion } from '@/lib/nrmPeriodChartCatalog';
import type { PeriodChartPagePayload } from '@/lib/nrmPeriodChartsTypes';
import {
  buildSpotifyPeriodSlug,
  getPeriodChartCurrentDate,
  listSpotifyWeeksInMonth,
  spotifyDailyChartSegment,
  spotifyPeriodChartMaxRank,
  spotifyPeriodChartPlaylistLabel,
  spotifyWeeklyAnchorForWeek,
  SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS,
  SPOTIFY_PERIOD_CHART_SINGLE_MAX,
  type SpotifyPeriodChartKind,
} from '@/lib/nrmSpotifyPeriodChartCatalog';

const CHARTS_API = 'https://charts-spotify-com-service.spotify.com/auth/v0/charts';
const CACHE_TTL_MS = 30 * 60 * 1000;

export type SpotifyPeriodChartQuery = {
  region: PeriodChartRegion;
  spotifyKind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
  offset: number;
  limit?: number;
};

type PageFail = { ok: false; errorCode: ChartErrorCode; authFailed: boolean };
type PageOk = { ok: true; data: PeriodChartPagePayload };

type StreamAgg = ChartTrackItem & { _streamSum: number };

const listCache = new Map<string, { items: ChartTrackItem[]; expiresAt: number }>();

function cacheKey(parts: string): string {
  return parts;
}

function queryCacheKey(q: SpotifyPeriodChartQuery): string {
  if (q.spotifyKind === 'daily') {
    return cacheKey(`d-${q.region}-${q.year}-${q.month}-${q.day}`);
  }
  if (q.spotifyKind === 'weekly') {
    return cacheKey(`w-${q.region}-${q.year}-${q.month}-${q.weekOfMonth}`);
  }
  if (q.spotifyKind === 'monthly') {
    return cacheKey(`m-${q.region}-${q.year}-${q.month}`);
  }
  return cacheKey(`y-${q.region}-${q.year}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('aborted'));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (signal?.aborted) reject(new Error('aborted'));
      else resolve();
    }, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

function resolveStreamCount(row: Record<string, unknown>): number {
  const entryData = row.chartEntryData as Record<string, unknown> | undefined;
  if (!entryData) return 0;
  const keys = [
    'cumulativePlayCount',
    'playCount',
    'streams',
    'streamingCount',
    'streamCount',
  ];
  for (const key of keys) {
    const v = entryData[key];
    if (typeof v === 'number' && v > 0) return Math.min(v, 2_147_483_647);
  }
  const streaming = entryData.streamingData as Record<string, unknown> | undefined;
  if (streaming) {
    for (const key of keys) {
      const v = streaming[key];
      if (typeof v === 'number' && v > 0) return Math.min(v, 2_147_483_647);
    }
  }
  return 0;
}

export function parseSpotifyPeriodChartEntries(
  root: Record<string, unknown>,
  maxTracks: number,
): ChartTrackItem[] {
  let entries = root.entries as unknown[] | undefined;
  if (!Array.isArray(entries) || entries.length === 0) {
    const responses = root.chartEntryViewResponses as { entries?: unknown[] }[] | undefined;
    if (Array.isArray(responses)) {
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
    const rankRaw = entryData?.currentRank ?? r.currentRank ?? items.length + 1;
    const rank = typeof rankRaw === 'number' ? rankRaw : items.length + 1;
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
      album: String(meta.albumName ?? meta.album ?? ''),
      imageUrl: String(meta.displayImageUri ?? ''),
      externalUrl: trackId ? `https://open.spotify.com/track/${trackId}` : '',
      durationMs: 0,
      popularity: resolveStreamCount(r),
      releaseDate: String(meta.releaseDate ?? ''),
    });
    if (items.length >= maxTracks) break;
  }
  return items;
}

async function chartsGet(
  slug: string,
  segment: string,
  bearer: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; root: Record<string, unknown> }
  | { ok: false; status: number; authFailed: boolean }
> {
  const url = `${CHARTS_API}/${slug}/${segment}`;
  const headers = {
    Authorization: `Bearer ${bearer}`,
    Accept: 'application/json',
    Origin: 'https://charts.spotify.com',
    Referer: 'https://charts.spotify.com/',
  };
  const res = await fetch(url, { headers, signal });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: res.status, authFailed: true };
  }
  if (res.status === 429) {
    return { ok: false, status: res.status, authFailed: false };
  }
  if (!res.ok) return { ok: false, status: res.status, authFailed: false };
  const root = (await res.json()) as Record<string, unknown>;
  return { ok: true, root };
}

function mergeIntoAgg(map: Map<string, StreamAgg>, items: ChartTrackItem[]) {
  for (const item of items) {
    const key = item.trackId || `${item.title}|${item.artists}`;
    const streams = item.popularity ?? 0;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...item, _streamSum: streams });
    } else {
      prev._streamSum += streams;
      prev.popularity = prev._streamSum;
    }
  }
}

function finalizeAgg(map: Map<string, StreamAgg>, maxRank: number): ChartTrackItem[] {
  return [...map.values()]
    .sort((a, b) => b._streamSum - a._streamSum)
    .slice(0, maxRank)
    .map((row, i) => ({
      ...row,
      rank: i + 1,
      popularity:
        row._streamSum > 2_147_483_647 ? 2_147_483_647 : row._streamSum,
    }));
}

function getCachedList(key: string): ChartTrackItem[] | null {
  const hit = listCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.items;
  return null;
}

function setCachedList(key: string, items: ChartTrackItem[]) {
  if (items.length > 0) {
    listCache.set(key, { items, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}

/** 주간 — 선택 주 1회 API만 */
async function fetchWeeklyChartOnce(
  region: PeriodChartRegion,
  year: number,
  month: number,
  weekOfMonth: number,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  const key = cacheKey(`w-${region}-${year}-${month}-${weekOfMonth}`);
  const cached = getCachedList(key);
  if (cached) return cached;

  const anchor = spotifyWeeklyAnchorForWeek(year, month, weekOfMonth);
  if (!anchor) return { ok: false, errorCode: 'empty', authFailed: false };

  const slug = buildSpotifyPeriodSlug(region, 'weekly');
  const out = await chartsGet(slug, anchor, bearer, signal);
  if (!out.ok) {
    if (out.authFailed) {
      return {
        ok: false,
        errorCode: out.status === 403 ? 'forbidden' : 'auth_failed',
        authFailed: true,
      };
    }
    if (out.status === 429) {
      return { ok: false, errorCode: 'server', authFailed: false };
    }
    return { ok: false, errorCode: 'empty', authFailed: false };
  }
  const items = parseSpotifyPeriodChartEntries(out.root, SPOTIFY_PERIOD_CHART_SINGLE_MAX);
  if (items.length === 0) {
    return { ok: false, errorCode: 'empty', authFailed: false };
  }
  setCachedList(key, items);
  return items;
}

/** 일간 — 1회 API */
async function fetchDailyChartOnce(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  const key = queryCacheKey(query);
  const cached = getCachedList(key);
  if (cached) return cached;

  const slug = buildSpotifyPeriodSlug(query.region, 'daily');
  const segment = spotifyDailyChartSegment(query.year, query.month, query.day);
  const out = await chartsGet(slug, segment, bearer, signal);
  if (!out.ok) {
    if (out.authFailed) {
      return {
        ok: false,
        errorCode: out.status === 403 ? 'forbidden' : 'auth_failed',
        authFailed: true,
      };
    }
    if (out.status === 429) {
      return { ok: false, errorCode: 'server', authFailed: false };
    }
    return { ok: false, errorCode: 'empty', authFailed: false };
  }
  const items = parseSpotifyPeriodChartEntries(
    out.root,
    spotifyPeriodChartMaxRank('daily'),
  );
  if (items.length === 0) {
    return { ok: false, errorCode: 'empty', authFailed: false };
  }
  setCachedList(key, items);
  return items;
}

/** 월간 — 해당 월 각 주(금요일) 주간 차트 합산, 주마다 1회만 */
async function fetchMonthlyFromWeeks(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  const key = queryCacheKey(query);
  const cached = getCachedList(key);
  if (cached) return cached;

  const weeks = listSpotifyWeeksInMonth(query.year, query.month);
  if (weeks.length === 0) {
    return { ok: false, errorCode: 'empty', authFailed: false };
  }

  const map = new Map<string, StreamAgg>();
  let first = true;
  for (const w of weeks) {
    if (!first) await sleep(SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS, signal);
    first = false;
    const weekData = await fetchWeeklyChartOnce(
      query.region,
      query.year,
      query.month,
      w.weekIndex,
      bearer,
      signal,
    );
    if (!Array.isArray(weekData)) {
      if (weekData.errorCode === 'auth_failed' || weekData.errorCode === 'forbidden') {
        return weekData;
      }
      if (weekData.errorCode === 'server') return weekData;
      continue;
    }
    mergeIntoAgg(map, weekData);
  }

  if (map.size === 0) {
    return { ok: false, errorCode: 'empty', authFailed: false };
  }
  const items = finalizeAgg(map, spotifyPeriodChartMaxRank('monthly'));
  setCachedList(key, items);
  return items;
}

/** 연간 — 1~12월 월간(주간 합산) 합산, 월마다 캐시 활용 */
async function fetchYearlyFromMonths(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  const key = queryCacheKey(query);
  const cached = getCachedList(key);
  if (cached) return cached;

  const { year: cy, month: cm } = getPeriodChartCurrentDate();
  const lastMonth = query.year === cy ? cm : 12;
  const map = new Map<string, StreamAgg>();
  let first = true;

  for (let mo = 1; mo <= lastMonth; mo++) {
    if (!first) await sleep(SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS, signal);
    first = false;
    const monthQuery: SpotifyPeriodChartQuery = {
      ...query,
      month: mo,
      spotifyKind: 'monthly',
    };
    const monthData = await fetchMonthlyFromWeeks(monthQuery, bearer, signal);
    if (!Array.isArray(monthData)) {
      if (monthData.errorCode === 'auth_failed' || monthData.errorCode === 'forbidden') {
        return monthData;
      }
      if (monthData.errorCode === 'server') return monthData;
      continue;
    }
    mergeIntoAgg(map, monthData);
  }

  if (map.size === 0) {
    return { ok: false, errorCode: 'empty', authFailed: false };
  }
  const items = finalizeAgg(map, spotifyPeriodChartMaxRank('yearly'));
  setCachedList(key, items);
  return items;
}

async function loadFullList(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  switch (query.spotifyKind) {
    case 'daily':
      return fetchDailyChartOnce(query, bearer, signal);
    case 'weekly':
      return fetchWeeklyChartOnce(
        query.region,
        query.year,
        query.month,
        query.weekOfMonth,
        bearer,
        signal,
      );
    case 'monthly':
      return fetchMonthlyFromWeeks(query, bearer, signal);
    case 'yearly':
      return fetchYearlyFromMonths(query, bearer, signal);
    default:
      return { ok: false, errorCode: 'unknown', authFailed: false };
  }
}

function slicePage(query: SpotifyPeriodChartQuery, all: ChartTrackItem[]): PageOk {
  const limit = query.limit ?? 50;
  const max = spotifyPeriodChartMaxRank(query.spotifyKind);
  const end = Math.min(query.offset + limit, all.length);
  const slice = all.slice(query.offset, end);
  const slug =
    query.spotifyKind === 'daily' || query.spotifyKind === 'weekly'
      ? buildSpotifyPeriodSlug(query.region, query.spotifyKind)
      : `spotify-period-${query.spotifyKind}`;
  const hasMore = end < all.length && end < max && slice.length >= limit;
  return {
    ok: true,
    data: {
      platform: 'spotify',
      playlistId: slug,
      playlistName: spotifyPeriodChartPlaylistLabel(query),
      market: query.region === 'kr' ? 'KR' : 'GLOBAL',
      fetchedAt: new Date().toISOString(),
      items: slice,
      offset: query.offset,
      limit,
      hasMore,
    },
  };
}

export async function fetchSpotifyPeriodChartPage(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<PageOk | PageFail> {
  try {
    const loaded = await loadFullList(query, bearer, signal);
    if (!Array.isArray(loaded)) return loaded;
    return slicePage(query, loaded);
  } catch {
    return { ok: false, errorCode: 'network', authFailed: false };
  }
}
