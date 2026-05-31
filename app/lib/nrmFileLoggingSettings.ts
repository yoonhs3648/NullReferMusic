import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_file_logging_enabled';

/** APK 파일 로깅 사용자 설정. 기본값 false(미설정). 실제 로거 연동은 추후 APK에서 적용. */
export type NrmFileLoggingMode = 'off' | 'on';

export const NRM_FILE_LOG_DISPLAY_PATH =
  'Download/NullReferenceMusic/logs/nrm-debug.log';

export async function loadNrmFileLoggingEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function saveNrmFileLoggingEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function loadNrmFileLoggingMode(): Promise<NrmFileLoggingMode> {
  return (await loadNrmFileLoggingEnabled()) ? 'on' : 'off';
}
