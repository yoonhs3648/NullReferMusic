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
  /** 비MP3 포맷 변환 + 메타데이터를 단일 ffmpeg 패스로 처리 (Android 전용) */
  transcodeAndApplyMetadata?: (
    inputPath: string,
    audioFormat: string,
    audioQuality: number,
    metadata: NrmAudioFileMetadata,
  ) => Promise<{ path: string; coverEmbedded: boolean }>;
  /** 동기화 가사(LRC)를 오디오 파일 메타데이터로 임베드 (mp3: SYLT, m4a: ©lyr) */
  embedSyncedLyrics?: (
    audioUri: string,
    lrcContent: string,
    extension: string,
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

/**
 * Android 전용: transcode + 메타데이터를 단일 ffmpeg 패스로 처리.
 * 비MP3 포맷 변환(예: m4a→wav, webm→m4a)에서 호출.
 * 기존 transcode 단계 + 별도 metadata 단계를 1회 I/O로 대체.
 */
export async function transcodeAndApplyMetadataForAudio(
  inputPath: string,
  audioFormat: string,
  audioQuality: number,
  metadata: NrmAudioFileMetadata,
): Promise<{ path: string; coverEmbedded: boolean }> {
  if (Platform.OS !== 'android') {
    throw new Error('transcodeAndApplyMetadataForAudio는 Android 전용입니다.');
  }
  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  if (!mod?.transcodeAndApplyMetadata) {
    throw new Error('NrmAudioMetadata.transcodeAndApplyMetadata를 사용할 수 없습니다.');
  }
  const src = inputPath.startsWith('file://') ? inputPath.slice(7) : inputPath;
  const out = await mod.transcodeAndApplyMetadata(src, audioFormat, audioQuality, metadata);
  const path = out?.path?.trim();
  if (!path) throw new Error('결합 변환 결과 경로가 비어 있습니다.');
  return {
    path: path.startsWith('file://') ? path : `file://${path}`,
    coverEmbedded: out.coverEmbedded ?? false,
  };
}

/**
 * Android 전용: LRC 동기화 가사를 오디오 파일에 직접 임베드.
 * - mp3: ID3v2 SYLT 프레임
 * - m4a/mp4/aac: FFmpeg ©lyr atom
 * audioUri: file:// 또는 content:// SAF URI
 */
export async function embedSyncedLyricsIntoAudio(
  audioUri: string,
  lrcContent: string,
  extension: string,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  if (!mod?.embedSyncedLyrics) {
    throw new Error('NrmAudioMetadata.embedSyncedLyrics를 사용할 수 없습니다.');
  }
  const uri = audioUri.trim();
  if (!uri || !lrcContent.trim()) return;
  await mod.embedSyncedLyrics(uri, lrcContent, extension.replace(/^\./, ''));
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
