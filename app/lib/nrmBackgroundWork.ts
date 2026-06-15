export function nrmDownloadBackgroundWorkToken(videoId: string): string {
  return `dl:${videoId}`;
}

export function nrmBackgroundWorkAcquire(_token: string): void {}

export function nrmBackgroundWorkRelease(_token: string): void {}

export async function nrmHasActiveDownloadOrLyricsWork(): Promise<boolean> {
  return false;
}
