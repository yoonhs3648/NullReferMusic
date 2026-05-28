import AsyncStorage from '@react-native-async-storage/async-storage';

const DEEPL_KEY = 'nrm_deepl_api_key_v1';
const DEEPL_USAGE_CACHE_KEY = 'nrm_deepl_usage_cache_v1';

export type NrmDeepLUsageSnapshot = {
  characterCount: number;
  characterLimit: number;
  checkedAt: number;
};

export async function getDeepLApiKey(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(DEEPL_KEY))?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function saveDeepLApiKey(apiKey: string): Promise<void> {
  const token = apiKey.trim();
  if (!token) {
    await AsyncStorage.removeItem(DEEPL_KEY);
    return;
  }
  await AsyncStorage.setItem(DEEPL_KEY, token);
}

export async function loadDeepLUsageSnapshot(): Promise<NrmDeepLUsageSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(DEEPL_USAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NrmDeepLUsageSnapshot;
    if (
      !Number.isFinite(parsed.characterCount) ||
      !Number.isFinite(parsed.characterLimit) ||
      !Number.isFinite(parsed.checkedAt)
    ) {
      return null;
    }
    return {
      characterCount: Math.max(0, Math.floor(parsed.characterCount)),
      characterLimit: Math.max(0, Math.floor(parsed.characterLimit)),
      checkedAt: Math.max(0, Math.floor(parsed.checkedAt)),
    };
  } catch {
    return null;
  }
}

export async function saveDeepLUsageSnapshot(snapshot: NrmDeepLUsageSnapshot): Promise<void> {
  await AsyncStorage.setItem(DEEPL_USAGE_CACHE_KEY, JSON.stringify(snapshot));
}

export async function clearDeepLUsageSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(DEEPL_USAGE_CACHE_KEY);
}
