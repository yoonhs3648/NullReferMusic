import { Platform } from 'react-native';

import { STORAGE_KEY as FILE_LOGGING_STORAGE_KEY } from '@/lib/nrmFileLoggingSettings';

type FileLoggingListener = (enabled: boolean) => void;

let cachedEnabled = false;
let hydrated = false;
let initPromise: Promise<boolean> | null = null;
const listeners = new Set<FileLoggingListener>();

function notifyListeners(enabled: boolean): void {
  for (const fn of listeners) {
    try {
      fn(enabled);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 로깅 활성화 여부를 noBackupFilesDir 에서 읽는다.
 * noBackupFilesDir 은 Google Auto Backup 에서 제외되고 앱 삭제 시 함께 삭제된다.
 * → 재설치 시 항상 false (기본 off).
 */
async function readPersistedEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const { getNativeFileLoggingEnabled } = await import('@/lib/nrmFileLog');
    return getNativeFileLoggingEnabled();
  } catch {
    return false;
  }
}

/** noBackupFilesDir 에 저장 + 네이티브 in-memory 플래그 갱신 */
async function writePersistedEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { syncNativeFileLoggingEnabled } = await import('@/lib/nrmFileLog');
    await syncNativeFileLoggingEnabled(enabled);
  } catch {
    /* optional */
  }
}

async function hydrateFromStorage(): Promise<boolean> {
  // 구버전 AsyncStorage 로깅 키 정리 (더 이상 설정값에 사용하지 않음)
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.multiRemove([
      'nrm_file_logging_enabled',
      'nrm_file_logging_install_scope_ms',
    ]);
  } catch {
    /* ignore */
  }

  const enabled = await readPersistedEnabled();
  cachedEnabled = enabled;
  hydrated = true;
  // 네이티브 in-memory 플래그 동기화 (setLoggingEnabled 경유 → noBackupFilesDir 재기록 포함, 무해)
  await writePersistedEnabled(enabled);
  notifyListeners(enabled);
  return enabled;
}

/**
 * 앱 시작 시 1회 — noBackupFilesDir → 메모리·네이티브 동기화.
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
  await initNrmFileLoggingRuntime();
  return cachedEnabled;
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
  await writePersistedEnabled(enabled);
  notifyListeners(enabled);
}

/** 설정 화면 진입 시 저장값과 런타임·네이티브 재동기화 */
export async function refreshNrmFileLoggingFromStorage(): Promise<boolean> {
  const enabled = await readPersistedEnabled();
  cachedEnabled = enabled;
  hydrated = true;
  await writePersistedEnabled(enabled);
  notifyListeners(enabled);
  return enabled;
}

export { FILE_LOGGING_STORAGE_KEY };
