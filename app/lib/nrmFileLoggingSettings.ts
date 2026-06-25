import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import { getNrmFileLogFolderDisplayPath } from '@/lib/nrmAppBrand';

export const STORAGE_KEY = 'nrm_file_logging_enabled';

/** 앱 재설치 감지 — firstInstallTime 과 짝 */
const INSTALL_SCOPE_KEY = 'nrm_file_logging_install_scope_ms';

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

async function readAndroidFirstInstallTimeMs(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules.NrmFileLogger as
    | { getFirstInstallTimeMs?: () => Promise<number> }
    | undefined;
  try {
    const ms = await mod?.getFirstInstallTimeMs?.();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * 재설치(또는 백업 복원 후 새 설치) 시 파일 로깅을 기본 off 로 맞춘다.
 * 동일 설치에서의 업데이트·기존 사용자 설정은 유지한다.
 */
export async function reconcileNrmFileLoggingInstallScope(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const installMs = await readAndroidFirstInstallTimeMs();
  if (installMs == null) return;

  let scopeRaw: string | null;
  try {
    scopeRaw = await AsyncStorage.getItem(INSTALL_SCOPE_KEY);
  } catch {
    return;
  }

  if (scopeRaw === null) {
    try {
      await AsyncStorage.setItem(INSTALL_SCOPE_KEY, String(installMs));
    } catch {
      /* ignore */
    }
    return;
  }

  const scopeMs = Number(scopeRaw);
  if (scopeMs === installMs) return;

  try {
    await AsyncStorage.multiSet([
      [STORAGE_KEY, 'false'],
      [INSTALL_SCOPE_KEY, String(installMs)],
    ]);
  } catch {
    /* ignore */
  }
}

export async function loadNrmFileLoggingEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      await AsyncStorage.setItem(STORAGE_KEY, 'false');
      return false;
    }
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

/** 로그 폴더 내 일별·레거시 로그 파일 전부 삭제 (Android 네이티브) */
export async function deleteAllNrmLogFiles(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  const mod = NativeModules.NrmFileLogger as
    | { deleteAllLogFiles?: () => Promise<number> }
    | undefined;
  if (!mod?.deleteAllLogFiles) return 0;
  return mod.deleteAllLogFiles();
}
