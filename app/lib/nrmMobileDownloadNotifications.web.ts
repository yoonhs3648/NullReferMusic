/** 웹·네이티브 공통: 시스템 알림 없음(인앱 안내만). */
export async function setupNrmMobileDownloadNotifications(): Promise<void> {}

export function nrmNotifyDownloadStarted(
  _videoId: string,
  _displayLabel: string,
): void {}

export function nrmNotifyDownloadFinished(
  _videoId: string,
  _displayLabel: string,
  _success: boolean,
): void {}

export function nrmNotifyDownloadWorkEnded(_videoId: string): void {}
