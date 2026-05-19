/**
 * 시스템(트레이) 알림은 사용하지 않습니다. 다운로드 진행·완료는 인앱 `notifyUser`만 사용합니다.
 * (Expo Go·호스트 앱과 알림 채널이 겹치거나, 실행 직후 빈 알림이 뜨는 문제를 피합니다.)
 */
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
