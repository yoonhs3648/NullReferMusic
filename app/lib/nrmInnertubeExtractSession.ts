/**
 * 오디오 다운로드 큐 세션: innertube 1회 실패 시 남은 큐 항목은 yt-dlp 우선.
 * 큐가 완전히 비면 innertube 우선으로 복원 (nrmDownloadWorkQueue idle 훅).
 */
import { logNrmDev } from '@/lib/nrmDevLog';

let preferYtdlpForActiveAudioQueue = false;

export function shouldPreferYtdlpFirstForAudioQueue(): boolean {
  return preferYtdlpForActiveAudioQueue;
}

/** innertube 추출 실패·타임아웃 시 호출 — 동일 큐 세션의 후속 오디오는 yt-dlp 우선 */
export function notifyInnertubeExtractFailed(videoId?: string, reason?: string): void {
  if (preferYtdlpForActiveAudioQueue) return;
  preferYtdlpForActiveAudioQueue = true;
  logNrmDev('download.extract_session', {
    event: 'prefer_ytdlp_on',
    videoId: videoId ?? null,
    reason: reason ?? 'innertube_fail',
  });
}

/** audio·lyrics 큐 모두 idle — innertube 우선 복원 */
export function resetInnertubeExtractSessionOnQueueIdle(): void {
  if (!preferYtdlpForActiveAudioQueue) return;
  preferYtdlpForActiveAudioQueue = false;
  logNrmDev('download.extract_session', {
    event: 'prefer_ytdlp_off',
    reason: 'queue_idle',
  });
}
