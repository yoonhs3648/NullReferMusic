import { NativeModules } from 'react-native';

type NrmFileLoggerNative = {
  log?: (tag: string, level: string, message: string) => void;
  getLogFilePath?: () => Promise<string>;
};

const mod = NativeModules.NrmFileLogger as NrmFileLoggerNative | undefined;

export function appendNrmFileLog(
  tag: string,
  level: 'info' | 'warn' | 'error',
  message: string,
): void {
  try {
    mod?.log?.(tag, level, message);
  } catch {
    /* native module unavailable */
  }
}

export async function getNrmLogFilePath(): Promise<string | null> {
  try {
    const path = await mod?.getLogFilePath?.();
    return path?.trim() || null;
  } catch {
    return null;
  }
}
