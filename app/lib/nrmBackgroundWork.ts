/** Web — no-op */
export function nrmBackgroundWorkAcquire(_token: string): void {}

export function nrmBackgroundWorkRelease(_token: string): void {}

export function nrmDownloadBackgroundWorkToken(videoId: string): string {
  return `dl:${videoId}`;
}
