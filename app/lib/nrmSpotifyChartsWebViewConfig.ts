import { Platform } from 'react-native';

/**
 * Spotify는 Android WebView 기본 UA(`; wv)`)를 차단해 charts·로그인에서 403이 날 수 있습니다.
 * Chrome Mobile UA로 맞춥니다.
 */
export const NRM_SPOTIFY_WEBVIEW_USER_AGENT =
  Platform.OS === 'android'
    ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
    : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function isSpotifyLoginUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'accounts.spotify.com' || host.endsWith('.accounts.spotify.com');
  } catch {
    return /accounts\.spotify\.com/i.test(url);
  }
}

export function isSpotifyChartsOrOpenUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'charts.spotify.com' ||
      host.endsWith('.charts.spotify.com') ||
      host === 'open.spotify.com' ||
      host.endsWith('.open.spotify.com')
    );
  } catch {
    return /charts\.spotify\.com|open\.spotify\.com/i.test(url);
  }
}

/** WebView HTTP 401/403 — 로그인 리디렉션 전 charts 초기 로드 실패 등 */
export function isSpotifyWebViewHttpAuthError(statusCode: number, url: string): boolean {
  if (statusCode !== 401 && statusCode !== 403) return false;
  if (isSpotifyLoginUrl(url)) return false;
  if (/get_access_token|\/api\/token/i.test(url)) return false;
  return isSpotifyChartsOrOpenUrl(url) || /spotify\.com/i.test(url);
}
