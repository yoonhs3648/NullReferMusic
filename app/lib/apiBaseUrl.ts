import AsyncStorage from '@react-native-async-storage/async-storage';

import Constants from 'expo-constants';

const STORAGE_KEY = 'nrm.apiBaseUrl';

export function normalizeApiBaseUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  return s.replace(/\/+$/, '');
}

/** 빌드·환경 변수 기본값 (AsyncStorage 미사용) */
export function getDefaultApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiBaseUrl?: string }
    | undefined;
  const fromExtra = extra?.apiBaseUrl;
  if (fromExtra && typeof fromExtra === 'string') {
    return normalizeApiBaseUrl(fromExtra) || 'http://localhost:8787';
  }
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL) {
    return (
      normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL) ||
      'http://localhost:8787'
    );
  }
  return 'http://localhost:8787';
}

export async function getResolvedApiBaseUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = normalizeApiBaseUrl(stored);
      if (n) return n;
    }
  } catch {
    /* 저장소 실패 시 기본값 */
  }
  return getDefaultApiBaseUrl();
}

export async function setApiBaseUrlOverride(url: string | null): Promise<void> {
  if (!url || !normalizeApiBaseUrl(url)) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, normalizeApiBaseUrl(url));
}

export async function clearApiBaseUrlOverride(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
