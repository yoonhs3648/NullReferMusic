import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';
import { Platform } from 'react-native';

import {
  applyAudioFileMetadata,
  embedSyncedLyricsIntoAudio,
  rescanMediaStoreAfterMetadataEdit,
  syncMediaStoreAudioTags,
} from '@/lib/nrmApplyAudioMetadata.native';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import type { NrmWhisperLyricsUiMode } from '@/lib/nrmWhisperLyrics';
import { resolveLyricsSidecarAction } from '@/lib/nrmLrcUiMode';
import {
  deletePersistedLrc,
  persistLrcForSavedAudio,
  type PersistedAudioLocation,
} from '@/lib/nrmPersistDownload.native';
import { copyLocalFileToSaf } from '@/lib/onDeviceDownload';
import { transcribeWhisperLrc } from '@/lib/nrmWhisperLrcStage';
import { sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import {
  nrmNotifyDownloadFinished,
  nrmNotifyDownloadStarted,
} from '@/lib/nrmMobileDownloadNotifications.native';
import { loadLyricsOutputMode } from '@/lib/nrmDownloadSettings';

const LRC_SAF_MIME = 'application/octet-stream';

function storageFileName(safeName: string): string {
  const dot = safeName.lastIndexOf('.');
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot).toLowerCase() : '.mp3';
  const base = sanitizeFileBase(stem) || `track-${Date.now()}`;
  return `${base}${ext}`;
}

function toNativeLocalFileUri(uriOrPath: string): string {
  const trimmed = uriOrPath.trim();
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return `file://${trimmed}`;
}

async function writeToBinarySafUri(sourceUri: string, destUri: string): Promise<void> {
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    const info = await FileSystem.getInfoAsync(destUri);
    if (info.exists && 'size' in info && (info.size ?? 0) > 0) return;
  } catch {
    /* fallback */
  }
  const b64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: 'base64' });
  await FileSystem.writeAsStringAsync(destUri, b64, { encoding: 'base64' });
}

async function materializeToCache(audioUri: string, fileName: string): Promise<string> {
  const trimmed = audioUri.trim();
  if (trimmed.startsWith('file://') || trimmed.startsWith('/')) {
    return toNativeLocalFileUri(trimmed);
  }
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('캐시를 사용할 수 없습니다.');
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.mp3';
  const dest = `${cacheRoot}nrm-track-edit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  try {
    await FileSystem.copyAsync({ from: trimmed, to: dest });
  } catch {
    const b64 = await FileSystem.readAsStringAsync(trimmed, { encoding: 'base64' });
    await FileSystem.writeAsStringAsync(dest, b64, { encoding: 'base64' });
  }
  return dest;
}

async function overwriteAudioAtLocation(
  editedLocalUri: string,
  location: PersistedAudioLocation,
  newFileName: string,
  metadata: NrmAudioFileMetadata,
): Promise<PersistedAudioLocation> {
  const storedName = storageFileName(newFileName);
  const renamed = storedName !== location.fileName;

  if (location.kind === 'saf') {
    if (!renamed) {
      await writeToBinarySafUri(editedLocalUri, location.audioUri);
      await syncMediaStoreAudioTags(location.audioUri, metadata).catch(() => {});
      return { ...location, fileName: storedName };
    }
    const mime =
      storedName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
    let destUri: string;
    try {
      destUri = await copyLocalFileToSaf(
        toNativeLocalFileUri(editedLocalUri),
        location.dirUri,
        storedName,
        mime,
      );
    } catch {
      destUri = await StorageAccessFramework.createFileAsync(
        location.dirUri,
        storedName,
        mime,
      );
      await writeToBinarySafUri(editedLocalUri, destUri);
    }
    await FileSystem.deleteAsync(location.audioUri, { idempotent: true }).catch(() => {});
    await syncMediaStoreAudioTags(destUri, metadata).catch(() => {});
    return {
      kind: 'saf',
      audioUri: destUri,
      dirUri: location.dirUri,
      fileName: storedName,
    };
  }

  const folderUri = location.folderUri;
  const destUri = `${folderUri.replace(/\/$/, '')}/${storedName}`;
  if (renamed) {
    await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: editedLocalUri, to: destUri });
    if (location.audioUri !== destUri) {
      await FileSystem.deleteAsync(location.audioUri, { idempotent: true }).catch(() => {});
    }
  } else {
    await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
    await FileSystem.copyAsync({ from: editedLocalUri, to: destUri });
  }
  return {
    kind: 'file',
    audioUri: destUri,
    folderUri,
    fileName: storedName,
  };
}

async function renameLrcIfNeeded(
  oldLocation: PersistedAudioLocation,
  newLocation: PersistedAudioLocation,
  oldLrcUri?: string,
): Promise<string | undefined> {
  if (!oldLrcUri) return undefined;
  const oldLrcName = oldLocation.fileName.replace(/\.[^.]+$/, '.lrc');
  const newLrcName = newLocation.fileName.replace(/\.[^.]+$/, '.lrc');
  if (oldLrcName === newLrcName && oldLocation.audioUri === newLocation.audioUri) {
    return oldLrcUri;
  }
  try {
    const text = await FileSystem.readAsStringAsync(oldLrcUri, { encoding: EncodingType.UTF8 });
    await deletePersistedLrc(oldLrcUri);
    if (newLocation.kind === 'saf') {
      const dest = await StorageAccessFramework.createFileAsync(
        newLocation.dirUri,
        newLrcName,
        LRC_SAF_MIME,
      );
      await FileSystem.writeAsStringAsync(dest, `${text.trim()}\n`, {
        encoding: EncodingType.UTF8,
      });
      return dest;
    }
    const dest = `${newLocation.folderUri.replace(/\/$/, '')}/${newLrcName}`;
    await FileSystem.writeAsStringAsync(dest, `${text.trim()}\n`, {
      encoding: EncodingType.UTF8,
    });
    return dest;
  } catch {
    return undefined;
  }
}

function lyricsJobId(track: NrmDownloadTrackItem): string {
  return `track-meta:${track.audioUri}`;
}

export type ApplyTrackMetadataUpdateInput = {
  track: NrmDownloadTrackItem;
  newFileName: string;
  metadata: NrmAudioFileMetadata;
  initialLyricsMode: NrmWhisperLyricsUiMode;
  newLyricsMode: NrmWhisperLyricsUiMode;
};

export async function applyTrackMetadataUpdate(
  input: ApplyTrackMetadataUpdateInput,
): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('트랙 메타데이터 설정은 앱에서만 사용할 수 있습니다.');
  }

  const { track, newFileName, metadata, initialLyricsMode, newLyricsMode } = input;
  const { ffmpegMetadata } = splitMetadataForDownloadStages(metadata);
  const lyricsAction = resolveLyricsSidecarAction(initialLyricsMode, newLyricsMode, track.lrcUri);
  const displayLabel = `${metadata.artist.trim()} - ${metadata.title.trim()}`;
  const jobId = lyricsJobId(track);

  const cacheUri = await materializeToCache(track.audioUri, track.fileName);
  const editedUri = await applyAudioFileMetadata(cacheUri, ffmpegMetadata);

  let location = await overwriteAudioAtLocation(
    editedUri,
    track.location,
    newFileName,
    ffmpegMetadata,
  );

  await rescanMediaStoreAfterMetadataEdit(location.audioUri, ffmpegMetadata).catch(() => {});

  let lrcUri = track.lrcUri;
  if (lyricsAction.kind === 'none' && track.fileName !== location.fileName) {
    lrcUri = await renameLrcIfNeeded(track.location, location, track.lrcUri);
  }

  if (lyricsAction.kind === 'delete') {
    if (lrcUri) await deletePersistedLrc(lrcUri);
    return;
  }

  if (lyricsAction.kind === 'none') {
    return;
  }

  const ext = location.fileName.slice(location.fileName.lastIndexOf('.')).toLowerCase();
  const supportsEmbed = ext === '.mp3' || ext === '.m4a';
  // 파일에 기존 사이드카 LRC가 있으면 사이드카 유지, 없으면 앱 설정 따름
  const lyricsOutputMode = await loadLyricsOutputMode();
  const useEmbed = !track.lrcUri && lyricsOutputMode === 'embed' && supportsEmbed;

  /**
   * LRC 저장 헬퍼 – useEmbed 여부에 따라 오디오에 내장하거나 사이드카로 저장한다.
   * 임베드 경로에서는 saved audio URI를 직접 수정하므로 location.audioUri 기준으로 처리.
   */
  async function saveLrc(lrcText: string): Promise<void> {
    if (useEmbed) {
      await embedSyncedLyricsIntoAudio(location.audioUri, lrcText, ext);
    } else {
      await persistLrcForSavedAudio(location, lrcText);
    }
  }

  // translate-lrc / strip-translation은 기존 LRC 내용이 필요하므로 삭제 전에 미리 읽기
  let preReadLrcText: string | null = null;
  if (
    (lyricsAction.kind === 'translate-lrc' || lyricsAction.kind === 'strip-translation') &&
    track.lrcUri
  ) {
    try {
      preReadLrcText = await FileSystem.readAsStringAsync(track.lrcUri, {
        encoding: EncodingType.UTF8,
      });
    } catch {
      preReadLrcText = null;
    }
  }

  if (lrcUri) await deletePersistedLrc(lrcUri);

  nrmNotifyDownloadStarted(jobId, displayLabel, 'lyrics');

  // configured → translation: Whisper 재실행 없이 기존 LRC를 DeepL로 번역
  if (lyricsAction.kind === 'translate-lrc') {
    const existingLrcText = preReadLrcText?.trim() ?? '';
    if (!existingLrcText) {
      nrmNotifyDownloadFinished(jobId, displayLabel, false, 'lyrics');
      throw new Error('기존 가사 파일을 읽을 수 없습니다.');
    }
    let notified = false;
    const notify = (ok: boolean) => {
      if (!notified) {
        notified = true;
        nrmNotifyDownloadFinished(jobId, displayLabel, ok, 'lyrics');
      }
    };
    try {
      const [{ getDeepLApiKey }, { translateLrcToKoreanWithDeepL }] = await Promise.all([
        import('@/lib/nrmDeepLApiSettings'),
        import('@/lib/nrmDeepLApiClient'),
      ]);
      const apiKey = await getDeepLApiKey();
      const translated = await translateLrcToKoreanWithDeepL(existingLrcText, apiKey);
      if (!translated.ok) {
        // 번역 실패 — 원본 LRC 유지 후 경고 throw (UI에서 에러 메시지 표시)
        await saveLrc(existingLrcText);
        notify(false);
        const isExhausted = (translated.message ?? '').includes('사용량이 초과');
        throw new Error(
          isExhausted
            ? 'DeepL 사용량이 초과되었습니다. 번역 없이 원본 가사로 저장되었습니다.'
            : `번역에 실패했습니다. 원본 가사로 저장되었습니다. (${translated.message ?? ''})`,
        );
      }
      await saveLrc(translated.lrc);
      notify(true);
    } catch (e) {
      notify(false);
      throw e;
    }
    return;
  }

  // translation → configured: Whisper 재실행 없이 한글 번역 줄만 제거
  if (lyricsAction.kind === 'strip-translation') {
    const existingLrcText = preReadLrcText?.trim() ?? '';
    try {
      if (existingLrcText) {
        const { stripTranslationsFromLrc } = await import('@/lib/nrmDeepLLrcFormat');
        const stripped = stripTranslationsFromLrc(existingLrcText);
        await saveLrc(stripped || existingLrcText);
      }
      nrmNotifyDownloadFinished(jobId, displayLabel, true, 'lyrics');
    } catch {
      nrmNotifyDownloadFinished(jobId, displayLabel, false, 'lyrics');
    }
    return;
  }

  // generate: Whisper 재전사 후 저장
  try {
    const workUri = await materializeToCache(location.audioUri, location.fileName);
    const whisper = await transcribeWhisperLrc(workUri, lyricsAction.mode, ext);
    if (whisper.lrcFull?.trim()) {
      await saveLrc(whisper.lrcFull);
      nrmNotifyDownloadFinished(jobId, displayLabel, true, 'lyrics');
    } else {
      nrmNotifyDownloadFinished(jobId, displayLabel, false, 'lyrics');
    }
    await FileSystem.deleteAsync(workUri, { idempotent: true }).catch(() => {});
  } catch {
    nrmNotifyDownloadFinished(jobId, displayLabel, false, 'lyrics');
  }
}
