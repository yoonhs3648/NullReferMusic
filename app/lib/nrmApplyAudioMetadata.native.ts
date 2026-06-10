import { NativeModules, Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';

type NativeAudioMetadata = {
  applyMetadata: (
    inputPath: string,
    metadata: NrmAudioFileMetadata,
  ) => Promise<{ path: string }>;
  updateMediaStoreAudioTags: (
    mediaUri: string,
    metadata: NrmAudioFileMetadata,
  ) => Promise<null>;
  rescanMediaFile?: (
    inputPath: string,
    metadata: NrmAudioFileMetadata,
  ) => Promise<null>;
};

function toFsPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

export async function applyAudioFileMetadata(
  fileUri: string,
  metadata: NrmAudioFileMetadata,
): Promise<string> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return fileUri;
  }
  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  if (!mod?.applyMetadata) {
    return fileUri;
  }
  const { normalizeDownloadMetadata } = await import('@/lib/nrmDownloadAudioMetadata');
  const normalized = normalizeDownloadMetadata(metadata);
  const out = await mod.applyMetadata(toFsPath(fileUri), normalized);
  const path = out?.path?.trim();
  if (!path) return fileUri;
  return path.startsWith('file://') ? path : `file://${path}`;
}

/** SAF·MediaStore 등록 후 삼성 뮤직 등이 읽는 DB 태그 보강 */
export async function syncMediaStoreAudioTags(
  mediaUri: string,
  metadata: NrmAudioFileMetadata,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  if (!mod?.updateMediaStoreAudioTags) return;
  const { hasEmbeddableAudioMetadata, normalizeDownloadMetadata } = await import(
    '@/lib/nrmDownloadAudioMetadata',
  );
  const normalized = normalizeDownloadMetadata(metadata);
  if (!hasEmbeddableAudioMetadata(normalized)) return;
  await mod.updateMediaStoreAudioTags(mediaUri, normalized);
}

/** 메타 편집 후 MediaStore 재스캔·DB 태그 동기화 (삼성 뮤직 등) */
export async function rescanMediaStoreAfterMetadataEdit(
  audioUri: string,
  metadata: NrmAudioFileMetadata,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { hasEmbeddableAudioMetadata, normalizeDownloadMetadata } = await import(
    '@/lib/nrmDownloadAudioMetadata',
  );
  const normalized = normalizeDownloadMetadata(metadata);
  if (!hasEmbeddableAudioMetadata(normalized)) return;

  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  const trimmed = audioUri.trim();
  if (!trimmed) return;

  try {
    const ML = require('expo-media-library') as typeof import('expo-media-library');
    let { status } = await ML.getPermissionsAsync();
    if (status !== 'granted') {
      const res = await ML.requestPermissionsAsync();
      status = res.status;
    }
    if (status === 'granted') {
      const asset = await ML.createAssetAsync(trimmed);
      const mediaUri = asset?.uri?.trim();
      if (mediaUri && mod?.updateMediaStoreAudioTags) {
        await mod.updateMediaStoreAudioTags(mediaUri, normalized);
        return;
      }
    }
  } catch {
    /* expo-media-library 실패 시 파일 경로 스캔 폴백 */
  }

  if (mod?.rescanMediaFile) {
    const path = toFsPath(trimmed);
    if (path.startsWith('/')) {
      await mod.rescanMediaFile(path, normalized).catch(() => {});
    }
  }
}
