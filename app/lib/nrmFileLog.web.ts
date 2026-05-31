export function appendNrmFileLog(
  _tag: string,
  _level: 'info' | 'warn' | 'error',
  _message: string,
): void {
  /* web / iOS — no file log */
}

export async function getNrmLogFilePath(): Promise<string | null> {
  return null;
}
