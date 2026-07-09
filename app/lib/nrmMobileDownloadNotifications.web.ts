/** 웹·네이티브 공통: 시스템 알림 없음(인앱 안내만). */
export async function setupNrmMobileDownloadNotifications(): Promise<void> {}

export function nrmNotifyDownloadStarted(
  _videoId: string,
  _displayLabel: string,
  _kind: 'audio' | 'lyrics' = 'audio',
): void {}

export function nrmNotifyDownloadFinished(
  _videoId: string,
  _displayLabel: string,
  _success: boolean,
  _kind: 'audio' | 'lyrics' = 'audio',
): void {}

export function nrmNotifyDownloadQueued(_videoId: string, _displayLabel: string): void {}

export async function nrmNotifyLyricsFailed(
  _displayLabel: string,
  _videoId?: string,
  _reason?: string,
): Promise<void> {}

export function nrmNotifyDownloadWorkEnded(_videoId: string): void {}

export async function nrmNotifyDownloadFailed(
  displayLabel: string,
  _videoId?: string,
): Promise<void> {
  void displayLabel;
}

export async function nrmNotifyAttachmentDownloadStarted(_fileName: string): Promise<void> {}

export async function nrmNotifyAttachmentDownloadFinished(
  _fileName: string,
  _success: boolean,
): Promise<void> {}
