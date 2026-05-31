import { Platform } from 'react-native';

export const NRM_CHARTS_SPOTIFY_URL = 'https://charts.spotify.com/';

/** charts 403 등으로 로그인 페이지로 보낼 때 사용 */
export const NRM_SPOTIFY_CHARTS_LOGIN_URL = `https://accounts.spotify.com/login?continue=${encodeURIComponent(NRM_CHARTS_SPOTIFY_URL)}`;

/** Bearer 토큰 발급 엔드포인트 (open.spotify.com) */
export const NRM_SPOTIFY_TOKEN_ENDPOINT =
  'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';

/** Charts Bearer 수집 WebView — Android 앱 전용 */
export function isSpotifyChartsWebViewLoginVisible(): boolean {
  return Platform.OS === 'android';
}
