import { NativeModules, Platform } from 'react-native';

type NrmBackgroundWorkNative = {
  acquire?: (token: string) => void;
  release?: (token: string) => void;
  hasActiveDownloadOrLyricsWork?: () => Promise<boolean>;
};

const mod = NativeModules.NrmBackgroundWork as NrmBackgroundWorkNative | undefined;

export function nrmDownloadBackgroundWorkToken(videoId: string): string {
  return `dl:${videoId}`;
}

/** JS 가사 파이프라인(align 시작 전 대기·persist 포함) — native forced-align 토큰과 별도 */
export function nrmLyricsBackgroundWorkToken(jobId: string): string {
  return `lyrics:${jobId.trim()}`;
}

/** 다운로드·Whisper 세션 시작 — Android Foreground Service + WakeLock 유지 */
export function nrmBackgroundWorkAcquire(token: string): void {
  if (Platform.OS !== 'android') return;
  const t = token.trim();
  if (!t) return;
  try {
    mod?.acquire?.(t);
  } catch {
    /* native unavailable */
  }
}

/** 세션 종료 — 참조 0이면 Foreground Service 중지 */
export function nrmBackgroundWorkRelease(token: string): void {
  if (Platform.OS !== 'android') return;
  const t = token.trim();
  if (!t) return;
  try {
    mod?.release?.(t);
  } catch {
    /* native unavailable */
  }
}

/** Android — 오디오 다운로드 또는 가사 생성 작업이 진행 중인지 */
export async function nrmHasActiveDownloadOrLyricsWork(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return !!(await mod?.hasActiveDownloadOrLyricsWork?.());
  } catch {
    return false;
  }
}
