/** 웹: 파일 로깅 없음 */
export function appendNrmFileLog(
  _tag: string,
  _level: 'info' | 'warn' | 'error',
  _message: string,
): void {}

export async function getNrmLogFilePath(): Promise<string | null> {
  return null;
}

export async function syncNativeFileLoggingEnabled(_enabled: boolean): Promise<void> {}
