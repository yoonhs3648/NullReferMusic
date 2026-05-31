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

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { hasEmbeddableAudioMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { copyLocalFileToSaf } from '@/lib/onDeviceDownload';
import { syncMediaStoreAudioTags } from '@/lib/nrmApplyAudioMetadata.native';
import { siblingLrcFsPath, siblingLrcUri } from '@/lib/nrmSiblingLrc';
import { sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import {
  loadStoredSafGrant,
  requestNewSafDirUri,
} from '@/lib/nrmDownloadSafGrant';

const NRM_FOLDER = 'NullReferenceMusic';

/** SAF createDocument(text/plain) 시 `.lrc` → `.lrc.txt` / `.lrc.text` 로 바뀌는 문제 방지 */
const LRC_SAF_MIME = 'application/octet-stream';

async function copyLrcSidecarToSaf(
  dirUri: string,
  fileName: string,
  sidecarLrcUri: string,
): Promise<void> {
  const lrcName = fileName.replace(/\.[^.]+$/, '.lrc');
  const lrcSrc = sidecarLrcUri.startsWith('file://') ? sidecarLrcUri : `file://${sidecarLrcUri}`;
  try {
    await copyLocalFileToSaf(lrcSrc, dirUri, lrcName, LRC_SAF_MIME);
  } catch {
    const lrcDest = await StorageAccessFramework.createFileAsync(dirUri, lrcName, LRC_SAF_MIME);
    await writeToBinarySafUri(sidecarLrcUri, lrcDest);
  }
}

export const NRM_DOWNLOAD_PUBLIC_FOLDER_NAME = NRM_FOLDER;
/** @deprecated NRM_DOWNLOAD_PUBLIC_FOLDER_NAME 사용 */
export const NRM_DOWNLOAD_DIR_NAME = NRM_FOLDER;

function normalizedApiBase(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

/** 저장 파일명 — 공백 유지, 금지 문자만 제거 */
function storageFileName(safeName: string): string {
  const dot = safeName.lastIndexOf('.');
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot).toLowerCase() : '.m4a';
  const base = sanitizeFileBase(stem) || `track-${Date.now()}`;
  return `${base}${ext}`;
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
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    const info = await FileSystem.getInfoAsync(destUri);
    if (info.exists && 'size' in info && (info.size ?? 0) > 0) {
      return;
    }
  } catch {
    /* copyAsync가 SAF에서 0바이트가 되는 기기 → base64 폴백 */
  }
  const b64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: 'base64' });
  await FileSystem.writeAsStringAsync(destUri, b64, { encoding: 'base64' });
}

/**
 * SAF로 저장된 파일을 Android MediaStore에 등록합니다.
 * 등록 후 Samsung My Files 등 파일 탐색기에서 즉시 보입니다.
 * 실패해도 파일 자체는 정상 저장되어 있으므로 무시합니다.
 */
async function triggerMediaStoreScan(
  safDocUri: string,
  metadata?: NrmAudioFileMetadata,
): Promise<void> {
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
    const asset = await ML.createAssetAsync(safDocUri);
    const mediaUri = asset?.uri?.trim();
    if (mediaUri && metadata && hasEmbeddableAudioMetadata(metadata)) {
      await syncMediaStoreAudioTags(mediaUri, metadata).catch(() => {});
    }
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
  sidecarLrcUri?: string,
  metadata?: NrmAudioFileMetadata,
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

  const fileName = storageFileName(safeName);
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase() || '.m4a';
  const mimeType = mimeFromExt(ext);

  let destUri: string;
  try {
    const srcPath = sourceUri.startsWith('file://') ? sourceUri : `file://${sourceUri}`;
    destUri = await copyLocalFileToSaf(srcPath, dirUri, fileName, mimeType);
  } catch {
    destUri = await StorageAccessFramework.createFileAsync(dirUri, fileName, mimeType);
    await writeToBinarySafUri(sourceUri, destUri);
  }

  // MediaStore 등록 → Samsung My Files·뮤직 앱 인덱스
  await triggerMediaStoreScan(destUri, metadata);

  if (sidecarLrcUri) {
    await copyLrcSidecarToSaf(dirUri, fileName, sidecarLrcUri);
  }

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
  sidecarLrcUri?: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  const dirUri = `file:///storage/emulated/0/${NRM_FOLDER}`;
  await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });

  const fileName = storageFileName(safeName);
  const destUri = `${dirUri}/${fileName}`;
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  if (sidecarLrcUri) {
    const lrcDest = `${dirUri}/${fileName.replace(/\.[^.]+$/, '.lrc')}`;
    await FileSystem.deleteAsync(lrcDest, { idempotent: true }).catch(() => {});
    await FileSystem.copyAsync({ from: sidecarLrcUri, to: lrcDest });
  }

  return { savedLabel: `저장했습니다. 내 파일 > ${NRM_FOLDER} 폴더에서 확인하세요.` };
}

/** fallback: 앱 전용 Documents 폴더 저장 (Expo Go 등) */
async function saveToAppDocumentsFallback(
  sourceUri: string,
  safeName: string,
  sidecarLrcUri?: string,
): Promise<{ savedLabel: string }> {
  const docRoot = FileSystem.documentDirectory;
  if (!docRoot) throw new Error('이 기기에서 저장 공간을 사용할 수 없습니다.');

  const folderUri = `${docRoot}${NRM_FOLDER}/`;
  await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });

  const fileName = storageFileName(safeName);
  const destUri = `${folderUri}${fileName}`;
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  if (sidecarLrcUri) {
    const lrcDest = `${folderUri}${fileName.replace(/\.[^.]+$/, '.lrc')}`;
    await FileSystem.deleteAsync(lrcDest, { idempotent: true }).catch(() => {});
    await FileSystem.copyAsync({ from: sidecarLrcUri, to: lrcDest });
  }

  return {
    savedLabel: `저장했습니다. (앱 내부 폴더 — Expo Go 개발 환경)\n앱 폴더 > ${NRM_FOLDER}에서 확인하세요.`,
  };
}

async function androidSaveToNrmFolder(
  tempUri: string,
  safeName: string,
  sidecarLrcUri?: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  // Android 9(API 28) 이하: 직접 쓰기 시도
  if ((Platform.Version as number) < 29) {
    try {
      return await saveToExternalDirect(tempUri, safeName, sidecarLrcUri, metadata);
    } catch {
      /* fall through to SAF */
    }
  }

  // Android 10+(API 29+): SAF
  try {
    return await saveViaSaf(tempUri, safeName, sidecarLrcUri, metadata);
  } catch (safErr) {
    const msg = safErr instanceof Error ? safErr.message : String(safErr);
    if (msg.includes('취소')) throw safErr;
    return await saveToAppDocumentsFallback(tempUri, safeName, sidecarLrcUri);
  }
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/** LRC 텍스트만 다운로드 경로에 저장 (오디오와 병렬 가능). 저장 URI 반환 */
export async function persistLrcTextToDestination(
  safeName: string,
  lrcText: string,
): Promise<string | null> {
  const trimmed = lrcText.trim();
  if (!trimmed) return null;

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');

  const tempLrcUri = `${cacheRoot}nrm-lrc-out-${Date.now()}.lrc`;
  await FileSystem.writeAsStringAsync(tempLrcUri, `${trimmed}\n`);
  try {
    if (Platform.OS === 'ios') {
      const docRoot = FileSystem.documentDirectory;
      if (!docRoot) return null;
      const folderUri = `${docRoot}${NRM_FOLDER}/`;
      await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
      const fileName = storageFileName(safeName).replace(/\.[^.]+$/, '.lrc');
      const lrcDest = `${folderUri}${fileName}`;
      await FileSystem.deleteAsync(lrcDest, { idempotent: true }).catch(() => {});
      await FileSystem.copyAsync({ from: tempLrcUri, to: lrcDest });
      return lrcDest;
    }

    if ((Platform.Version as number) < 29) {
      try {
        const dirUri = `file:///storage/emulated/0/${NRM_FOLDER}`;
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
        const fileName = storageFileName(safeName).replace(/\.[^.]+$/, '.lrc');
        const lrcDest = `${dirUri}/${fileName}`;
        await FileSystem.deleteAsync(lrcDest, { idempotent: true }).catch(() => {});
        await FileSystem.copyAsync({ from: tempLrcUri, to: lrcDest });
        return lrcDest;
      } catch {
        /* SAF */
      }
    }

    let dirUri = await loadStoredSafGrant();
    if (!dirUri) {
      await showSafFolderGuide();
      dirUri = await requestNewSafDirUri(NRM_FOLDER);
    }
    if (!dirUri) return null;

    const lrcName = storageFileName(safeName).replace(/\.[^.]+$/, '.lrc');
    const lrcDest = await copyLocalFileToSaf(tempLrcUri, dirUri, lrcName, LRC_SAF_MIME);
    return lrcDest;
  } finally {
    await FileSystem.deleteAsync(tempLrcUri, { idempotent: true }).catch(() => {});
  }
}

/** ffmpeg 실패 등으로 LRC만 롤백할 때 */
export async function deletePersistedLrc(lrcUri: string): Promise<void> {
  const uri = lrcUri.trim();
  if (!uri) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** ffmpeg 적용된 임시 오디오를 다운로드 경로에 저장 (LRC는 별도 선저장 가능) */
export async function persistAudioToDestination(
  tempUri: string,
  safeName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  return persistLocalAudioFile(tempUri, safeName, metadata);
}

/** 기기에서 생성한 임시 오디오 파일을 저장 위치로 이동합니다. */
export async function persistLocalAudioFile(
  tempUri: string,
  safeName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  const storedName = storageFileName(safeName);
  const tempPath = tempUri.replace(/^file:\/\//, '');
  const lrcUri = siblingLrcUri(tempUri);
  const lrcPath = siblingLrcFsPath(tempUri);
  const sidecarExists =
    lrcPath !== tempPath &&
    (await FileSystem.getInfoAsync(lrcUri).then((x) => !!x.exists).catch(() => false));
  const lrcToPersist = sidecarExists ? lrcUri : undefined;
  try {
    if (Platform.OS === 'ios') {
      const docRoot = FileSystem.documentDirectory;
      if (!docRoot) throw new Error('이 기기에서 문서 저장 공간을 사용할 수 없습니다.');

      const folderUri = `${docRoot}${NRM_FOLDER}/`;
      await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
      const destUri = `${folderUri}${storedName}`;
      await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
      await FileSystem.copyAsync({ from: tempUri, to: destUri });
      if (lrcToPersist) {
        const lrcDest = `${folderUri}${storedName.replace(/\.[^.]+$/, '.lrc')}`;
        await FileSystem.deleteAsync(lrcDest, { idempotent: true }).catch(() => {});
        await FileSystem.copyAsync({ from: lrcToPersist, to: lrcDest });
      }

      return {
        savedLabel: `저장했습니다. iOS «파일» 앱 → 내 iPhone → 이 앱 → «${NRM_FOLDER}» 폴더에서 확인하세요.`,
      };
    }

    return await androidSaveToNrmFolder(tempUri, safeName, lrcToPersist, metadata);
  } finally {
    if (lrcToPersist) {
      await FileSystem.deleteAsync(lrcToPersist, { idempotent: true }).catch(() => {});
    }
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
}

export async function persistAudioAfterServerJob(
  apiBase: string,
  jobId: string,
  options: { fileName: string; lrcText?: string },
): Promise<{ savedLabel: string }> {
  const base = normalizedApiBase(apiBase);
  const url = `${base}/api/download/file?jobId=${encodeURIComponent(jobId)}`;
  const lrcUrl = `${base}/api/download/lrc?jobId=${encodeURIComponent(jobId)}`;
  const safeName = options.fileName;

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');

  const tempBase = cacheRoot.endsWith('/') || cacheRoot.endsWith('\\')
    ? `${cacheRoot}nrm-dl-${jobId}-`
    : `${cacheRoot}/nrm-dl-${jobId}-`;
  const tempUri = `${tempBase}${safeName}`;
  const tempLrcUri = `${tempBase}${safeName.replace(/\.[^.]+$/, '.lrc')}`;

  const dl = await FileSystem.downloadAsync(url, tempUri);
  if (dl.status < 200 || dl.status >= 300) {
    throw new Error(`파일을 받지 못했습니다 (HTTP ${dl.status})`);
  }

  const lrcFromApi = options.lrcText?.trim();
  if (lrcFromApi) {
    await FileSystem.writeAsStringAsync(tempLrcUri, `${lrcFromApi}\n`);
  } else {
    const lrc = await FileSystem.downloadAsync(lrcUrl, tempLrcUri).catch(() => null);
    if (!lrc || lrc.status < 200 || lrc.status >= 300) {
      await FileSystem.deleteAsync(tempLrcUri, { idempotent: true }).catch(() => {});
    }
  }

  const out = await persistLocalAudioFile(tempUri, safeName);
  await fetch(`${base}/api/download/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(() => null);
  return out;
}
