import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import type { PeriodChartRegion } from '@/lib/nrmPeriodChartCatalog';
import type { PeriodChartPagePayload } from '@/lib/nrmPeriodChartsTypes';
import {
  buildSpotifyPeriodSlug,
  listSpotifyWeeksInMonth,
  spotifyDailyChartSegment,
  spotifyPeriodChartMaxRank,
  spotifyPeriodChartPlaylistLabel,
  spotifyWeeklyAnchorForWeek,
  SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS,
  SPOTIFY_PERIOD_CHART_SINGLE_MAX,
  type SpotifyPeriodChartKind,
} from '@/lib/nrmSpotifyPeriodChartCatalog';
import { DEFAULT_WEEKLY_SNAPSHOT_DAY } from '@/lib/nrmWeeklySnapshotSettings';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

const CHARTS_API = 'https://charts-spotify-com-service.spotify.com/auth/v0/charts';
const CACHE_TTL_MS = 30 * 60 * 1000;

export type SpotifyPeriodChartQuery = {
  region: PeriodChartRegion;
  spotifyKind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
  snapshotDow: number;
  offset: number;
  limit?: number;
};

type PageFail = { ok: false; errorCode: ChartErrorCode; authFailed: boolean };
type PageOk = { ok: true; data: PeriodChartPagePayload };

type AvgRankAgg = ChartTrackItem & { _rankSum: number; _appearances: number };

const listCache = new Map<string, { items: ChartTrackItem[]; expiresAt: number }>();

function cacheKey(parts: string): string {
  return parts;
}

function queryCacheKey(q: SpotifyPeriodChartQuery): string {
  const sd = q.snapshotDow;
  if (q.spotifyKind === 'daily') {
    return cacheKey(`d-${q.region}-${q.year}-${q.month}-${q.day}`);
  }
  if (q.spotifyKind === 'weekly') {
    return cacheKey(`w-${q.region}-${q.year}-${q.month}-${q.weekOfMonth}-sd${sd}`);
  }
  return cacheKey(`m-${q.region}-${q.year}-${q.month}-sd${sd}`);
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
      imageUrl: normalizeCoverArtUrl(String(meta.displayImageUri ?? '')),
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

function mergeIntoAgg(map: Map<string, AvgRankAgg>, items: ChartTrackItem[]) {
  for (const item of items) {
    const key = item.trackId || `${item.title}|${item.artists}`;
    const rank = item.rank > 0 ? item.rank : 9999;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...item, _rankSum: rank, _appearances: 1 });
    } else {
      prev._rankSum += rank;
      prev._appearances += 1;
    }
  }
}

function finalizeAgg(map: Map<string, AvgRankAgg>, maxRank: number): ChartTrackItem[] {
  return [...map.values()]
    .sort((a, b) => {
      const avgA = a._rankSum / a._appearances;
      const avgB = b._rankSum / b._appearances;
      if (avgA !== avgB) return avgA - avgB;
      if (a._appearances !== b._appearances) return b._appearances - a._appearances;
      return a.title.localeCompare(b.title);
    })
    .slice(0, maxRank)
    .map((row, i) => ({
      ...row,
      rank: i + 1,
      popularity: Math.max(1, Math.round(row._rankSum / row._appearances)),
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

async function fetchWeeklyAnchorOnce(
  region: PeriodChartRegion,
  anchor: string,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  const key = cacheKey(`wa-${region}-${anchor}`);
  const cached = getCachedList(key);
  if (cached) return cached;

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

async function fetchMonthlyFromWeeks(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  const key = queryCacheKey(query);
  const cached = getCachedList(key);
  if (cached) return cached;

  const weeks = listSpotifyWeeksInMonth(query.year, query.month, query.snapshotDow);
  if (weeks.length === 0) {
    return { ok: false, errorCode: 'empty', authFailed: false };
  }

  const map = new Map<string, AvgRankAgg>();
  let first = true;
  for (const w of weeks) {
    if (!first) await sleep(SPOTIFY_PERIOD_CHART_REQUEST_GAP_MS, signal);
    first = false;
    const weekData = await fetchWeeklyAnchorOnce(query.region, w.anchor, bearer, signal);
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

async function loadFullList(
  query: SpotifyPeriodChartQuery,
  bearer: string,
  signal?: AbortSignal,
): Promise<ChartTrackItem[] | PageFail> {
  switch (query.spotifyKind) {
    case 'daily':
      return fetchDailyChartOnce(query, bearer, signal);
    case 'weekly': {
      const anchor = spotifyWeeklyAnchorForWeek(
        query.year,
        query.month,
        query.weekOfMonth,
        query.snapshotDow,
      );
      if (!anchor) return { ok: false, errorCode: 'empty', authFailed: false };
      return fetchWeeklyAnchorOnce(query.region, anchor, bearer, signal);
    }
    case 'monthly':
      return fetchMonthlyFromWeeks(query, bearer, signal);
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
    const q = {
      ...query,
      snapshotDow: query.snapshotDow ?? DEFAULT_WEEKLY_SNAPSHOT_DAY,
    };
    const loaded = await loadFullList(q, bearer, signal);
    if (!Array.isArray(loaded)) return loaded;
    return slicePage(q, loaded);
  } catch {
    return { ok: false, errorCode: 'network', authFailed: false };
  }
}
