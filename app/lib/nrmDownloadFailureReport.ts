import { Platform } from 'react-native';

import { appendActivityHistory } from '@/lib/nrmActivityHistory';
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { logDownloadTrackHistory } from '@/lib/nrmTrackHistoryRemote';
import {
  nrmNotifyDownloadFailed,
  nrmNotifyDownloadFinished,
  nrmNotifyDownloadWorkEnded,
} from '@/lib/nrmMobileDownloadNotifications';
import { nrmBackgroundWorkRelease, nrmDownloadBackgroundWorkToken } from '@/lib/nrmBackgroundWork';

/** 추출 최종 실패 — 시스템 알림 + History */
export async function reportNativeDownloadExtractFailure(
  videoId: string,
  displayLabel: string,
  cause: unknown,
): Promise<void> {
  const label = displayLabel.trim() || '알 수 없는 트랙';
  logNrmRunError('download.extract_failed', cause, { videoId, displayLabel: label });

  if (Platform.OS !== 'web') {
    await nrmNotifyDownloadFailed(label, videoId);
    nrmNotifyDownloadFinished(videoId, label, false, 'audio');
    nrmNotifyDownloadWorkEnded(videoId);
    nrmBackgroundWorkRelease(nrmDownloadBackgroundWorkToken(videoId));
  }

  await appendActivityHistory({
    fileName: displayLabelFromAudioFileName(label),
    kind: 'download_fail',
  });

  const causeMessage = cause instanceof Error ? cause.message : String(cause ?? '');
  void logDownloadTrackHistory({
    metadata: undefined,
    fileName: displayLabelFromAudioFileName(label),
    audioUri: '',
    isSuccess: false,
    failReason: causeMessage.slice(0, 200) || 'extract_failed',
  });
}
