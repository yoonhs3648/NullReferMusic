import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import { getNrmFileLogFolderDisplayPath } from '@/lib/nrmAppBrand';

/** 파일 로깅 on/off — 앱 내 AsyncStorage 단일 저장 (기본 off) */
export const STORAGE_KEY = 'nrm_file_logging_enabled';

/** APK 파일 로깅 사용자 설정 UI */
export type NrmFileLoggingMode = 'off' | 'on';

export const NRM_FILE_LOG_FOLDER_DISPLAY_PATH = getNrmFileLogFolderDisplayPath();

function formatDailyLogFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}-NullReferenceMusicLog.txt`;
}

export const NRM_FILE_LOG_DISPLAY_PATH = `${NRM_FILE_LOG_FOLDER_DISPLAY_PATH}${formatDailyLogFileName()}`;

/** 저장값이 없거나 잘못된 경우 false (기본 off) */
export async function readFileLoggingEnabledFromStorage(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function writeFileLoggingEnabledToStorage(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

/** @deprecated readFileLoggingEnabledFromStorage 사용 */
export async function loadNrmFileLoggingEnabled(): Promise<boolean> {
  return readFileLoggingEnabledFromStorage();
}

/** @deprecated writeFileLoggingEnabledToStorage 사용 */
export async function saveNrmFileLoggingEnabled(enabled: boolean): Promise<void> {
  return writeFileLoggingEnabledToStorage(enabled);
}

export async function loadNrmFileLoggingMode(): Promise<NrmFileLoggingMode> {
  return (await readFileLoggingEnabledFromStorage()) ? 'on' : 'off';
}

/** 로그 폴더 내 일별·레거시 로그 파일 전부 삭제 (Android 네이티브) */
export async function deleteAllNrmLogFiles(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  const mod = NativeModules.NrmFileLogger as
    | { deleteAllLogFiles?: () => Promise<number> }
    | undefined;
  if (!mod?.deleteAllLogFiles) return 0;
  return mod.deleteAllLogFiles();
}
