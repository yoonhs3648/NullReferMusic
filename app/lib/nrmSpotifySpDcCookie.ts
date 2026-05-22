export {
  isSpotifyChartsWebViewLoginVisible,
  NRM_CHARTS_SPOTIFY_URL,
} from '@/lib/nrmSpotifyChartsPlatform';

/** @deprecated Bearer WebView 방식으로 대체됨 */
export function hasNrmSpotifyCookieNativeModule(): boolean {
  return false;
}

/** @deprecated */
export async function readSpotifySpDcCookie(): Promise<string | null> {
  return null;
}
