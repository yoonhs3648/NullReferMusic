import { NativeModules } from 'react-native';

import { NRM_FILE_LOGGING_BUILD_ALLOWED } from '@/lib/nrmFileLoggingPolicy';
import { isNrmFileLoggingActive } from '@/lib/nrmFileLoggingRuntime';

type NrmFileLoggerNative = {
  log?: (tag: string, level: string, message: string) => void;
  getLogFilePath?: () => Promise<string>;
  setLoggingEnabled?: (enabled: boolean) => void;
  /** noBackupFilesDir 에서 로깅 활성화 여부 읽기 — 앱 삭제 시 초기화됨 */
  getLoggingEnabled?: () => Promise<boolean>;
  deleteAllLogFiles?: () => Promise<number>;
};

const mod = NativeModules.NrmFileLogger as NrmFileLoggerNative | undefined;

/** Android 네이티브 NrmFileLogger 모듈로 파일 로그 기록 */
export function appendNrmFileLog(
  tag: string,
  level: 'info' | 'warn' | 'error',
  message: string,
): void {
  if (!NRM_FILE_LOGGING_BUILD_ALLOWED) return;
  if (!isNrmFileLoggingActive()) return;
  try {
    mod?.log?.(tag, level, message);
  } catch {
    /* native module unavailable */
  }
}

export async function getNrmLogFilePath(): Promise<string | null> {
  if (!NRM_FILE_LOGGING_BUILD_ALLOWED) return null;
  try {
    const path = await mod?.getLogFilePath?.();
    return path?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * noBackupFilesDir 에서 저장된 로깅 활성화 여부를 읽는다.
 * 파일이 없으면 false (신규 설치/재설치 기본값 off).
 */
export async function getNativeFileLoggingEnabled(): Promise<boolean> {
  try {
    const result = await mod?.getLoggingEnabled?.();
    return result === true;
  } catch {
    return false;
  }
}

export async function syncNativeFileLoggingEnabled(enabled: boolean): Promise<void> {
  try {
    mod?.setLoggingEnabled?.(enabled);
  } catch {
    /* optional */
  }
}
