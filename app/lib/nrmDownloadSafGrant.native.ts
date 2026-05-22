/**
 * Android SAF(Storage Access Framework) 다운로드 폴더 허가 관리.
 * - 최초 1회 폴더 선택 UI → 이후 무음 저장
 * - 허가 URI를 AsyncStorage에 보존
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';

const SAF_GRANT_KEY = 'nrm_saf_download_dir_v2';

/**
 * SAF directoryUri를 사용자에게 보이는 경로 문자열로 변환합니다.
 * content://...tree/primary:Music%2FFuck → /Music/Fuck
 * /storage/emulated/0 부분은 생략합니다.
 */
export function safUriToDisplayPath(uri: string): string | null {
  try {
    const decoded = decodeURIComponent(uri);
    // /tree/primary:FOLDER_PATH 패턴 추출
    const m = decoded.match(/\/tree\/primary:([^?#]+)/i);
    if (m?.[1]) {
      const raw = m[1].split('/document/')[0]; // /document/... 접미사 제거
      return '/' + raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type SafPathStatus = 'ok' | 'no_path' | 'path_invalid';

/**
 * SAF 경로 상태를 확인합니다.
 * - 'ok'           : 허가 URI가 존재하고 유효
 * - 'no_path'      : 허가 URI 자체가 한 번도 설정되지 않음
 * - 'path_invalid' : 허가 URI가 저장되어 있지만 폴더를 읽을 수 없음(삭제·이동 등)
 */
export async function checkSafDownloadPath(): Promise<SafPathStatus> {
  const raw = await AsyncStorage.getItem(SAF_GRANT_KEY).catch(() => null);
  if (!raw) return 'no_path';
  try {
    await StorageAccessFramework.readDirectoryAsync(raw);
    return 'ok';
  } catch {
    await AsyncStorage.removeItem(SAF_GRANT_KEY).catch(() => {});
    return 'path_invalid';
  }
}

/** AsyncStorage에 저장된 SAF 허가 URI를 반환합니다. 유효하지 않으면 null. */
export async function loadStoredSafGrant(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(SAF_GRANT_KEY).catch(() => null);
  if (!stored) return null;
  try {
    await StorageAccessFramework.readDirectoryAsync(stored);
    return stored;
  } catch {
    await AsyncStorage.removeItem(SAF_GRANT_KEY).catch(() => {});
    return null;
  }
}

/**
 * 저장된 허가가 있으면 반환, 없으면 폴더 선택 UI를 띄워 새로 받습니다.
 * 사용자가 취소하면 null 반환.
 */
export async function acquireSafDirUri(folderHint = 'NullReferenceMusic'): Promise<string | null> {
  const existing = await loadStoredSafGrant();
  if (existing) return existing;
  return requestNewSafDirUri(folderHint);
}

/**
 * 기존 허가에 상관없이 새로 폴더 선택 UI를 띄웁니다.
 * 설정 화면에서 경로를 변경할 때 사용합니다.
 * 사용자가 취소하면 null 반환.
 */
export async function requestNewSafDirUri(folderHint = 'NullReferenceMusic'): Promise<string | null> {
  const hint = StorageAccessFramework.getUriForDirectoryInRoot(folderHint);
  let result: Awaited<ReturnType<typeof StorageAccessFramework.requestDirectoryPermissionsAsync>>;
  try {
    result = await StorageAccessFramework.requestDirectoryPermissionsAsync(hint);
  } catch {
    return null;
  }
  if (!result.granted) return null;

  const { directoryUri } = result;
  await AsyncStorage.setItem(SAF_GRANT_KEY, directoryUri).catch(() => {});
  return directoryUri;
}

/** 저장된 SAF 허가를 초기화합니다. */
export async function clearSafDownloadGrant(): Promise<void> {
  await AsyncStorage.removeItem(SAF_GRANT_KEY).catch(() => {});
}
