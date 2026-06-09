import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import { clearAllSpotifyChartsSessionData, hasSpotifyChartsSessionAccess } from '@/lib/nrmSpotifyChartsSession';
import { readSpotifySpDcCookie, hasNrmSpotifyCookieNativeModule } from '@/lib/nrmSpotifySpDcCookie';

type NrmSpotifyCookieModule = {
  clearSpotifyLoginCookies?: () => Promise<boolean>;
};

async function clearSpotifyWebCookies(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmSpotifyCookie as NrmSpotifyCookieModule | undefined;
  if (!mod?.clearSpotifyLoginCookies) return;
  try {
    await mod.clearSpotifyLoginCookies();
  } catch {
    /* optional */
  }
}

/** Charts WebView 로그인(쿠키) 또는 저장된 Bearer 세션이 있는지 */
export async function hasSpotifyChartsWebLogin(): Promise<boolean> {
  if (await hasSpotifyChartsSessionAccess()) return true;
  if (Platform.OS === 'android' && hasNrmSpotifyCookieNativeModule()) {
    const spDc = await readSpotifySpDcCookie({ maxAttempts: 1, delayMs: 0 });
    if (spDc) return true;
  }
  return false;
}

/** WebView 로그인·Bearer 세션 제거 — 다음 로그인 시 로그인 페이지부터 */
export async function logoutSpotifyChartsWebLogin(): Promise<void> {
  await clearAllSpotifyChartsSessionData();
  await clearSpotifyWebCookies();
  if (Platform.OS === 'android' && hasNrmSpotifyCookieNativeModule()) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const remaining = await readSpotifySpDcCookie({ maxAttempts: 1, delayMs: 0 });
    if (remaining) {
      await clearSpotifyWebCookies();
    }
  }
}
