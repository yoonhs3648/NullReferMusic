import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  readFileLoggingEnabledFromStorage,
  STORAGE_KEY as FILE_LOGGING_STORAGE_KEY,
  writeFileLoggingEnabledToStorage,
} from '@/lib/nrmFileLoggingSettings';

type FileLoggingListener = (enabled: boolean) => void;

let cachedEnabled = false;
let hydrated = false;
let initPromise: Promise<boolean> | null = null;
const listeners = new Set<FileLoggingListener>();

async function syncNativeLoggingEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { syncNativeFileLoggingEnabled } = await import('@/lib/nrmFileLog');
  await syncNativeFileLoggingEnabled(enabled);
}

function notifyListeners(enabled: boolean): void {
  for (const fn of listeners) {
    try {
      fn(enabled);
    } catch {
      /* ignore */
    }
  }
}

async function hydrateFromStorage(): Promise<boolean> {
  try {
    await AsyncStorage.removeItem('nrm_file_logging_install_scope_ms');
  } catch {
    /* ignore */
  }
  const enabled = await readFileLoggingEnabledFromStorage();
  cachedEnabled = enabled;
  hydrated = true;
  await syncNativeLoggingEnabled(enabled);
  notifyListeners(enabled);
  return enabled;
}

/**
 * 앱 시작 시 1회 — AsyncStorage → 메모리·네이티브 동기화.
 * 완료 전 isNrmFileLoggingActive() 는 항상 false.
 */
export function initNrmFileLoggingRuntime(): Promise<boolean> {
  if (!initPromise) {
    initPromise = hydrateFromStorage();
  }
  return initPromise;
}

export function isNrmFileLoggingActive(): boolean {
  return hydrated && cachedEnabled;
}

/** 저장값 로드 완료 후 현재 on/off (UI·설정 화면용) */
export async function getNrmFileLoggingEnabled(): Promise<boolean> {
  return initNrmFileLoggingRuntime();
}

export function subscribeNrmFileLoggingActive(
  listener: FileLoggingListener,
): () => void {
  listeners.add(listener);
  if (hydrated) {
    listener(cachedEnabled);
  }
  return () => {
    listeners.delete(listener);
  };
}

export async function setNrmFileLoggingActive(enabled: boolean): Promise<void> {
  await initNrmFileLoggingRuntime();
  cachedEnabled = enabled;
  hydrated = true;
  await writeFileLoggingEnabledToStorage(enabled);
  await syncNativeLoggingEnabled(enabled);
  notifyListeners(enabled);
}

/** 설정 화면 진입 시 저장값과 런타임·네이티브 재동기화 */
export async function refreshNrmFileLoggingFromStorage(): Promise<boolean> {
  const enabled = await readFileLoggingEnabledFromStorage();
  cachedEnabled = enabled;
  hydrated = true;
  await syncNativeLoggingEnabled(enabled);
  notifyListeners(enabled);
  return enabled;
}

export { FILE_LOGGING_STORAGE_KEY };
