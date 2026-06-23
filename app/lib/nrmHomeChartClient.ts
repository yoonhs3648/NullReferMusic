import { fetchAppleMusicChart } from '@/lib/nrmAppleMusicChartsClient';
import { fetchSpotifyPlaylistChart } from '@/lib/nrmChartsClient';
import type { ChartFetchOutcome, ChartTrackItem } from '@/lib/nrmChartsTypes';
import { fetchLastfmChart } from '@/lib/nrmLastfmChartsClient';
import { fetchMelonRealtimeChart } from '@/lib/nrmMelonRealtimeChartsClient';
import type { NrmMainPageChartSource } from '@/lib/nrmMainPageChartSettings';
import {
  homeChartDownloadSourceFromChartSource,
  isMainPageChartSourceTokenReady,
} from '@/lib/nrmMainPageChartSettings';

export const NRM_HOME_CHART_TOP_N = 20;

/** 홈 차트 메모리 캐시 TTL — 메인 재진입 시 불필요한 재조회 방지 */
const HOME_CHART_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

export type HomeChartLoadResult =
  | {
      ok: true;
      items: ChartTrackItem[];
      chartSource: NrmMainPageChartSource;
      fetchedAt: number;
    }
  | { ok: false };

type HomeChartMemoryCache = {
  items: ChartTrackItem[];
  chartSource: NrmMainPageChartSource;
  fetchedAt: number;
  /** bumpHomeChartRefresh 시 증가 — 캐시 무효화 키 */
  refreshEpoch: number;
  /** 상위 N곡 지문 — 순위·곡 구성 변경 감지용 */
  fingerprint: string;
};

let memoryCache: HomeChartMemoryCache | null = null;
let inflight: Promise<HomeChartLoadResult> | null = null;
let inflightChartSource: NrmMainPageChartSource | null = null;

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
export function peekHomeChartCache(
  chartSource: NrmMainPageChartSource,
  refreshEpoch: number,
): HomeChartLoadResult | null {
  return readMemoryCache(chartSource, refreshEpoch, Date.now());
}

function readMemoryCache(
  chartSource: NrmMainPageChartSource,
  refreshEpoch: number,
  now: number,
): HomeChartLoadResult | null {
  const cached = memoryCache;
  if (!cached) return null;
  if (cached.chartSource !== chartSource) return null;
  if (cached.refreshEpoch !== refreshEpoch) return null;
  if (now - cached.fetchedAt > HOME_CHART_CACHE_TTL_MS) return null;
  return {
    ok: true,
    items: cached.items,
    chartSource: cached.chartSource,
    fetchedAt: cached.fetchedAt,
  };
}

function writeMemoryCache(
  items: ChartTrackItem[],
  chartSource: NrmMainPageChartSource,
  fetchedAt: number,
  refreshEpoch: number,
): void {
  memoryCache = {
    items,
    chartSource,
    fetchedAt,
    refreshEpoch,
    fingerprint: homeChartItemsFingerprint(items),
  };
}

async function fetchChartPayload(
  chartSource: NrmMainPageChartSource,
  signal?: AbortSignal,
): Promise<ChartFetchOutcome> {
  switch (chartSource) {
    case 'melon-top100':
      return fetchMelonRealtimeChart('top100');
    case 'melon-hot100':
      return fetchMelonRealtimeChart('hot100');
    case 'spotify-top100-kr':
      return fetchSpotifyPlaylistChart('top100-kr-daily', 'charts', signal);
    case 'spotify-top100-global':
      return fetchSpotifyPlaylistChart('top100-global-daily', 'charts', signal);
    case 'apple-top100-kr':
      return fetchAppleMusicChart('top100-kr');
    case 'apple-top100-global':
      return fetchAppleMusicChart('top100-global');
    case 'lastfm-top100-kr':
      return fetchLastfmChart('top100-kr');
    case 'lastfm-top100-global':
      return fetchLastfmChart('top100-global');
    default:
      return { ok: false, errorCode: 'unknown' };
  }
}

async function fetchHomeChartTop20Network(
  chartSource: NrmMainPageChartSource,
  signal?: AbortSignal,
): Promise<HomeChartLoadResult> {
  if (signal?.aborted) return { ok: false };

  if (!(await isMainPageChartSourceTokenReady(chartSource))) {
    return { ok: false };
  }

  const out = await fetchChartPayload(chartSource, signal);
  if (signal?.aborted) return { ok: false };
  if (!out.ok || out.data.items.length === 0) {
    return { ok: false };
  }

  const fetchedAt = Date.now();
  const items = sliceTopN(out.data.items, NRM_HOME_CHART_TOP_N);
  return { ok: true, items, chartSource, fetchedAt };
}

/**
 * 선택한 차트 소스에서 Top 20만 조회 (플랫폼 폴백 없음).
 * @param refreshEpoch `homeChartEpoch` — 바뀌면 캐시 무시
 */
export async function fetchHomeChartTop20(
  chartSource: NrmMainPageChartSource,
  signal?: AbortSignal,
  refreshEpoch = 0,
): Promise<HomeChartLoadResult> {
  const now = Date.now();
  const cached = readMemoryCache(chartSource, refreshEpoch, now);
  if (cached) return cached;

  if (inflight && inflightChartSource === chartSource) {
    const shared = await inflight;
    if (signal?.aborted) return { ok: false };
    return shared;
  }

  const run = (async (): Promise<HomeChartLoadResult> => {
    const out = await fetchHomeChartTop20Network(chartSource, signal);
    if (out.ok) {
      writeMemoryCache(out.items, out.chartSource, out.fetchedAt, refreshEpoch);
    }
    return out;
  })();

  inflight = run;
  inflightChartSource = chartSource;
  try {
    return await run;
  } finally {
    if (inflight === run) {
      inflight = null;
      inflightChartSource = null;
    }
  }
}

/** @deprecated homeChartDownloadSourceFromChartSource 사용 */
export function homeChartDownloadSource(
  chartSource: NrmMainPageChartSource,
): 'melon' | 'chart' | 'lastfm' {
  return homeChartDownloadSourceFromChartSource(chartSource);
}
