/** @deprecated 파일 로깅 비활성 — 레거시 설정 API (항상 off) */

export type NrmFileLoggingMode = 'off' | 'on';

export const NRM_FILE_LOG_DISPLAY_PATH =
  'Download/NullReferenceMusic/logs/nrm-debug.log';

export async function loadNrmFileLoggingEnabled(): Promise<boolean> {
  return false;
}

export async function saveNrmFileLoggingEnabled(_enabled: boolean): Promise<void> {
  /* no-op */
}

export async function loadNrmFileLoggingMode(): Promise<NrmFileLoggingMode> {
  return 'off';
}
