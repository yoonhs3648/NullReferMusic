import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type { NrmSpotifyCredentials } from '@/lib/nrmSpotifyApiSettings';

export type SpotifyTokenIssueOutcome =
  | { ok: true; accessToken: string; expiresIn: number; tokenType: string }
  | { ok: false; message: string };

function messageForTokenError(code: string | undefined): string {
  if (code === 'spotify_not_configured') {
    return 'Client ID와 Client Secret을 입력하세요.';
  }
  if (code === 'spotify_auth_failed') {
    return 'Spotify 인증에 실패했습니다. ID·Secret을 확인하세요.';
  }
  return '액세스 토큰을 발급하지 못했습니다.';
}

async function issueTokenWithBase(
  base: string,
  creds: NrmSpotifyCredentials,
): Promise<SpotifyTokenIssueOutcome> {
  try {
    const res = await nrmBackendFetch(`${base}/api/charts/spotify/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = (JSON.parse(raw) as { error?: string }).error;
      } catch {
        code = undefined;
      }
      return { ok: false, message: messageForTokenError(code) };
    }
    const data = JSON.parse(raw) as {
      accessToken?: string;
      expiresIn?: number;
      tokenType?: string;
    };
    if (!data.accessToken) {
      return { ok: false, message: messageForTokenError(undefined) };
    }
    return {
      ok: true,
      accessToken: data.accessToken,
      expiresIn: data.expiresIn ?? 3600,
      tokenType: data.tokenType ?? 'Bearer',
    };
  } catch {
    return {
      ok: false,
      message: '백엔드에 연결하지 못했습니다. PC 서버(8787)를 확인하세요.',
    };
  }
}

async function issueTokenDirect(creds: NrmSpotifyCredentials): Promise<SpotifyTokenIssueOutcome> {
  try {
    const credentials = btoa(`${creds.clientId}:${creds.clientSecret}`);
    const res = await nrmDirectFetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }, 'spotify-token');
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        return { ok: false, message: 'Spotify 인증에 실패했습니다. ID·Secret을 확인하세요.' };
      }
      return { ok: false, message: '액세스 토큰을 발급하지 못했습니다.' };
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number; token_type?: string };
    if (!data.access_token) return { ok: false, message: '액세스 토큰을 발급하지 못했습니다.' };
    return {
      ok: true,
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 3600,
      tokenType: data.token_type ?? 'Bearer',
    };
  } catch {
    return { ok: false, message: '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.' };
  }
}

export async function issueSpotifyAccessToken(
  creds: NrmSpotifyCredentials,
): Promise<SpotifyTokenIssueOutcome> {
  if (isStandaloneApp()) {
    return issueTokenDirect(creds);
  }
  const resolved = await getResolvedApiBaseUrl();
  const primary = resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return {
      ok: false,
      message: '백엔드에 연결하지 못했습니다. PC 서버(8787)를 확인하세요.',
    };
  }
  const first = await issueTokenWithBase(primary, creds);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return issueTokenWithBase(fallback, creds);
}

/** 차트 API: 수동/캐시 Bearer → Client ID·Secret 순 */
export async function buildSpotifyChartHeaders(): Promise<HeadersInit> {
  const {
    getManualSpotifyAccessToken,
    getSpotifyAccessTokenCache,
    getSpotifyCredentials,
  } = await import('@/lib/nrmSpotifyApiSettings');

  const manual = await getManualSpotifyAccessToken();
  if (manual) {
    return { Authorization: `Bearer ${manual}` };
  }

  const cache = await getSpotifyAccessTokenCache();
  if (cache && cache.expiresAt > Date.now()) {
    return { Authorization: `Bearer ${cache.accessToken}` };
  }

  const creds = await getSpotifyCredentials();
  if (creds?.clientId && creds?.clientSecret) {
    return {
      'X-NRM-Spotify-Client-Id': creds.clientId,
      'X-NRM-Spotify-Client-Secret': creds.clientSecret,
    };
  }

  return {};
}
