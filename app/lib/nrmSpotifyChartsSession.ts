import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNT_KEY = 'nrmSpotifyChartsAccount_v2';

const LEGACY_ACCOUNT_KEY = 'nrmSpotifyChartsAccount_v1';
const LEGACY_BEARER_KEYS = [
  'nrmSpotifyChartsBearer_v1',
  'nrmSpotifyChartsBearerSavedAt_v1',
];

export function normalizeChartsBearerToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, '');
}

export type NrmSpotifyChartsAccount = {
  bearerToken: string;
};

export type SpotifyChartsSessionSave = {
  bearerToken?: string;
  /** @deprecated v1 migration */
  chartsAccessToken?: string;
};

function readBearer(parsed: Partial<SpotifyChartsSessionSave & { spDc?: string }>): string {
  const bearer =
    (parsed.bearerToken ?? '').trim() ||
    (parsed.chartsAccessToken ?? '').trim();
  return normalizeChartsBearerToken(bearer);
}

function normalizeAccount(
  parsed: Partial<SpotifyChartsSessionSave>,
): NrmSpotifyChartsAccount | null {
  const bearerToken = readBearer(parsed);
  if (!bearerToken) return null;
  return { bearerToken };
}

async function migrateLegacyAccount(): Promise<void> {
  const legacy = await AsyncStorage.getItem(LEGACY_ACCOUNT_KEY);
  if (!legacy) return;
  try {
    const parsed = JSON.parse(legacy) as Partial<SpotifyChartsSessionSave>;
    const bearerToken = readBearer(parsed);
    if (bearerToken) {
      await AsyncStorage.setItem(
        ACCOUNT_KEY,
        JSON.stringify({ bearerToken } satisfies NrmSpotifyChartsAccount),
      );
    }
    await AsyncStorage.removeItem(LEGACY_ACCOUNT_KEY);
  } catch {
    await AsyncStorage.removeItem(LEGACY_ACCOUNT_KEY);
  }
}

export async function getSpotifyChartsAccount(): Promise<NrmSpotifyChartsAccount | null> {
  try {
    await migrateLegacyAccount();
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NrmSpotifyChartsAccount>;
    return normalizeAccount(parsed);
  } catch {
    return null;
  }
}

export async function saveSpotifyChartsSession(
  input: SpotifyChartsSessionSave,
): Promise<void> {
  const bearerToken = readBearer(input);
  if (!bearerToken) {
    await AsyncStorage.removeItem(ACCOUNT_KEY);
    return;
  }
  await AsyncStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({ bearerToken } satisfies NrmSpotifyChartsAccount),
  );
}

/** 설정 화면 — Bearer 토큰만 저장 */
export async function saveSpotifyChartsSessionFromForm(bearerToken: string): Promise<void> {
  const token = normalizeChartsBearerToken(bearerToken);
  if (!token) {
    await clearAllSpotifyChartsSessionData();
    return;
  }
  await saveSpotifyChartsSession({ bearerToken: token });
}

export async function clearSpotifyChartsAccount(): Promise<void> {
  await AsyncStorage.removeItem(ACCOUNT_KEY);
}

export async function hasSpotifyChartsSessionAccess(): Promise<boolean> {
  const account = await getSpotifyChartsAccount();
  return account != null;
}

export async function clearAllSpotifyChartsSessionData(): Promise<void> {
  await AsyncStorage.multiRemove([
    ACCOUNT_KEY,
    LEGACY_ACCOUNT_KEY,
    ...LEGACY_BEARER_KEYS,
  ]);
}
