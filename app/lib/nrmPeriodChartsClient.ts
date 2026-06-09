import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import {
  lastfmErrorFromApi,
  spotifyErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import { buildLastfmChartAuthHeaders, refreshLastfmChartToken } from '@/lib/nrmLastfmTokenSync';
import { buildSpotifyChartAuthHeaders } from '@/lib/nrmSpotifyTokenSync';
import type {
  PeriodChartGranularity,
  PeriodChartPlatform,
  PeriodChartRegion,
} from '@/lib/nrmPeriodChartCatalog';
import {
  buildLastfmPeriodUnixRange,
  periodChartPlaylistLabel,
  PERIOD_CHART_MAX_RANK,
  PERIOD_CHART_PAGE_SIZE,
} from '@/lib/nrmPeriodChartCatalog';
import {
  fetchSpotifyPeriodChartPage,
  type SpotifyPeriodChartQuery,
} from '@/lib/nrmSpotifyPeriodChartsClient';
import type { SpotifyPeriodChartKind } from '@/lib/nrmSpotifyPeriodChartCatalog';
import { DEFAULT_WEEKLY_SNAPSHOT_DAY, loadWeeklySnapshotDay } from '@/lib/nrmWeeklySnapshotSettings';
import type { PeriodChartPagePayload } from '@/lib/nrmPeriodChartsTypes';
import type { LastfmAuthHandlers } from '@/lib/nrmLastfmAuthFlow';
import {
  isLastfmChartAuthErrorCode,
  runLastfmAuthFlow,
} from '@/lib/nrmLastfmAuthFlow';
import {
  isSpotifyChartsFetchAuthError,
  runSpotifyChartsAuthFlow,
  type SpotifyChartsAuthHandlers,
} from '@/lib/nrmSpotifyChartsAuthFlow';

export type PeriodChartQuery = {
  region: PeriodChartRegion;
  /** Last.fm 전용 */
  granularity: PeriodChartGranularity;
  /** Spotify 전용 */
  spotifyKind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
  snapshotDow: number;
  offset: number;
  limit?: number;
};

function toSpotifyQuery(query: PeriodChartQuery): SpotifyPeriodChartQuery {
  return {
    region: query.region,
    spotifyKind: query.spotifyKind,
    year: query.year,
    month: query.month,
    day: query.day,
    weekOfMonth: query.weekOfMonth,
    snapshotDow: query.snapshotDow,
    offset: query.offset,
    limit: query.limit,
  };
}

type PageFail = { ok: false; errorCode: ChartErrorCode; authFailed: boolean };

type PageOk = { ok: true; data: PeriodChartPagePayload };

function isSpotifyAuth(code: ChartErrorCode): boolean {
  return (
    code === 'auth_failed' ||
    code === 'charts_session' ||
    code === 'forbidden' ||
    code === 'premium_required'
  );
}

function isLastfmAuth(code: string | undefined, status: number): boolean {
  return (
    code === 'lastfm_auth_failed' ||
    status === 401 ||
    status === 403
  );
}

async function fetchLastfmPeriodDirect(
  query: PeriodChartQuery,
  apiKey: string,
): Promise<PageOk | PageFail> {
  const limit = query.limit ?? PERIOD_CHART_PAGE_SIZE;
  const page = Math.floor(query.offset / limit) + 1;
  const isKr = query.region === 'kr';
  const { from, to } = buildLastfmPeriodUnixRange(
    query.year,
    query.granularity,
    query.month,
  );
  const pairs: [string, string][] = [
    ['method', 'chart.gettoptracks'],
    ['api_key', apiKey],
    ['format', 'json'],
    ['limit', String(limit)],
    ['page', String(page)],
    ['from', String(from)],
    ['to', String(to)],
  ];
  const qs = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  try {
    const res = await nrmDirectFetch(
      `https://ws.audioscrobbler.com/2.0/?${qs}`,
      undefined,
      'lastfm-period-charts',
    );
    if (!res.ok) {
      const authFailed = res.status === 401 || res.status === 403;
      return {
        ok: false,
        errorCode: authFailed ? 'auth_failed' : 'server',
        authFailed,
      };
    }
    const root = (await res.json()) as Record<string, unknown>;
    if (typeof root.error === 'number') {
      const code = root.error as number;
      if (code === 10 || code === 4 || code === 26) {
        return { ok: false, errorCode: 'auth_failed', authFailed: true };
      }
      return { ok: false, errorCode: 'server', authFailed: false };
    }
    const trackNode = (root.tracks as { track?: unknown } | undefined)?.track;
    const trackArr: Record<string, unknown>[] = Array.isArray(trackNode)
      ? (trackNode as Record<string, unknown>[])
      : trackNode
        ? [trackNode as Record<string, unknown>]
        : [];
    const items = trackArr.map((t, i) => {
      const artistNode = t.artist as { name?: string } | string | undefined;
      const artists =
        typeof artistNode === 'object' ? (artistNode?.name ?? '') : String(artistNode ?? '');
      const mbidRaw = String(t.mbid ?? '').trim();
      return {
        rank: query.offset + i + 1,
        trackId: mbidRaw || String(t.url ?? ''),
        mbid: mbidRaw || undefined,
        title: String(t.name ?? ''),
        artists,
        album: '',
        imageUrl: '',
        externalUrl: String(t.url ?? ''),
        durationMs: 0,
        popularity: 0,
        releaseDate: '',
      };
    });
    const totalPages = Number(
      (root.tracks as { '@attr'?: { totalPages?: string } })?.['@attr']?.totalPages ?? 1,
    );
    const totalAvailable = Math.min(totalPages * limit, 1000);
    const hasMore =
      items.length >= limit &&
      query.offset + items.length < totalAvailable &&
      query.offset + items.length < 1000;
    return {
      ok: true,
      data: {
        platform: 'lastfm',
        playlistId: `period-${query.region}`,
        playlistName: periodChartPlaylistLabel(query),
        market: query.region === 'kr' ? 'KR' : 'GLOBAL',
        fetchedAt: new Date().toISOString(),
        items,
        offset: query.offset,
        limit,
        hasMore,
      },
    };
  } catch {
    return { ok: false, errorCode: 'network', authFailed: false };
  }
}

async function fetchPeriodWithBase(
  platform: PeriodChartPlatform,
  base: string,
  query: PeriodChartQuery,
  headers: HeadersInit,
): Promise<PageOk | PageFail> {
  const limit = query.limit ?? PERIOD_CHART_PAGE_SIZE;
  const q = new URLSearchParams({
    region: query.region,
    year: String(query.year),
    offset: String(query.offset),
    limit: String(limit),
  });
  const path =
    platform === 'spotify'
      ? (() => {
          q.set('kind', query.spotifyKind);
          q.set('month', String(query.month));
          q.set('day', String(query.day));
          q.set('week', String(query.weekOfMonth));
          q.set('snapshotDay', String(query.snapshotDow));
          return `/api/charts/period/spotify?${q}`;
        })()
      : (() => {
          q.set('granularity', query.granularity);
          if (query.granularity === 'month') {
            q.set('month', String(query.month));
          }
          return `/api/charts/period/lastfm?${q}`;
        })();
  try {
    const res = await nrmBackendFetch(`${base}${path}`, { headers });
    const raw = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = (JSON.parse(raw) as { error?: string }).error;
      } catch {
        code = undefined;
      }
      const errorCode =
        platform === 'spotify'
          ? spotifyErrorFromApi(code, res.status)
          : lastfmErrorFromApi(code, res.status);
      return {
        ok: false,
        errorCode,
        authFailed:
          platform === 'spotify'
            ? isSpotifyAuth(errorCode)
            : isLastfmAuth(code, res.status),
      };
    }
    const data = JSON.parse(raw) as PeriodChartPagePayload;
    if (!data?.items || !Array.isArray(data.items)) {
      return { ok: false, errorCode: 'unknown', authFailed: false };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, errorCode: 'backend_unreachable', authFailed: false };
  }
}

export type PeriodChartFetchOutcome =
  | PageOk
  | { ok: false; errorCode: ChartErrorCode };

async function fetchPeriodChartPageInner(
  platform: PeriodChartPlatform,
  query: PeriodChartQuery,
  signal?: AbortSignal,
): Promise<PeriodChartFetchOutcome> {
  const spotifyQuery: PeriodChartQuery =
    platform === 'spotify'
      ? {
          ...query,
          snapshotDow:
            query.snapshotDow ?? (await loadWeeklySnapshotDay()),
        }
      : query;

  if (platform === 'spotify') {
    const auth = await buildSpotifyChartAuthHeaders('charts');
    if ('error' in auth) {
      return { ok: false, errorCode: 'charts_session' };
    }
    if (isStandaloneApp()) {
      const h = auth.headers as Record<string, string>;
      const bearer = (h.Authorization ?? '').replace(/^Bearer\s+/i, '').trim();
      if (!bearer) return { ok: false, errorCode: 'charts_session' };
      const r = await fetchSpotifyPeriodChartPage(
        toSpotifyQuery(spotifyQuery),
        bearer,
        signal,
      );
      return r.ok ? r : { ok: false, errorCode: r.errorCode };
    }
    const resolved = await getResolvedApiBaseUrl();
    const primary =
      resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
    if (!primary) return { ok: false, errorCode: 'backend_unreachable' };
    let r = await fetchPeriodWithBase('spotify', primary, spotifyQuery, auth.headers);
    if (r.ok || !usesPcBackendInDev()) {
      return r.ok ? r : { ok: false, errorCode: r.errorCode };
    }
    const fb = getDefaultApiBaseUrl();
    if (fb !== primary) {
      r = await fetchPeriodWithBase('spotify', fb, spotifyQuery, auth.headers);
    }
    return r.ok ? r : { ok: false, errorCode: r.errorCode };
  }

  const auth = await buildLastfmChartAuthHeaders();
  if ('error' in auth) {
    return { ok: false, errorCode: 'not_configured' };
  }
  if (isStandaloneApp()) {
    const h = auth.headers as Record<string, string>;
    const apiKey =
      h['X-NRM-Lastfm-Api-Key'] ??
      h.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
      '';
    if (!apiKey) return { ok: false, errorCode: 'not_configured' };
    let r = await fetchLastfmPeriodDirect(query, apiKey);
    if (!r.ok && r.authFailed) {
      const refreshed = await refreshLastfmChartToken();
      if (refreshed.ok) {
        const rh = refreshed.headers as Record<string, string>;
        const key =
          rh['X-NRM-Lastfm-Api-Key'] ??
          rh.Authorization?.replace(/^Bearer\s+/i, '').trim() ??
          '';
        if (key) r = await fetchLastfmPeriodDirect(query, key);
      }
    }
    return r.ok ? r : { ok: false, errorCode: r.errorCode };
  }
  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) return { ok: false, errorCode: 'backend_unreachable' };
  let r = await fetchPeriodWithBase('lastfm', primary, query, auth.headers);
  if (!r.ok && r.authFailed) {
    const refreshed = await refreshLastfmChartToken();
    if (refreshed.ok) {
      r = await fetchPeriodWithBase('lastfm', primary, query, refreshed.headers);
    }
  }
  if (r.ok || !usesPcBackendInDev()) {
    return r.ok ? r : { ok: false, errorCode: r.errorCode };
  }
  const fb = getDefaultApiBaseUrl();
  if (fb !== primary) {
    r = await fetchPeriodWithBase('lastfm', fb, query, auth.headers);
  }
  return r.ok ? r : { ok: false, errorCode: r.errorCode };
}

export async function fetchPeriodChartPage(
  platform: PeriodChartPlatform,
  query: PeriodChartQuery,
  signal?: AbortSignal,
  chartsAuth?: SpotifyChartsAuthHandlers,
  lastfmAuth?: LastfmAuthHandlers,
): Promise<PeriodChartFetchOutcome> {
  const fetchOnce = () => fetchPeriodChartPageInner(platform, query, signal);
  if (
    platform === 'spotify' &&
    chartsAuth &&
    (chartsAuth.onRenewChartsBearer ||
      chartsAuth.onShowBearerExpired ||
      chartsAuth.onOpenChartsSession)
  ) {
    return runSpotifyChartsAuthFlow(
      fetchOnce,
      (r) => !r.ok && isSpotifyChartsFetchAuthError(r),
      chartsAuth,
    );
  }
  if (platform === 'lastfm' && lastfmAuth) {
    return runLastfmAuthFlow(
      fetchOnce,
      (r) => !r.ok && isLastfmChartAuthErrorCode(r.errorCode),
      lastfmAuth,
    );
  }
  return fetchOnce();
}
