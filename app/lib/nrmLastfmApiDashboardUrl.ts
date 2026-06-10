export const LASTFM_API_CREATE_URL = 'https://www.last.fm/api/account/create';
export const LASTFM_API_ACCOUNTS_URL = 'https://www.last.fm/api/accounts';

/**
 * Last.fm API 계정·키 확인 페이지 URL.
 *
 * `expo-web-browser`(Chrome Custom Tab)는 앱 WebView 쿠키(NrmSiteCookie)와
 * 세션을 공유하지 않아, 네이티브 쿠키 프로브로 등록·로그인 여부를 판별할 수 없다.
 * 브라우저에 Last.fm 로그인·API 앱 등록이 되어 있으면 ACCOUNTS에서 목록이 보이고,
 * 미등록·미로그인은 Last.fm이 로그인·생성 흐름으로 안내한다.
 */
export async function resolveLastfmApiDashboardUrl(): Promise<string> {
  return LASTFM_API_ACCOUNTS_URL;
}
