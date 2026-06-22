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
 *   오디오·LRC는 네이티브 스트리밍 복사(copyFileToSaf / copyFileToExistingSaf)만 사용합니다.
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';
import { Alert, Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { hasEmbeddableAudioMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  copyLocalFileToExistingSaf,
  copyLocalFileToSaf,
} from '@/lib/onDeviceDownload';
import { syncMediaStoreAudioTags } from '@/lib/nrmApplyAudioMetadata.native';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { isExpoGo } from '@/lib/nrmDevRuntime';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import { siblingLrcFsPath, siblingLrcUri } from '@/lib/nrmSiblingLrc';
import {
  nrmPlainSidecarNameFromAudioFileName,
  siblingNrmPlainUri,
} from '@/lib/nrmMelonPlainSidecar';
import { isMelonPlainLyricsText } from '@/lib/nrmMelonLyrics';
import { sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import {
  loadStoredSafGrant,
  requestNewSafDirUri,
} from '@/lib/nrmDownloadSafGrant';
import { nrmYieldToEventLoop } from '@/lib/nrmYieldToEventLoop';
import { NRM_BRAND_STORAGE_FOLDER_NAME } from '@/lib/nrmAppBrand';

const NRM_FOLDER = NRM_BRAND_STORAGE_FOLDER_NAME;

/** SAF createDocument(text/plain) 시 `.lrc` → `.lrc.txt` / `.lrc.text` 로 바뀌는 문제 방지 */
const LRC_SAF_MIME = 'application/octet-stream';
const PLAIN_SAF_MIME = 'application/octet-stream';

function toNativeLocalFileUri(uriOrPath: string): string {
  const trimmed = uriOrPath.trim();
  if (trimmed.startsWith('content://')) {
    throw new Error(`로컬 파일이 아닙니다: ${trimmed.slice(0, 96)}`);
  }
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return `file://${trimmed}`;
}

/** SAF tree에 LRC 텍스트 저장 (UTF-8 직접 쓰기 → 실패 시 네이티브 스트리밍 복사) */
async function writeLrcTextToSafTree(
  dirUri: string,
  lrcName: string,
  text: string,
): Promise<string> {
  const body = `${text.trim()}\n`;
  const lrcDest = await StorageAccessFramework.createFileAsync(dirUri, lrcName, LRC_SAF_MIME);
  try {
    await FileSystem.writeAsStringAsync(lrcDest, body, {
      encoding: EncodingType.UTF8,
    });
    return lrcDest;
  } catch {
    /* UTF-8 직접 쓰기 실패 → 네이티브 스트리밍 */
  }
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('캐시 없음');
  const temp = `${cacheRoot}nrm-lrc-saf-${Date.now()}.lrc`;
  await FileSystem.writeAsStringAsync(temp, body);
  try {
    await copyLocalFileToExistingSaf(temp, lrcDest);
    return lrcDest;
  } finally {
    await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
  }
}

async function copyLrcSidecarToSaf(
  dirUri: string,
  fileName: string,
  sidecarLrcUri: string,
): Promise<string> {
  const lrcName = fileName.replace(/\.[^.]+$/, '.lrc');
  const lrcSrc = toNativeLocalFileUri(sidecarLrcUri);
  return copyLocalFileToSaf(lrcSrc, dirUri, lrcName, LRC_SAF_MIME);
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

const SAF_COPY_MAX_ATTEMPTS = 4;
const SAF_COPY_RETRY_DELAY_MS = 120;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SAF content:// URI에 로컬 파일을 네이티브 스트리밍으로 복사합니다.
 * JS base64 로드는 UI 프리즈를 유발하므로 사용하지 않습니다.
 */
async function copyLocalFileToSafDocument(
  sourceUri: string,
  destUri: string,
): Promise<void> {
  await nrmYieldToEventLoop();
  await copyLocalFileToExistingSaf(sourceUri, destUri);
}

/**
 * SAF로 저장된 파일을 Android MediaStore에 등록합니다 (백그라운드, UI 비블로킹).
 */
function scheduleMediaStoreScan(
  safDocUri: string,
  metadata?: NrmAudioFileMetadata,
): void {
  void triggerMediaStoreScan(safDocUri, metadata).catch(() => {});
}

async function triggerMediaStoreScan(
  safDocUri: string,
  metadata?: NrmAudioFileMetadata,
): Promise<void> {
  if (isExpoGo()) return;
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

async function copyAudioToSafWithRetry(
  sourceUri: string,
  dirUri: string,
  fileName: string,
  mimeType: string,
): Promise<{ destUri: string; via: 'native' | 'native_existing'; persistMs: number }> {
  const srcPath = sourceUri.startsWith('file://') ? sourceUri : `file://${sourceUri}`;
  const t0 = Date.now();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SAF_COPY_MAX_ATTEMPTS; attempt++) {
    try {
      await nrmYieldToEventLoop();
      const destUri = await copyLocalFileToSaf(srcPath, dirUri, fileName, mimeType);
      const persistMs = Date.now() - t0;
      logDownloadStage('persist', 'saf_copy_ok', {
        via: 'native',
        attempt,
        persistMs,
        fileName,
      });
      return { destUri, via: 'native', persistMs };
    } catch (e) {
      lastErr = e;
      logNrmRunError('download.persist', e, {
        event: 'saf_copy_retry',
        attempt,
        fileName,
      });
      if (attempt < SAF_COPY_MAX_ATTEMPTS) {
        await sleepMs(SAF_COPY_RETRY_DELAY_MS * attempt);
      }
    }
  }
  await nrmYieldToEventLoop();
  const destUri = await StorageAccessFramework.createFileAsync(dirUri, fileName, mimeType);
  try {
    await copyLocalFileToSafDocument(srcPath, destUri);
  } catch (e) {
    logNrmRunError('download.persist', e, {
      event: 'saf_copy_existing_fail',
      fileName,
      prior: lastErr instanceof Error ? lastErr.message : String(lastErr ?? ''),
    });
    throw e;
  }
  const persistMs = Date.now() - t0;
  logDownloadStage('persist', 'saf_copy_ok', {
    via: 'native_existing',
    persistMs,
    fileName,
  });
  return { destUri, via: 'native_existing', persistMs };
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
): Promise<{ savedLabel: string; location: PersistedAudioLocation }> {
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

  const { destUri } = await copyAudioToSafWithRetry(sourceUri, dirUri, fileName, mimeType);

  // MediaStore 등록 — 파일 저장과 분리(백그라운드). Samsung My Files·뮤직 앱 인덱스
  scheduleMediaStoreScan(destUri, metadata);

  if (sidecarLrcUri) {
    await copyLrcSidecarToSaf(dirUri, fileName, sidecarLrcUri);
  }

  return {
    savedLabel: `저장했습니다.`,
    location: {
      kind: 'saf',
      audioUri: destUri,
      dirUri,
      fileName,
    },
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
): Promise<{ savedLabel: string; location: PersistedAudioLocation }> {
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

  return {
    savedLabel: `저장했습니다. 내 파일 > ${NRM_FOLDER} 폴더에서 확인하세요.`,
    location: {
      kind: 'file',
      audioUri: destUri,
      folderUri: dirUri,
      fileName,
    },
  };
}

/** fallback: 앱 전용 Documents 폴더 저장 (Expo Go 등) */
async function saveToAppDocumentsFallback(
  sourceUri: string,
  safeName: string,
  sidecarLrcUri?: string,
): Promise<{ savedLabel: string; location: PersistedAudioLocation }> {
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
    location: {
      kind: 'file',
      audioUri: destUri,
      folderUri,
      fileName,
    },
  };
}

async function androidSaveToNrmFolder(
  tempUri: string,
  safeName: string,
  sidecarLrcUri?: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string; location: PersistedAudioLocation }> {
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
  const { preparePureSidecarLrcText } = await import('@/lib/nrmLrcUiMode');
  const trimmed = preparePureSidecarLrcText(lrcText);
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

export type PersistedAudioLocation =
  | {
      kind: 'saf';
      audioUri: string;
      dirUri: string;
      fileName: string;
    }
  | {
      kind: 'file';
      audioUri: string;
      folderUri: string;
      fileName: string;
    };

function lrcNameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '.lrc');
}

function joinFolderFile(folderUri: string, fileName: string): string {
  const sep = folderUri.endsWith('/') ? '' : '/';
  return `${folderUri}${sep}${fileName}`;
}

function stemOfName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().toLowerCase();
}

function extractSafEntryName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const nameFromDoc = decoded.match(/\/document\/[^:]+:(?:.*\/)?([^/?#]+)/i)?.[1];
  if (nameFromDoc) return nameFromDoc;
  const tail = decoded.split('/').pop() ?? '';
  return tail.split('?')[0];
}

/**
 * 현재 다운로드 경로(사용자 설정 폴더)에서 확장자 제외 stem 중복 여부 확인.
 * - Android: SAF grant 폴더 또는 legacy 외부 저장소
 * - iOS: 앱 Documents/NullReferenceMusic
 */
export async function hasConflictingFileStemInDownloadDir(fileName: string): Promise<boolean> {
  const targetStem = stemOfName(storageFileName(fileName));
  if (!targetStem) return false;

  if (Platform.OS === 'ios') {
    const docRoot = FileSystem.documentDirectory;
    if (!docRoot) return false;
    const folderUri = `${docRoot}${NRM_FOLDER}/`;
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true }).catch(() => {});
    const names = await FileSystem.readDirectoryAsync(folderUri).catch(() => []);
    return names.some((name) => stemOfName(name) === targetStem);
  }

  if (Platform.OS !== 'android') return false;

  if ((Platform.Version as number) < 29) {
    const dirUri = `file:///storage/emulated/0/${NRM_FOLDER}`;
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true }).catch(() => {});
    const names = await FileSystem.readDirectoryAsync(dirUri).catch(() => []);
    return names.some((name) => stemOfName(name) === targetStem);
  }

  const dirUri = await loadStoredSafGrant();
  if (!dirUri) return false;
  const entries = await StorageAccessFramework.readDirectoryAsync(dirUri).catch(() => []);
  return entries.some((entryUri) => stemOfName(extractSafEntryName(entryUri)) === targetStem);
}

function logLrcPersist(
  event: string,
  payload: Record<string, unknown>,
  err?: unknown,
): void {
  if (err !== undefined) {
    logNrmRunError('download.lrc', err, { event, ...payload });
    return;
  }
  logNrmDev('download.lrc', { event, ...payload });
}

/** Whisper 완료 후 — 이미 저장된 MP3와 동일 폴더·동일 stem의 `.lrc` 로 저장 */
export async function persistLrcForSavedAudio(
  location: PersistedAudioLocation,
  lrcText: string,
): Promise<string | null> {
  const { preparePureSidecarLrcText } = await import('@/lib/nrmLrcUiMode');
  const trimmed = preparePureSidecarLrcText(lrcText);
  const lrcName = lrcNameFromFileName(location.fileName);
  if (!trimmed) {
    logLrcPersist('skip_empty', {
      audioFileName: location.fileName,
      lrcName,
      storageKind: location.kind,
    });
    return null;
  }

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    const err = new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');
    logLrcPersist('fail_no_cache', { audioFileName: location.fileName, lrcName }, err);
    throw err;
  }

  logLrcPersist('persist_start', {
    audioFileName: location.fileName,
    lrcName,
    lrcBytes: trimmed.length,
    storageKind: location.kind,
    audioUri: location.audioUri,
    targetDir:
      location.kind === 'saf' ? location.dirUri : location.folderUri,
  });

  const tempLrcUri = `${cacheRoot}nrm-lrc-out-${Date.now()}.lrc`;
  await FileSystem.writeAsStringAsync(tempLrcUri, `${trimmed}\n`);
  const tempInfo = await FileSystem.getInfoAsync(tempLrcUri);
  if (!tempInfo.exists) {
    const err = new Error('임시 LRC 파일을 만들지 못했습니다.');
    logLrcPersist('fail_no_temp', { audioFileName: location.fileName, lrcName }, err);
    throw err;
  }

  try {
    let lrcDest: string;
    if (location.kind === 'saf') {
      const lrcSrc = toNativeLocalFileUri(tempLrcUri);
      try {
        lrcDest = await copyLocalFileToSaf(
          lrcSrc,
          location.dirUri,
          lrcName,
          LRC_SAF_MIME,
        );
        logLrcPersist('persist_via', {
          audioFileName: location.fileName,
          method: 'native_copy',
        });
      } catch (e1) {
        logLrcPersist(
          'persist_retry',
          { audioFileName: location.fileName, method: 'saf_create_write' },
          e1,
        );
        try {
          lrcDest = await writeLrcTextToSafTree(location.dirUri, lrcName, trimmed);
          logLrcPersist('persist_via', {
            audioFileName: location.fileName,
            method: 'saf_create_write',
          });
        } catch (e2) {
          logLrcPersist(
            'persist_retry',
            { audioFileName: location.fileName, method: 'native_existing' },
            e2,
          );
          lrcDest = await StorageAccessFramework.createFileAsync(
            location.dirUri,
            lrcName,
            LRC_SAF_MIME,
          );
          await copyLocalFileToSafDocument(tempLrcUri, lrcDest);
        }
      }
    } else {
      lrcDest = joinFolderFile(location.folderUri, lrcName);
      await FileSystem.deleteAsync(lrcDest, { idempotent: true }).catch(() => {});
      await FileSystem.copyAsync({ from: tempLrcUri, to: lrcDest });
    }

    logLrcPersist('persist_ok', {
      audioFileName: location.fileName,
      lrcName,
      lrcBytes: trimmed.length,
      storageKind: location.kind,
      lrcUri: lrcDest,
      targetDir:
        location.kind === 'saf' ? location.dirUri : location.folderUri,
    });
    return lrcDest;
  } catch (e) {
    logLrcPersist(
      'persist_fail',
      {
        audioFileName: location.fileName,
        lrcName,
        storageKind: location.kind,
        targetDir:
          location.kind === 'saf' ? location.dirUri : location.folderUri,
      },
      e,
    );
    throw e;
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

/** 멜론 plain 원문 — 오디오와 같은 폴더에 `.nrmplain` 저장 */
export async function persistMelonPlainForSavedAudio(
  location: PersistedAudioLocation,
  plainText: string,
): Promise<string | null> {
  const trimmed = plainText.trim();
  const plainName = nrmPlainSidecarNameFromAudioFileName(location.fileName);
  if (!isMelonPlainLyricsText(trimmed)) {
    return null;
  }

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return null;

  const tempUri = `${cacheRoot}nrm-plain-out-${Date.now()}.nrmplain`;
  await FileSystem.writeAsStringAsync(tempUri, `${trimmed}\n`);

  try {
    let dest: string;
    if (location.kind === 'saf') {
      const plainSrc = toNativeLocalFileUri(tempUri);
      try {
        dest = await copyLocalFileToSaf(
          plainSrc,
          location.dirUri,
          plainName,
          PLAIN_SAF_MIME,
        );
      } catch {
        dest = await writeLrcTextToSafTree(location.dirUri, plainName, trimmed);
      }
    } else {
      dest = joinFolderFile(location.folderUri, plainName);
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      await FileSystem.copyAsync({ from: tempUri, to: dest });
    }
    return dest;
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
}

export async function deletePersistedMelonPlain(audioUri: string): Promise<void> {
  const uri = siblingNrmPlainUri(audioUri);
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** ffmpeg 적용된 임시 오디오를 다운로드 경로에 저장 (LRC는 별도 선저장 가능) */
export async function persistAudioToDestination(
  tempUri: string,
  safeName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string; location: PersistedAudioLocation }> {
  return persistLocalAudioFile(tempUri, safeName, metadata);
}

/** 기기에서 생성한 임시 오디오 파일을 저장 위치로 이동합니다. */
export async function persistLocalAudioFile(
  tempUri: string,
  safeName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string; location: PersistedAudioLocation }> {
  const storedName = storageFileName(safeName);
  const tempPath = tempUri.replace(/^file:\/\//, '');
  const lrcUri = siblingLrcUri(tempUri);
  const lrcPath = siblingLrcFsPath(tempUri);
  const sidecarExists =
    lrcPath !== tempPath &&
    (await FileSystem.getInfoAsync(lrcUri).then((x) => !!x.exists).catch(() => false));
  const lrcToPersist = sidecarExists ? lrcUri : undefined;
  try {
    await nrmYieldToEventLoop();
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
        location: {
          kind: 'file',
          audioUri: destUri,
          folderUri,
          fileName: storedName,
        },
      };
    }

    const out = await androidSaveToNrmFolder(tempUri, safeName, lrcToPersist, metadata);
    logLrcPersist('audio_saved', {
      audioFileName: out.location.fileName,
      storageKind: out.location.kind,
      audioUri: out.location.audioUri,
      hadSidecarAtSave: !!lrcToPersist,
    });
    return out;
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
  await nrmBackendFetch(`${base}/api/download/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(() => null);
  return out;
}
