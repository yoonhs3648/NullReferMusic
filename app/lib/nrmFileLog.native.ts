import { NativeModules } from 'react-native';

import { NRM_FILE_LOGGING_ENABLED } from '@/lib/nrmFileLoggingPolicy';

type NrmFileLoggerNative = {
  log?: (tag: string, level: string, message: string) => void;
  getLogFilePath?: () => Promise<string>;
};

const mod = NativeModules.NrmFileLogger as NrmFileLoggerNative | undefined;

/** @deprecated NRM_FILE_LOGGING_ENABLED=false — no-op. 레거시 native 모듈 호출만 유지. */
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
