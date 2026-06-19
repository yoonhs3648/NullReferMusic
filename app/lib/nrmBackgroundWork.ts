export function nrmDownloadBackgroundWorkToken(videoId: string): string {
  return `dl:${videoId}`;
}

export function nrmLyricsBackgroundWorkToken(jobId: string): string {
  return `lyrics:${jobId.trim()}`;
}

export function nrmBackgroundWorkAcquire(_token: string): void {}

export function nrmBackgroundWorkRelease(_token: string): void {}

export async function nrmHasActiveDownloadOrLyricsWork(): Promise<boolean> {
  return false;
}
