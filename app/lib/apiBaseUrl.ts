import AsyncStorage from '@react-native-async-storage/async-storage';

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

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

  /** Expo Go·웹 개발: Metro 호스트 IP로 PC 백엔드(:8787) 추론 */
  if (usesPcBackendInDev()) {
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
   * 릴리스 APK/IPA: PC API 주소 저장·조회 없음 (기기 단독).
   * Expo Go·웹 개발: 저장된 LAN 주소 허용.
   */
  if (Platform.OS !== 'web' && !usesPcBackendInDev()) {
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
