export function hasNrmSpotifyCookieNativeModule(): boolean {
  return false;
}

export function isSpotifyChartsWebViewLoginVisible(): boolean {
  return false;
}

export function canAutoReadSpotifySpDcCookie(): boolean {
  return false;
}

export function isSpotifyChartsWebViewLoginSupported(): boolean {
  return false;
}

export async function readSpotifySpDcCookie(
  _options?: { maxAttempts?: number; delayMs?: number },
): Promise<string | null> {
  return null;
}