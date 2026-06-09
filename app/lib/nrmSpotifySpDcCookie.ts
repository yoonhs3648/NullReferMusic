export {
  isSpotifyChartsWebViewLoginVisible,
  NRM_CHARTS_SPOTIFY_URL,
} from '@/lib/nrmSpotifyChartsPlatform';

/** @deprecated Bearer WebView 방식으로 대체됨 */
export function hasNrmSpotifyCookieNativeModule(): boolean {
  return false;
}

type ReadSpDcOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

/** @deprecated */
export async function readSpotifySpDcCookie(
  _options?: ReadSpDcOptions,
): Promise<string | null> {
  return null;
}
