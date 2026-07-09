export const NRM_YOUTUBE_HTTP_CONNECT_TIMEOUT_MS = 15_000;

export async function youtubeHttpFetchNative(): Promise<Response> {
  throw new Error('NATIVE_YT_HTTP_UNAVAILABLE');
}

export function isNativeYoutubeHttpFetchAvailable(): boolean {
  return false;
}

export function isYoutubeHttpTimeoutError(_e: unknown): boolean {
  return false;
}
