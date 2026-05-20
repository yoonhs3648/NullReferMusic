import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import {
  nrmChartsSpotifyBackendConnectionMessage,
  nrmChartsSpotifyGenericErrorMessage,
  nrmChartsSpotifyNotConfiguredMessage,
  nrmChartsSpotifyPlaylistBlockedMessage,
} from '@/lib/nrmChartsStrings';
import type {
  SpotifyChartOutcome,
  SpotifyChartPayload,
} from '@/lib/nrmChartsTypes';

function messageForError(code: string | undefined, httpStatus: number): string {
  if (code === 'spotify_not_configured' || code === 'spotify_playlist_not_configured') {
    return nrmChartsSpotifyNotConfiguredMessage;
  }
  if (code === 'spotify_playlist_not_accessible') {
    return nrmChartsSpotifyPlaylistBlockedMessage;
  }
  if (httpStatus === 503) {
    return nrmChartsSpotifyNotConfiguredMessage;
  }
  if (httpStatus === 404 && code === 'spotify_playlist_not_accessible') {
    return nrmChartsSpotifyPlaylistBlockedMessage;
  }
  if (httpStatus >= 500 || code === 'spotify_api_error' || code === 'spotify_auth_failed') {
    return nrmChartsSpotifyGenericErrorMessage;
  }
  return nrmChartsSpotifyGenericErrorMessage;
}

async function fetchSpotifyWithBase(
  base: string,
  market: string | undefined,
  credHeaders: HeadersInit,
): Promise<SpotifyChartOutcome> {
  try {
    const q = market?.trim()
      ? `?market=${encodeURIComponent(market.trim())}`
      : '';
    const res = await nrmBackendFetch(`${base}/api/charts/spotify/top100${q}`, {
      headers: credHeaders,
    });
    const rawText = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        const err = JSON.parse(rawText) as { error?: string };
        code = err.error;
      } catch {
        code = undefined;
      }
      return { ok: false, message: messageForError(code, res.status) };
    }
    const data = JSON.parse(rawText) as SpotifyChartPayload;
    if (!data?.items || !Array.isArray(data.items)) {
      return { ok: false, message: nrmChartsSpotifyGenericErrorMessage };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: nrmChartsSpotifyBackendConnectionMessage };
  }
}

export async function fetchSpotifyTopChart(
  market?: string,
): Promise<SpotifyChartOutcome> {
  const { buildSpotifyChartHeaders } = await import(
    '@/lib/nrmSpotifyApiClient'
  );
  const credHeaders = await buildSpotifyChartHeaders();
  const resolved = await getResolvedApiBaseUrl();
  const primary = resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return { ok: false, message: nrmChartsSpotifyBackendConnectionMessage };
  }
  const first = await fetchSpotifyWithBase(primary, market, credHeaders);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return fetchSpotifyWithBase(fallback, market, credHeaders);
}
