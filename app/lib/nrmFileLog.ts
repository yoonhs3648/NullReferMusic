/** 기본(no-op). Android는 nrmFileLog.native.ts, web은 nrmFileLog.web.ts가 런타임에 사용됩니다. */
export function appendNrmFileLog(
  _tag: string,
  _level: 'info' | 'warn' | 'error',
  _message: string,
): void {}

export async function getNrmLogFilePath(): Promise<string | null> {
  return null;
}
