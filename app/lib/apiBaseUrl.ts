import AsyncStorage from '@react-native-async-storage/async-storage';

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const STORAGE_KEY = 'nrm.apiBaseUrl';

export function normalizeApiBaseUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  return s.replace(/\/+$/, '');
}

function mapLocalhostApiToAndroidEmulator(url: string): string {
  if (Platform.OS !== 'android') return url;
  if (Constants.isDevice) return url;
  return url
    .replace(/^http:\/\/localhost:8787\b/i, 'http://10.0.2.2:8787')
    .replace(/^http:\/\/127\.0\.0\.1:8787\b/i, 'http://10.0.2.2:8787');
}

function isLikelyLanDevHostname(hostname: string): boolean {
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return false;
  }
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

type Manifestish = {
  hostUri?: string;
  debuggerHost?: string;
};

function inferDevApiBaseFromExpoHost(): string | null {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return null;

  const expoGo = (
    Constants as { expoGoConfig?: { debuggerHost?: string } | null }
  ).expoGoConfig;
  const legacy = (Constants as { manifest?: Manifestish | null }).manifest;

  const rawCandidates = [
    Constants.expoConfig?.hostUri,
    expoGo?.debuggerHost,
    legacy?.hostUri,
    legacy?.debuggerHost,
  ];

  for (const raw of rawCandidates) {
    if (!raw || typeof raw !== 'string') continue;
    const host = raw.split(':')[0]?.trim();
    if (host && isLikelyLanDevHostname(host)) {
      return `http://${host}:8787`;
    }
  }
  return null;
}

function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/** Real devices cannot reach the dev machine's backend via "localhost" — ignore bad overrides. */
function shouldIgnoreStoredBaseOnDevice(stored: string): boolean {
  if (Platform.OS === 'web') return false;
  if (!Constants.isDevice) return false;
  return isLocalhostUrl(stored);
}

export function getDefaultApiBaseUrl(): string {
  if (
    typeof process !== 'undefined' &&
    process.env?.EXPO_PUBLIC_API_BASE_URL
  ) {
    return mapLocalhostApiToAndroidEmulator(
      normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL) ||
        'http://localhost:8787',
    );
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname && isLikelyLanDevHostname(hostname)) {
      return `http://${hostname}:8787`;
    }
  }

  /**
   * iOS/Android(Expo Go·스탠드얼론): 디버그 호스트로 PC 백엔드(:8787)를 추론하지 않습니다.
   * 네이티브 검색·저장은 기기 내 로직만 사용합니다.
   */
  if (Platform.OS === 'web') {
    const fromExpoHost = inferDevApiBaseFromExpoHost();
    if (fromExpoHost) {
      return mapLocalhostApiToAndroidEmulator(fromExpoHost);
    }
  }

  const extra = Constants.expoConfig?.extra as
    | { apiBaseUrl?: string }
    | undefined;
  const fromExtra = extra?.apiBaseUrl;
  if (fromExtra && typeof fromExtra === 'string') {
    const base =
      normalizeApiBaseUrl(fromExtra) || 'http://localhost:8787';
    return mapLocalhostApiToAndroidEmulator(base);
  }

  return mapLocalhostApiToAndroidEmulator('http://localhost:8787');
}

export async function getResolvedApiBaseUrl(): Promise<string> {
  /**
   * iOS/Android: URL 다운로더·검색이 PC 서버를 쓰지 않으므로 AsyncStorage API 주소를 쓰지 않습니다.
   * (웹 전용 주소를 네이티브에서 잘못 쓰는 것을 막고, Expo Go·APK·IPA 동작을 맞춥니다.)
   */
  if (Platform.OS !== 'web') {
    return getDefaultApiBaseUrl();
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = normalizeApiBaseUrl(stored);
      if (n) {
        if (shouldIgnoreStoredBaseOnDevice(n)) {
          await AsyncStorage.removeItem(STORAGE_KEY);
        } else {
          return mapLocalhostApiToAndroidEmulator(n);
        }
      }
    }
  } catch {}
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
