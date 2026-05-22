import AsyncStorage from '@react-native-async-storage/async-storage';



const CREDS_KEY = 'nrmLastfmApiCredentials_v1';

const TOKEN_KEY = 'nrmLastfmAccessTokenCache_v1';

const MANUAL_ACCESS_TOKEN_KEY = 'nrmLastfmManualAccessToken_v1';



export type NrmLastfmCredentials = {

  clientId: string;

  clientSecret: string;

};



export type NrmLastfmAccessTokenCache = {

  accessToken: string;

  /** epoch milliseconds */

  expiresAt: number;

};



export async function getLastfmCredentials(): Promise<NrmLastfmCredentials | null> {

  try {

    const raw = await AsyncStorage.getItem(CREDS_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as NrmLastfmCredentials;

    return {

      clientId: (parsed.clientId ?? '').trim(),

      clientSecret: (parsed.clientSecret ?? '').trim(),

    };

  } catch {

    return null;

  }

}



export async function hasLastfmCredentials(): Promise<boolean> {

  const c = await getLastfmCredentials();

  return !!(c?.clientId && c?.clientSecret);

}



export async function saveLastfmCredentials(

  creds: NrmLastfmCredentials,

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



export async function getManualLastfmAccessToken(): Promise<string | null> {

  try {

    const raw = await AsyncStorage.getItem(MANUAL_ACCESS_TOKEN_KEY);

    const t = raw?.trim();

    return t ?? null;

  } catch {

    return null;

  }

}



export async function saveManualLastfmAccessToken(token: string): Promise<void> {

  await AsyncStorage.setItem(MANUAL_ACCESS_TOKEN_KEY, token.trim());

}



export async function persistClientCredentialsLastfmToken(

  accessToken: string,

  expiresInSeconds: number,

): Promise<void> {

  const trimmed = accessToken.trim();

  const expiresAt = Date.now() + expiresInSeconds * 1000;

  await saveLastfmAccessTokenCache({ accessToken: trimmed, expiresAt });

  await saveManualLastfmAccessToken(trimmed);

}



export async function persistManualLastfmAccessTokenOnly(

  accessToken: string,

): Promise<void> {

  await saveManualLastfmAccessToken(accessToken);

}



export async function clearManualLastfmAccessToken(): Promise<void> {

  await AsyncStorage.removeItem(MANUAL_ACCESS_TOKEN_KEY);

}



export async function hasLastfmChartAccess(): Promise<boolean> {

  const manual = await getManualLastfmAccessToken();

  if (manual) return true;

  const cache = await getLastfmAccessTokenCache();

  if (cache && cache.expiresAt > Date.now()) return true;

  const c = await getLastfmCredentials();

  return !!(c?.clientId && c?.clientSecret);

}



export async function clearAllLastfmAppData(): Promise<void> {

  await AsyncStorage.multiRemove([CREDS_KEY, TOKEN_KEY, MANUAL_ACCESS_TOKEN_KEY]);

}



export async function getLastfmAccessTokenCache(): Promise<NrmLastfmAccessTokenCache | null> {

  try {

    const raw = await AsyncStorage.getItem(TOKEN_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as NrmLastfmAccessTokenCache;

    if (!parsed.accessToken?.trim() || !parsed.expiresAt) {

      return null;

    }

    return parsed;

  } catch {

    return null;

  }

}



export async function saveLastfmAccessTokenCache(

  cache: NrmLastfmAccessTokenCache,

): Promise<void> {

  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(cache));

}



export async function clearLastfmAccessTokenCache(): Promise<void> {

  await AsyncStorage.removeItem(TOKEN_KEY);

}



export function maskSecret(secret: string): string {

  const s = secret.trim();

  if (s.length <= 8) return '••••••••';

  return `${s.slice(0, 4)}${'•'.repeat(Math.min(12, s.length - 8))}${s.slice(-4)}`;

}

