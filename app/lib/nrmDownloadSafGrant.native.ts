/**
 * Android SAF(Storage Access Framework) 다운로드 폴더 허가 관리.
 * - 최초 1회 폴더 선택 UI → 이후 무음 저장
 * - 허가 URI를 AsyncStorage에 보존
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';

import { NRM_BRAND_STORAGE_FOLDER_NAME } from '@/lib/nrmAppBrand';

const SAF_GRANT_KEY = 'nrm_saf_download_dir_v2';

/**
 * SAF directoryUri를 사용자에게 보이는 경로 문자열로 변환합니다.
 * - 내장: content://...tree/primary:Music%2FFoo → /Music/Foo
 * - SD카드: content://...tree/5726-ABCD%3AMusic%2FFoo → SD 카드 /Music/Foo
 */
export function safUriToDisplayPath(uri: string): string | null {
  try {
    const decoded = decodeURIComponent(uri);
    const m = decoded.match(/\/tree\/([^:/]+):([^?#]+)/i);
    if (!m?.[2]) return null;
    const volumeId = m[1].toLowerCase();
    const raw = m[2].split('/document/')[0].replace(/\/+$/, '');
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    if (volumeId === 'primary') {
      return path;
    }
    return `SD 카드 ${path}`;
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

export type SafGrantWithEntries = { dirUri: string; entries: string[] };

/**
 * 저장된 SAF 허가 URI와 해당 디렉터리의 엔트리 목록을 한 번의
 * `readDirectoryAsync` 호출로 함께 반환합니다.
 * (허가 유효성 검증과 목록 조회를 위해 같은 디렉터리를 두 번 스캔하지 않도록 통합)
 */
export async function loadStoredSafGrantWithEntries(): Promise<SafGrantWithEntries | null> {
  const stored = await AsyncStorage.getItem(SAF_GRANT_KEY).catch(() => null);
  if (!stored) return null;

  try {
    const entries = await StorageAccessFramework.readDirectoryAsync(stored);
    return { dirUri: stored, entries };
  } catch {
    await AsyncStorage.removeItem(SAF_GRANT_KEY).catch(() => {});
    return null;
  }
}

/**
 * 저장된 허가가 있으면 반환, 없으면 폴더 선택 UI를 띄워 새로 받습니다.
 * 사용자가 취소하면 null 반환.
 */
export async function acquireSafDirUri(
  folderHint = NRM_BRAND_STORAGE_FOLDER_NAME,
): Promise<string | null> {
  const existing = await loadStoredSafGrant();
  if (existing) return existing;
  return requestNewSafDirUri(folderHint);
}

/**
 * 기존 허가에 상관없이 새로 폴더 선택 UI를 띄웁니다.
 * 설정 화면에서 경로를 변경할 때 사용합니다.
 * 사용자가 취소하면 null 반환.
 */
export async function requestNewSafDirUri(
  folderHint = NRM_BRAND_STORAGE_FOLDER_NAME,
): Promise<string | null> {
  // getUriForDirectoryInRoot 은 tree/ URI를 반환해 삼성 피커가 "S20 FE" 기기 루트로 열림.
  // document/primary: 형식을 쓰면 "내장 저장공간" 루트로 바로 열린다.
  const hint = folderHint
    ? `content://com.android.externalstorage.documents/document/primary:${encodeURIComponent(folderHint)}`
    : `content://com.android.externalstorage.documents/document/primary:`;
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
