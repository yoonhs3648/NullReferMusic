import { NativeModules, Platform } from 'react-native';

type NrmBackgroundWorkNative = {
  acquire?: (token: string) => void;
  release?: (token: string) => void;
};

const mod = NativeModules.NrmBackgroundWork as NrmBackgroundWorkNative | undefined;

export function nrmDownloadBackgroundWorkToken(videoId: string): string {
  return `dl:${videoId}`;
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
