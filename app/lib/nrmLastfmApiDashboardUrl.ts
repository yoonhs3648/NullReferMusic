import { Platform, NativeModules } from 'react-native';

import { getLastfmCredentials } from '@/lib/nrmLastfmApiSettings';

export const LASTFM_API_CREATE_URL = 'https://www.last.fm/api/account/create';
export const LASTFM_API_ACCOUNTS_URL = 'https://www.last.fm/api/accounts';

type NrmSiteCookieModule = {
  hasLastfmLoginCookies?: () => Promise<boolean>;
};

async function hasLastfmBrowserSession(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const mod = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;
  if (!mod?.hasLastfmLoginCookies) return false;
  try {
    return (await mod.hasLastfmLoginCookies()) === true;
  } catch {
    return false;
  }
}

/**
 * API 계정을 이미 만든 사용자는 키·Secret 확인 페이지로,
 * 그 외에는 계정 생성 페이지로 연다.
 */
export async function resolveLastfmApiDashboardUrl(): Promise<string> {
  const creds = await getLastfmCredentials();
  if (creds?.clientId?.trim()) {
    return LASTFM_API_ACCOUNTS_URL;
  }
  if (await hasLastfmBrowserSession()) {
    return LASTFM_API_ACCOUNTS_URL;
  }
  return LASTFM_API_CREATE_URL;
}
