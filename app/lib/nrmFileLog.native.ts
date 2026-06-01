import { NativeModules } from 'react-native';

import { NRM_FILE_LOGGING_ENABLED } from '@/lib/nrmFileLoggingPolicy';

type NrmFileLoggerNative = {
  log?: (tag: string, level: string, message: string) => void;
  getLogFilePath?: () => Promise<string>;
};

const mod = NativeModules.NrmFileLogger as NrmFileLoggerNative | undefined;

/** Android 네이티브 NrmFileLogger 모듈로 파일 로그 기록 */
export function appendNrmFileLog(
  tag: string,
  level: 'info' | 'warn' | 'error',
  message: string,
): void {
  if (!NRM_FILE_LOGGING_ENABLED) return;
  try {
    mod?.log?.(tag, level, message);
  } catch {
    /* native module unavailable */
  }
}

export async function getNrmLogFilePath(): Promise<string | null> {
  if (!NRM_FILE_LOGGING_ENABLED) return null;
  try {
    const path = await mod?.getLogFilePath?.();
    return path?.trim() || null;
  } catch {
    return null;
  }
}
