/**
 * iOS/Android 오디오 파일 저장.
 *
 * Android: MediaLibrary 사용 안 함. SAF(Storage Access Framework)로 저장.
 *   1. 최초 1회 SAF 폴더 선택 → 이후 무음 저장
 *   2. SAF 불가(Android 9↓) → /storage/emulated/0/NullReferenceMusic/ 직접 쓰기
 *   3. fallback → 앱 Documents 폴더 (Expo Go 개발 환경)
 *
 * iOS: 앱 Documents > NullReferenceMusic/ 폴더.
 *
 * ⚠ SAF로 생성된 content:// URI에는 copyAsync가 0바이트 문제를 일으킬 수 있어
 *   readAsStringAsync(base64) + writeAsStringAsync(base64) 로 씁니다.
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';
import { Alert, Platform } from 'react-native';

import { sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import {
  loadStoredSafGrant,
  requestNewSafDirUri,
} from '@/lib/nrmDownloadSafGrant';

const NRM_FOLDER = 'NullReferenceMusic';

export const NRM_DOWNLOAD_PUBLIC_FOLDER_NAME = NRM_FOLDER;
/** @deprecated NRM_DOWNLOAD_PUBLIC_FOLDER_NAME 사용 */
export const NRM_DOWNLOAD_DIR_NAME = NRM_FOLDER;

function normalizedApiBase(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

function safeStem(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const s = sanitizeFileBase(stem)
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return s || `t${Date.now()}`;
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.mp4': 'audio/mp4',
    '.webm': 'audio/webm',
    '.opus': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
  };
  return map[ext.toLowerCase()] ?? 'audio/mp4';
}

// ── Android SAF ───────────────────────────────────────────────────────────────

/**
 * SAF content:// URI에 파일을 씁니다.
 * copyAsync 는 SAF 목적지에서 0바이트 문제가 발생하므로
 * base64 read → write 방식을 사용합니다.
 */
async function writeToBinarySafUri(sourceUri: string, destUri: string): Promise<void> {
  const b64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: 'base64' });
  await FileSystem.writeAsStringAsync(destUri, b64, { encoding: 'base64' });
}

/**
 * SAF로 저장된 파일을 Android MediaStore에 등록합니다.
 * 등록 후 Samsung My Files 등 파일 탐색기에서 즉시 보입니다.
 * 실패해도 파일 자체는 정상 저장되어 있으므로 무시합니다.
 */
async function triggerMediaStoreScan(safDocUri: string): Promise<void> {
  try {
    const ML = require('expo-media-library') as typeof import('expo-media-library');

    // MediaLibrary 런타임 권한 확인 / 요청
    let { status } = await ML.getPermissionsAsync();
    if (status !== 'granted') {
      const res = await ML.requestPermissionsAsync();
      status = res.status;
    }
    if (status !== 'granted') return;

    // SAF content URI를 MediaStore에 등록만 (이동 없음)
    // createAlbumAsync(..., false) 는 파일을 MediaStore 관리 위치로 이동시켜
    // /storage/emulated/0/NullReferenceMusic/ 에서 파일이 사라지므로 사용하지 않음
    await ML.createAssetAsync(safDocUri);
  } catch {
    /* MediaStore 스캔 실패는 무시 — 파일은 정상 저장됨 */
  }
}

/**
 * 폴더 선택 전 가이드 다이얼로그.
 * SAF 피커가 열리기 전에 어떤 폴더를 선택해야 하는지 안내합니다.
 */
function showSafFolderGuide(): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(
      '다운로드 폴더 선택',
      '다음 화면에서 파일을 저장할 폴더를 선택하세요.\n폴더가 없다면 우상단 메뉴 → 새 폴더 만들기로 먼저 만들어 주세요.',
      [{ text: '계속', onPress: () => resolve() }],
      { cancelable: false },
    );
  });
}

/**
 * SAF로 NullReferenceMusic 폴더(또는 사용자 선택 폴더)에 파일을 저장합니다.
 * Android 10+ (API 29+) 환경에서 사용합니다.
 */
async function saveViaSaf(
  sourceUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  // 유효한(NullReferenceMusic 폴더) grant가 있는지 먼저 확인
  let dirUri = await loadStoredSafGrant();

  if (!dirUri) {
    // 저장된 grant가 없거나 잘못된 폴더 → 가이드 안내 후 폴더 선택 UI 열기
    await showSafFolderGuide();
    dirUri = await requestNewSafDirUri(NRM_FOLDER);
  }

  if (!dirUri) {
    throw new Error('다운로드 폴더 접근이 취소되었습니다. 메뉴 → 다운로드 설정에서 경로를 먼저 지정하세요.');
  }

  const ext = safeName.slice(safeName.lastIndexOf('.')).toLowerCase() || '.m4a';
  const fileName = `${safeStem(safeName)}${ext}`;
  const mimeType = mimeFromExt(ext);

  const destUri = await StorageAccessFramework.createFileAsync(dirUri, fileName, mimeType);
  await writeToBinarySafUri(sourceUri, destUri);

  // MediaStore 등록 → Samsung My Files 내장 저장공간 트리에 즉시 노출
  await triggerMediaStoreScan(destUri);

  return {
    savedLabel: `저장했습니다.`,
  };
}

/**
 * Android 9 이하 (/storage/emulated/0/NullReferenceMusic/ 직접 쓰기).
 * WRITE_EXTERNAL_STORAGE 가 Manifest에 선언되어 있으면 런타임 요청 없이 동작.
 */
async function saveToExternalDirect(
  sourceUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  const dirUri = `file:///storage/emulated/0/${NRM_FOLDER}`;
  await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });

  const ext = safeName.slice(safeName.lastIndexOf('.')).toLowerCase() || '.m4a';
  const fileName = `${safeStem(safeName)}${ext}`;
  const destUri = `${dirUri}/${fileName}`;
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  return { savedLabel: `저장했습니다. 내 파일 > ${NRM_FOLDER} 폴더에서 확인하세요.` };
}

/** fallback: 앱 전용 Documents 폴더 저장 (Expo Go 등) */
async function saveToAppDocumentsFallback(
  sourceUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  const docRoot = FileSystem.documentDirectory;
  if (!docRoot) throw new Error('이 기기에서 저장 공간을 사용할 수 없습니다.');

  const folderUri = `${docRoot}${NRM_FOLDER}/`;
  await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });

  const ext = safeName.slice(safeName.lastIndexOf('.')).toLowerCase() || '.m4a';
  const fileName = `${safeStem(safeName)}${ext}`;
  const destUri = `${folderUri}${fileName}`;
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  return {
    savedLabel: `저장했습니다. (앱 내부 폴더 — Expo Go 개발 환경)\n앱 폴더 > ${NRM_FOLDER}에서 확인하세요.`,
  };
}

async function androidSaveToNrmFolder(
  tempUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  // Android 9(API 28) 이하: 직접 쓰기 시도
  if ((Platform.Version as number) < 29) {
    try {
      return await saveToExternalDirect(tempUri, safeName);
    } catch {
      /* fall through to SAF */
    }
  }

  // Android 10+(API 29+): SAF
  try {
    return await saveViaSaf(tempUri, safeName);
  } catch (safErr) {
    const msg = safErr instanceof Error ? safErr.message : String(safErr);
    if (msg.includes('취소')) throw safErr;
    return await saveToAppDocumentsFallback(tempUri, safeName);
  }
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/** 기기에서 생성한 임시 오디오 파일을 저장 위치로 이동합니다. */
export async function persistLocalAudioFile(
  tempUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  try {
    if (Platform.OS === 'ios') {
      const docRoot = FileSystem.documentDirectory;
      if (!docRoot) throw new Error('이 기기에서 문서 저장 공간을 사용할 수 없습니다.');

      const folderUri = `${docRoot}${NRM_FOLDER}/`;
      await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
      const destUri = `${folderUri}${safeName}`;
      await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
      await FileSystem.copyAsync({ from: tempUri, to: destUri });

      return {
        savedLabel: `저장했습니다. iOS «파일» 앱 → 내 iPhone → 이 앱 → «${NRM_FOLDER}» 폴더에서 확인하세요.`,
      };
    }

    return await androidSaveToNrmFolder(tempUri, safeName);
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
}

export async function persistAudioAfterServerJob(
  apiBase: string,
  jobId: string,
  options: { fileName: string },
): Promise<{ savedLabel: string }> {
  const base = normalizedApiBase(apiBase);
  const url = `${base}/api/download/file?jobId=${encodeURIComponent(jobId)}`;
  const safeName = options.fileName;

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');

  const tempBase = cacheRoot.endsWith('/') || cacheRoot.endsWith('\\')
    ? `${cacheRoot}nrm-dl-${jobId}-`
    : `${cacheRoot}/nrm-dl-${jobId}-`;
  const tempUri = `${tempBase}${safeName}`;

  const dl = await FileSystem.downloadAsync(url, tempUri);
  if (dl.status < 200 || dl.status >= 300) {
    throw new Error(`파일을 받지 못했습니다 (HTTP ${dl.status})`);
  }

  return persistLocalAudioFile(tempUri, safeName);
}
