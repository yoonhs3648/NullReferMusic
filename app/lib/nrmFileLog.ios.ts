import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

import { NRM_BRAND_STORAGE_FOLDER_NAME } from '@/lib/nrmAppBrand';
import { NRM_FILE_LOGGING_BUILD_ALLOWED } from '@/lib/nrmFileLoggingPolicy';
import { isNrmFileLoggingActive } from '@/lib/nrmFileLoggingRuntime';

const ENABLED_KEY = 'nrm_ios_file_logging_enabled';

function logFolderUri(): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}${NRM_BRAND_STORAGE_FOLDER_NAME}/logs/`;
}

function dailyFileUri(): string | null {
  const folder = logFolderUri();
  if (!folder) return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${folder}${y}-${m}-${d}-NullReferenceMusicLog.txt`;
}

export function appendNrmFileLog(
  tag: string,
  level: 'info' | 'warn' | 'error',
  message: string,
): void {
  if (!NRM_FILE_LOGGING_BUILD_ALLOWED) return;
  if (!isNrmFileLoggingActive()) return;
  const file = dailyFileUri();
  const folder = logFolderUri();
  if (!file || !folder) return;
  const line = `${new Date().toISOString()} [${level}] [${tag}] ${message}\n`;
  void (async () => {
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
    const info = await FileSystem.getInfoAsync(file);
    const prev = info.exists ? await FileSystem.readAsStringAsync(file).catch(() => '') : '';
    await FileSystem.writeAsStringAsync(file, `${prev}${line}`);
  })().catch(() => undefined);
}

export async function getNrmLogFilePath(): Promise<string | null> {
  return dailyFileUri();
}

export async function getNativeFileLoggingEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function syncNativeFileLoggingEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function deleteIosLogFiles(): Promise<number> {
  const folder = logFolderUri();
  if (!folder) return 0;
  const names = await FileSystem.readDirectoryAsync(folder).catch(() => []);
  let count = 0;
  for (const name of names) {
    if (!name.endsWith('.txt') && !name.endsWith('.log')) continue;
    await FileSystem.deleteAsync(`${folder}${name}`, { idempotent: true }).catch(() => undefined);
    count += 1;
  }
  return count;
}
