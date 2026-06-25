import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  loadNrmFileLoggingEnabled,
  reconcileNrmFileLoggingInstallScope,
  saveNrmFileLoggingEnabled,
  STORAGE_KEY as FILE_LOGGING_STORAGE_KEY,
} from '@/lib/nrmFileLoggingSettings';

let cachedEnabled: boolean | null = null;
let initPromise: Promise<void> | null = null;

async function syncNativeLoggingEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { syncNativeFileLoggingEnabled } = await import('@/lib/nrmFileLog');
  await syncNativeFileLoggingEnabled(enabled);
}

/** 앱 시작 시 1회 — AsyncStorage → 메모리·네이티브 동기화 */
export function initNrmFileLoggingRuntime(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await reconcileNrmFileLoggingInstallScope();
      const enabled = await loadNrmFileLoggingEnabled();
      cachedEnabled = enabled;
      await syncNativeLoggingEnabled(enabled);
    })();
  }
  return initPromise;
}

export function isNrmFileLoggingActive(): boolean {
  return cachedEnabled === true;
}

export async function setNrmFileLoggingActive(enabled: boolean): Promise<void> {
  cachedEnabled = enabled;
  await saveNrmFileLoggingEnabled(enabled);
  await syncNativeLoggingEnabled(enabled);
}

/** 토글 저장 직후 네이티브·JS 캐시 일치 */
export async function refreshNrmFileLoggingFromStorage(): Promise<boolean> {
  const enabled = await loadNrmFileLoggingEnabled();
  cachedEnabled = enabled;
  await syncNativeLoggingEnabled(enabled);
  return enabled;
}

export { FILE_LOGGING_STORAGE_KEY };
