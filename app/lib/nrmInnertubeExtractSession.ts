/**
 * 오디오 다운로드 큐 — innertube 우선 유지.
 * (구) 세션 단위 yt-dlp 우선 전환은 제거 — 곡마다 innertube → yt-dlp 폴백.
 */
import { logNrmDev } from '@/lib/nrmDevLog';

/** @deprecated 항상 false — 곡마다 innertube 우선 */
export function shouldPreferYtdlpFirstForAudioQueue(): boolean {
  return false;
}

/** innertube 전 클라이언트 소진 — 로그만 (yt-dlp 폴백은 호출부에서 수행) */
export function notifyInnertubeExtractFailed(
  videoId?: string,
  reason?: string,
): void {
  logNrmDev('download.extract_session', {
    event: 'innertube_exhausted',
    videoId: videoId ?? null,
    reason: reason ?? 'innertube_fail',
  });
}

export function notifyInnertubeExtractSucceeded(videoId?: string): void {
  logNrmDev('download.extract_session', {
    event: 'innertube_ok',
    videoId: videoId ?? null,
  });
}

/** 큐 idle — 호환용 no-op */
export function resetInnertubeExtractSessionOnQueueIdle(): void {
  logNrmDev('download.extract_session', {
    event: 'queue_idle',
  });
}
