import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

export const STORAGE_KEY = 'nrm_file_logging_enabled';

/** APK 파일 로깅 사용자 설정 UI */
export type NrmFileLoggingMode = 'off' | 'on';

export const NRM_FILE_LOG_FOLDER_DISPLAY_PATH = 'Download/NullReferenceMusic/logs/';

export const NRM_FILE_LOG_DISPLAY_PATH = `${NRM_FILE_LOG_FOLDER_DISPLAY_PATH}nrm-debug-YYYY-MM-DD.log`;

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

/** 로그 폴더 내 모든 nrm-debug*.log 삭제 (Android 네이티브) */
export async function deleteAllNrmLogFiles(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  const mod = NativeModules.NrmFileLogger as
    | { deleteAllLogFiles?: () => Promise<number> }
    | undefined;
  if (!mod?.deleteAllLogFiles) return 0;
  return mod.deleteAllLogFiles();
}
