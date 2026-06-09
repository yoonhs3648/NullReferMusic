import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import {
  clearAllLastfmAppData,
  hasLastfmChartAccess,
} from '@/lib/nrmLastfmApiSettings';

type NrmSiteCookieModule = {
  hasLastfmLoginCookies?: () => Promise<boolean>;
  clearLastfmLoginCookies?: () => Promise<boolean>;
};

async function hasLastfmWebCookies(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const mod = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;
  if (!mod?.hasLastfmLoginCookies) return false;
  try {
    return (await mod.hasLastfmLoginCookies()) === true;
  } catch {
    return false;
  }
}

async function clearLastfmWebCookies(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;
  if (!mod?.clearLastfmLoginCookies) return;
  try {
    await mod.clearLastfmLoginCookies();
  } catch {
    /* optional */
  }
}

/** Last.fm Web 로그인(쿠키) 또는 앱에 저장된 API 자격 증명이 있는지 */
export async function hasLastfmWebLogin(): Promise<boolean> {
  if (await hasLastfmChartAccess()) return true;
  return hasLastfmWebCookies();
}

/** Web 로그인·저장된 API Key/Secret 제거 — 다음 브라우저 로그인 시 로그인 페이지부터 */
export async function logoutLastfmWebLogin(): Promise<void> {
  await clearAllLastfmAppData();
  await clearLastfmWebCookies();
  if (Platform.OS === 'android') {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (await hasLastfmWebCookies()) {
      await clearLastfmWebCookies();
    }
  }
}
