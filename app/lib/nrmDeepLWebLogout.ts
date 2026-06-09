import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import {
  clearDeepLUsageSnapshot,
  getDeepLApiKey,
  saveDeepLApiKey,
} from '@/lib/nrmDeepLApiSettings';

type NrmSiteCookieModule = {
  hasDeepLLoginCookies?: () => Promise<boolean>;
  clearDeepLLoginCookies?: () => Promise<boolean>;
};

async function hasDeepLWebCookies(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const mod = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;
  if (!mod?.hasDeepLLoginCookies) return false;
  try {
    return (await mod.hasDeepLLoginCookies()) === true;
  } catch {
    return false;
  }
}

async function clearDeepLWebCookies(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;
  if (!mod?.clearDeepLLoginCookies) return;
  try {
    await mod.clearDeepLLoginCookies();
  } catch {
    /* optional */
  }
}

/** DeepL Web 로그인(쿠키) 또는 앱에 저장된 API Key가 있는지 */
export async function hasDeepLWebLogin(): Promise<boolean> {
  const key = (await getDeepLApiKey()).trim();
  if (key.length > 0) return true;
  return hasDeepLWebCookies();
}

/** Web 로그인·저장된 API Key 제거 — 다음 브라우저 로그인 시 로그인 페이지부터 */
export async function logoutDeepLWebLogin(): Promise<void> {
  await saveDeepLApiKey('');
  await clearDeepLUsageSnapshot();
  await clearDeepLWebCookies();
  if (Platform.OS === 'android') {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (await hasDeepLWebCookies()) {
      await clearDeepLWebCookies();
    }
  }
}
