import { fetchSpotifyPlaylistChart } from '@/lib/nrmChartsClient';
import { fetchMelonRealtimeChart } from '@/lib/nrmMelonRealtimeChartsClient';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

export const NRM_HOME_CHART_TOP_N = 20;

/** 홈 차트 메모리 캐시 TTL — 메인 재진입 시 불필요한 재조회 방지 */
const HOME_CHART_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

export type HomeChartSource = 'melon' | 'spotify';

export type HomeChartLoadResult =
  | { ok: true; items: ChartTrackItem[]; source: HomeChartSource; fetchedAt: number }
  | { ok: false };

type HomeChartMemoryCache = {
  items: ChartTrackItem[];
  source: HomeChartSource;
  fetchedAt: number;
  /** bumpHomeChartRefresh 시 증가 — 캐시 무효화 키 */
  refreshEpoch: number;
  /** 상위 N곡 지문 — 순위·곡 구성 변경 감지용 */
  fingerprint: string;
};

let memoryCache: HomeChartMemoryCache | null = null;
let inflight: Promise<HomeChartLoadResult> | null = null;

function sliceTopN(items: ChartTrackItem[], n: number): ChartTrackItem[] {
  return items.slice(0, n).map((row, i) => ({
    ...row,
    rank: row.rank > 0 ? row.rank : i + 1,
  }));
}

export function homeChartItemsFingerprint(items: ChartTrackItem[]): string {
  return items
    .slice(0, NRM_HOME_CHART_TOP_N)
    .map((row, i) => `${row.rank > 0 ? row.rank : i + 1}:${row.trackId}`)
    .join('|');
}

/** 로고 탭·홈 복귀 시 호출 — 다음 fetch는 네트워크 강제 */
export function invalidateHomeChartCache(): void {
  memoryCache = null;
}

/** UI: 네트워크 없이 즉시 표시 가능한 유효 캐시 */
export function peekHomeChartCache(refreshEpoch: number): HomeChartLoadResult | null {
  return readMemoryCache(refreshEpoch, Date.now());
}

function readMemoryCache(refreshEpoch: number, now: number): HomeChartLoadResult | null {
  const cached = memoryCache;
  if (!cached) return null;
  if (cached.refreshEpoch !== refreshEpoch) return null;
  if (now - cached.fetchedAt > HOME_CHART_CACHE_TTL_MS) return null;
  return {
    ok: true,
    items: cached.items,
    source: cached.source,
    fetchedAt: cached.fetchedAt,
  };
}

function writeMemoryCache(
  items: ChartTrackItem[],
  source: HomeChartSource,
  fetchedAt: number,
  refreshEpoch: number,
): void {
  memoryCache = {
    items,
    source,
    fetchedAt,
    refreshEpoch,
    fingerprint: homeChartItemsFingerprint(items),
  };
}

async function fetchHomeChartTop20Network(
  signal?: AbortSignal,
): Promise<HomeChartLoadResult> {
  if (signal?.aborted) return { ok: false };

  const melon = await fetchMelonRealtimeChart('top100');
  if (signal?.aborted) return { ok: false };
  if (melon.ok && melon.data.items.length > 0) {
    const fetchedAt = Date.now();
    const items = sliceTopN(melon.data.items, NRM_HOME_CHART_TOP_N);
    return { ok: true, items, source: 'melon', fetchedAt };
  }

  for (const chartSource of ['charts', 'official'] as const) {
    if (signal?.aborted) return { ok: false };
    const spotify = await fetchSpotifyPlaylistChart(
      'top100-kr-daily',
      chartSource,
      signal,
    );
    if (spotify.ok && spotify.data.items.length > 0) {
      const fetchedAt = Date.now();
      const items = sliceTopN(spotify.data.items, NRM_HOME_CHART_TOP_N);
      return { ok: true, items, source: 'spotify', fetchedAt };
    }
  }

  return { ok: false };
}

/**
 * 멜론 실시간 → Spotify Korea Daily 순으로 Top 20.
 * @param refreshEpoch `homeChartEpoch` — 바뀌면 캐시 무시
 */
export async function fetchHomeChartTop20(
  signal?: AbortSignal,
  refreshEpoch = 0,
): Promise<HomeChartLoadResult> {
  const now = Date.now();
  const cached = readMemoryCache(refreshEpoch, now);
  if (cached) return cached;

  if (inflight) {
    const shared = await inflight;
    if (signal?.aborted) return { ok: false };
    return shared;
  }

  const run = (async (): Promise<HomeChartLoadResult> => {
    const out = await fetchHomeChartTop20Network(signal);
    if (out.ok) {
      writeMemoryCache(out.items, out.source, out.fetchedAt, refreshEpoch);
    }
    return out;
  })();

  inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

export function homeChartDownloadSource(
  source: HomeChartSource,
): 'melon' | 'chart' {
  return source === 'melon' ? 'melon' : 'chart';
}
