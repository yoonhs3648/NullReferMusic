import type { SpotifyChartSource } from '@/lib/nrmSpotifyChartCatalog';
import {
  nrmChartsSpotifyChartsSessionMessage,
  nrmChartsSpotifyNotConfiguredMessage,
  nrmChartsSpotifyPremiumRequiredMessage,
} from '@/lib/nrmChartsStrings';
import { issueSpotifyAccessToken } from '@/lib/nrmSpotifyApiClient';
import { getSpotifyChartsAccount } from '@/lib/nrmSpotifyChartsSession';
import {
  clearManualSpotifyAccessToken,
  clearSpotifyAccessTokenCache,
  getManualSpotifyAccessToken,
  getSpotifyAccessTokenCache,
  getSpotifyCredentials,
  persistClientCredentialsToken,
  persistManualSpotifyAccessTokenOnly,
} from '@/lib/nrmSpotifyApiSettings';

export type SpotifyTokenSyncOutcome =
  | {
      ok: true;
      action: 'used_manual' | 'used_cache' | 'issued';
      expiresAt: number | null;
    }
  | { ok: false; message: string };

export type SpotifyChartAuthHeaders = {
  headers: Record<string, string>;
};

export async function issueSpotifyAccessTokenFromCredentials(): Promise<
  | { ok: true; accessToken: string; expiresAt: number; expiresInSec: number }
  | { ok: false; message: string }
> {
  const creds = await getSpotifyCredentials();
  if (!creds?.clientId || !creds?.clientSecret) {
    return { ok: false, message: nrmChartsSpotifyNotConfiguredMessage };
  }
  const issued = await issueSpotifyAccessToken(creds);
  if (!issued.ok) {
    return { ok: false, message: issued.message };
  }
  const expiresInSec = issued.expiresIn;
  const expiresAt = Date.now() + expiresInSec * 1000;
  return { ok: true, accessToken: issued.accessToken, expiresAt, expiresInSec };
}

/** 검색 메뉴 — 수동 토큰 → 캐시 → Client Credentials 재발급 */
export async function syncSpotifyAccessToken(opts?: {
  forceReissue?: boolean;
}): Promise<SpotifyTokenSyncOutcome> {
  const manual = await getManualSpotifyAccessToken();
  if (manual && !opts?.forceReissue) {
    return { ok: true, action: 'used_manual', expiresAt: null };
  }

  const cache = await getSpotifyAccessTokenCache();
  if (cache && cache.expiresAt > Date.now() && !opts?.forceReissue) {
    return { ok: true, action: 'used_cache', expiresAt: cache.expiresAt };
  }

  const issued = await issueSpotifyAccessTokenFromCredentials();
  if (!issued.ok) {
    return { ok: false, message: issued.message };
  }
  await persistClientCredentialsToken(issued.accessToken, issued.expiresInSec);
  return { ok: true, action: 'issued', expiresAt: issued.expiresAt };
}

/**
 * Spotify 차트 API 인증 헤더.
 * - charts: Bearer 토큰만 (charts.spotify.com Network Authorization)
 * - official: 공식 Web API — 수동 토큰 → 캐시 → Client Credentials
 */
export async function buildSpotifyChartAuthHeaders(
  source: SpotifyChartSource = 'charts',
): Promise<SpotifyChartAuthHeaders | { error: string }> {
  if (source === 'charts') {
    const account = await getSpotifyChartsAccount();
    if (!account?.bearerToken) {
      return { error: nrmChartsSpotifyChartsSessionMessage };
    }
    return {
      headers: { Authorization: `Bearer ${account.bearerToken}` },
    };
  }

  const creds = await getSpotifyCredentials();
  if (!creds?.clientId || !creds?.clientSecret) {
    return { error: nrmChartsSpotifyNotConfiguredMessage };
  }

  const manual = await getManualSpotifyAccessToken();
  if (manual) {
    return { headers: { Authorization: `Bearer ${manual}` } };
  }

  const cache = await getSpotifyAccessTokenCache();
  if (cache && cache.expiresAt > Date.now()) {
    return {
      headers: { Authorization: `Bearer ${cache.accessToken}` },
    };
  }

  const issued = await issueSpotifyAccessTokenFromCredentials();
  if (!issued.ok) {
    return { error: issued.message };
  }
  await persistClientCredentialsToken(issued.accessToken, issued.expiresInSec);
  return {
    headers: { Authorization: `Bearer ${issued.accessToken}` },
  };
}

export async function refreshSpotifyChartToken(): Promise<
  | { ok: true; headers: HeadersInit }
  | { ok: false; message: string }
> {
  await clearManualSpotifyAccessToken();
  await clearSpotifyAccessTokenCache();
  const issued = await issueSpotifyAccessTokenFromCredentials();
  if (!issued.ok) {
    return { ok: false, message: issued.message };
  }
  await persistClientCredentialsToken(issued.accessToken, issued.expiresInSec);
  await persistManualSpotifyAccessTokenOnly(issued.accessToken);
  return { ok: true, headers: { Authorization: `Bearer ${issued.accessToken}` } };
}

export { nrmChartsSpotifyPremiumRequiredMessage };
