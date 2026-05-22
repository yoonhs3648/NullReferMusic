import AsyncStorage from '@react-native-async-storage/async-storage';

const CREDS_KEY = 'nrmSpotifyApiCredentials_v1';
const TOKEN_KEY = 'nrmSpotifyAccessTokenCache_v1';
const MANUAL_ACCESS_TOKEN_KEY = 'nrmSpotifyManualAccessToken_v1';

export type NrmSpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

export type NrmSpotifyAccessTokenCache = {
  accessToken: string;
  /** epoch milliseconds */
  expiresAt: number;
};

/** Client ID·Secret (자동 발급 화면에서 저장) */
export async function getSpotifyCredentials(): Promise<NrmSpotifyCredentials | null> {
  try {
    const raw = await AsyncStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NrmSpotifyCredentials;
    return {
      clientId: (parsed.clientId ?? '').trim(),
      clientSecret: (parsed.clientSecret ?? '').trim(),
    };
  } catch {
    return null;
  }
}

export async function hasSpotifyCredentials(): Promise<boolean> {
  const c = await getSpotifyCredentials();
  return !!(c?.clientId && c?.clientSecret);
}

export async function saveSpotifyCredentials(
  creds: NrmSpotifyCredentials,
): Promise<void> {
  const clientId = creds.clientId.trim();
  const clientSecret = creds.clientSecret.trim();
  if (!clientId && !clientSecret) {
    await AsyncStorage.removeItem(CREDS_KEY);
    return;
  }
  await AsyncStorage.setItem(
    CREDS_KEY,
    JSON.stringify({ clientId, clientSecret }),
  );
}

/** API 토큰 등록 화면: 액세스 토큰 저장 */
export async function getManualSpotifyAccessToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(MANUAL_ACCESS_TOKEN_KEY);
    const t = raw?.trim();
    return t ?? null;
  } catch {
    return null;
  }
}

export async function saveManualSpotifyAccessToken(token: string): Promise<void> {
  await AsyncStorage.setItem(MANUAL_ACCESS_TOKEN_KEY, token.trim());
}

/** Client Credentials 발급 토큰(차트 API·관리 화면 연동) */
export async function persistClientCredentialsToken(
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const trimmed = accessToken.trim();
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  await saveSpotifyAccessTokenCache({ accessToken: trimmed, expiresAt });
  await saveManualSpotifyAccessToken(trimmed);
}

/**
 * 관리 화면에서 사용자가 직접 입력·저장한 토큰.
 * 차트 API에는 사용하지 않음(Client Credentials만 사용).
 */
export async function persistManualSpotifyAccessTokenOnly(
  accessToken: string,
): Promise<void> {
  await saveManualSpotifyAccessToken(accessToken);
}

/** @deprecated use persistClientCredentialsToken */
export async function persistSpotifyAccessTokenForApp(
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  await persistClientCredentialsToken(accessToken, expiresInSeconds);
}

export async function clearManualSpotifyAccessToken(): Promise<void> {
  await AsyncStorage.removeItem(MANUAL_ACCESS_TOKEN_KEY);
}

/**
 * 차트·API 호출에 쓸 수 있는 Spotify 인증 상태.
 * 우선순위(요청 헤더): 수동 액세스 토큰 → 캐시 토큰 → Client Credentials(ID·Secret)
 */
export async function hasSpotifyChartAccess(): Promise<boolean> {
  const manual = await getManualSpotifyAccessToken();
  if (manual) return true;
  const cache = await getSpotifyAccessTokenCache();
  if (cache && cache.expiresAt > Date.now()) return true;
  const c = await getSpotifyCredentials();
  return !!(c?.clientId && c?.clientSecret);
}

export async function clearAllSpotifyAppData(): Promise<void> {
  await AsyncStorage.multiRemove([CREDS_KEY, TOKEN_KEY, MANUAL_ACCESS_TOKEN_KEY]);
}

/** @deprecated use clearAllSpotifyAppData */
export async function clearSpotifyCredentials(): Promise<void> {
  await clearAllSpotifyAppData();
}

export async function getSpotifyAccessTokenCache(): Promise<NrmSpotifyAccessTokenCache | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NrmSpotifyAccessTokenCache;
    if (!parsed.accessToken?.trim() || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSpotifyAccessTokenCache(
  cache: NrmSpotifyAccessTokenCache,
): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(cache));
}

export async function clearSpotifyAccessTokenCache(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export function maskSecret(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}${'•'.repeat(Math.min(12, s.length - 8))}${s.slice(-4)}`;
}
