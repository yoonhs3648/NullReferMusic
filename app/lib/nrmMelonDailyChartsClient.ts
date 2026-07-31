/**
 * Melon 일간 차트 (최신 게시분).
 * 특정 과거일 dayTime 파라미터는 Melon이 무시하므로, 과거일은 주간 폴백은
 * `nrmMelonAiLabChartSearch.ts`에서 처리한다.
 */

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
  MELON_DEFAULT_GENRE_ID,
  type MelonGenreId,
  melonGenreLabel,
} from '@/lib/nrmMelonGenreChartCatalog';
import { parseMelonGenreChartHtml } from '@/lib/nrmMelonGenreChartsParse';

const MELON_BASE = 'https://www.melon.com';
const MELON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type MelonDailyChartQuery = {
  classCd?: MelonGenreId;
};

function melonErrorFromBody(error: string | undefined, status: number): ChartErrorCode {
  if (error === 'melon_invalid_genre' || error === 'melon_invalid_chart') return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  if (status === 404) return 'not_found';
  if (error === 'melon_fetch_failed') return 'network';
  return 'unknown';
}

/** HTML에서 `2026.07.29` 형태 게시일 추출 */
export function parseMelonDailyChartDateLabel(html: string): string | null {
  const m = html.match(/(\d{4})\.(\d{2})\.(\d{2})\s*장르종합/) || html.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function buildDailyUrl(classCd: MelonGenreId): string {
  if (classCd && classCd !== MELON_DEFAULT_GENRE_ID) {
    return `${MELON_BASE}/chart/day/index.htm?classCd=${encodeURIComponent(classCd)}&moved=Y`;
  }
  return `${MELON_BASE}/chart/day/index.htm`;
}

async function fetchMelonDailyDirect(
  classCd: MelonGenreId,
): Promise<ChartFetchOutcome & { dateLabel?: string | null }> {
  try {
    const url = buildDailyUrl(classCd);
    const res = await nrmDirectFetch(
      url,
      {
        headers: {
          'User-Agent': MELON_UA,
          Accept: 'text/html,application/xhtml+xml',
          Referer: `${MELON_BASE}/chart/day/index.htm`,
        },
      },
      'melon-daily-chart',
    );
    if (!res.ok) {
      return { ok: false, errorCode: melonErrorFromBody(undefined, res.status) };
    }
    const html = await res.text();
    const items = parseMelonGenreChartHtml(html);
    if (items.length === 0) {
      return { ok: false, errorCode: 'empty' };
    }
    const dateLabel = parseMelonDailyChartDateLabel(html);
    return {
      ok: true,
      data: {
        platform: 'melon',
        playlistId: `daily:${classCd}:${dateLabel ?? 'latest'}`,
        playlistName: `Melon 일간 · ${melonGenreLabel(classCd)}${dateLabel ? ` · ${dateLabel}` : ''}`,
        market: 'KR',
        fetchedAt: new Date().toISOString(),
        items,
      },
      dateLabel,
    };
  } catch {
    return { ok: false, errorCode: 'network' };
  }
}

async function fetchMelonDailyViaBackend(
  classCd: MelonGenreId,
  baseUrl: string,
): Promise<ChartFetchOutcome & { dateLabel?: string | null }> {
  try {
    const params = new URLSearchParams({ classCd });
    const res = await nrmBackendFetch(
      `${baseUrl}/api/charts/melon/daily?${params.toString()}`,
      { method: 'GET' },
    );
    const body = (await res.json().catch(() => ({}))) as SpotifyChartPayload & {
      error?: string;
      dateLabel?: string;
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
        playlistId: body.playlistId ?? `daily:${classCd}`,
        playlistName: body.playlistName ?? `Melon 일간 · ${melonGenreLabel(classCd)}`,
        market: body.market ?? 'KR',
        fetchedAt: body.fetchedAt ?? new Date().toISOString(),
        items: body.items,
      },
      dateLabel: body.dateLabel ?? null,
    };
  } catch {
    return { ok: false, errorCode: 'backend_unreachable' };
  }
}

/** Melon에 게시된 최신 일간 차트 */
export async function fetchMelonDailyChart(
  query: MelonDailyChartQuery = {},
): Promise<ChartFetchOutcome & { dateLabel?: string | null }> {
  const classCd = query.classCd ?? MELON_DEFAULT_GENRE_ID;

  const useBackend = usesPcBackendInDev() && !isStandaloneApp();
  if (useBackend) {
    const primary = await getResolvedApiBaseUrl();
    const fallback = getDefaultApiBaseUrl();
    const first = await fetchMelonDailyViaBackend(classCd, primary);
    if (first.ok || primary === fallback) return first;
    return fetchMelonDailyViaBackend(classCd, fallback);
  }

  if (usesPcBackendInDev()) {
    const base = await getResolvedApiBaseUrl();
    const viaBackend = await fetchMelonDailyViaBackend(classCd, base);
    if (viaBackend.ok) return viaBackend;
  }

  return fetchMelonDailyDirect(classCd);
}
