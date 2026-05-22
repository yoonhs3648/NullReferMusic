import { NativeModules, Platform } from 'react-native';

type NrmSpotifyCookieModule = {
  getSpDcCookie: () => Promise<string | null>;
};

const nrmNative = NativeModules.NrmSpotifyCookie as NrmSpotifyCookieModule | undefined;

export function hasNrmSpotifyCookieNativeModule(): boolean {
  return typeof nrmNative?.getSpDcCookie === 'function';
}

async function readViaNrmNativeModule(): Promise<string | null> {
  if (!hasNrmSpotifyCookieNativeModule()) return null;
  try {
    const value = await nrmNative!.getSpDcCookie();
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ReadSpDcOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

/** Android CookieManager — dev build/APK 전용 (Expo Go 앱 바이너리에는 모듈 없음) */
export async function readSpotifySpDcCookie(
  options?: ReadSpDcOptions,
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (!hasNrmSpotifyCookieNativeModule()) return null;

  const maxAttempts = options?.maxAttempts ?? 8;
  const delayMs = options?.delayMs ?? 600;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const value = await readViaNrmNativeModule();
    if (value) return value;
    if (attempt < maxAttempts - 1) await delay(delayMs);
  }
  return null;
}

/** Charts 세션 WebView 로그인 UI — Android */
export function isSpotifyChartsWebViewLoginVisible(): boolean {
  return Platform.OS === 'android';
}

export function canAutoReadSpotifySpDcCookie(): boolean {
  return hasNrmSpotifyCookieNativeModule();
}

/** @deprecated isSpotifyChartsWebViewLoginVisible 사용 */
export function isSpotifyChartsWebViewLoginSupported(): boolean {
  return isSpotifyChartsWebViewLoginVisible();
}
