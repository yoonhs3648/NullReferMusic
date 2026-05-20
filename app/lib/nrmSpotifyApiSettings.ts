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
    if (!parsed.clientId?.trim() || !parsed.clientSecret?.trim()) {
      return null;
    }
    return {
      clientId: parsed.clientId.trim(),
      clientSecret: parsed.clientSecret.trim(),
    };
  } catch {
    return null;
  }
}

export async function hasSpotifyCredentials(): Promise<boolean> {
  return (await getSpotifyCredentials()) != null;
}

export async function saveSpotifyCredentials(
  creds: NrmSpotifyCredentials,
): Promise<void> {
  await AsyncStorage.setItem(
    CREDS_KEY,
    JSON.stringify({
      clientId: creds.clientId.trim(),
      clientSecret: creds.clientSecret.trim(),
    }),
  );
}

/** 수동 등록 화면: 액세스 토큰만 저장 */
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
  return (await getSpotifyCredentials()) != null;
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
