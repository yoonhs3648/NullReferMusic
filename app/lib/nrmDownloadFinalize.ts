/**
 * yt-dlp 추출 완료 후 ffmpeg·Whisper 병렬 후처리.
 * - ffmpeg(변환·메타) 완료 → 오디오 저장 + APK 완료 알림
 * - Whisper → LRC 사이드카 (백그라운드 병렬, 완료 알림 없음)
 * - ffmpeg 실패 시 전체 실패, Whisper LRC는 삭제
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  hasEmbeddableAudioMetadata,
  metadataForAudioExtension,
  metadataNeedsPostProcess,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { applyFfmpegConversionAndMetadataStage, applyFfmpegMetadataStage, applyFfmpegTranscodeStage } from '@/lib/nrmDownloadAudioStages';
import { deleteLocalAudioTemps } from '@/lib/nrmDownloadCleanup';
import type { AudioExtractionResult } from '@/lib/nrmDownloadPipeline';
import {
  applyDownloadExtension,
  isNrmAudioExtension,
  loadDownloadEncodeSettings,
  type NrmAudioExtension,
} from '@/lib/nrmDownloadSettings';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import {
  transcribeWhisperLrc,
  type WhisperLrcStageResult,
} from '@/lib/nrmWhisperLrcStage';

export type FinalizeParallelOptions = {
  /** APK: 오디오가 저장 경로에 쓰인 직후 (알림용) */
  onAudioPersisted?: (savedLabel: string) => void;
};

export type FinalizeParallelResult = {
  savedLabel: string;
  lyricsWarning?: 'not_embedded' | 'translation_failed';
};

function whisperWarningFromResult(
  result: WhisperLrcStageResult | null,
): 'not_embedded' | 'translation_failed' | undefined {
  if (!result) return undefined;
  if (result.lyricsTranslationFailed) return 'translation_failed';
  if (result.lyricsRequested && !result.lyricsEmbedded) return 'not_embedded';
  return undefined;
}

/** 웹 백엔드와 동일 — ffmpeg in-place 변환과 Whisper 전사가 같은 파일을 두지 않음 */
async function copyAudioForWhisperParallel(sourceUri: string): Promise<string> {
  const src = sourceUri.startsWith('file://') ? sourceUri : `file://${sourceUri}`;
  const extMatch = src.match(/\.([a-z0-9]+)(?:\?|$)/i);
  const ext = extMatch ? `.${extMatch[1]}` : '.audio';
  const dest = `${FileSystem.cacheDirectory}nrm-whisper-src-${Date.now()}${ext}`;
  await FileSystem.copyAsync({ from: src, to: dest });
  return dest;
}

async function finalizeServerJobParallel(
  jobId: string,
  fileName: string,
  embedMetadata: NrmAudioFileMetadata | undefined,
): Promise<FinalizeParallelResult> {
  const encode = await loadDownloadEncodeSettings();
  const safeName = applyDownloadExtension(fileName, encode.extension);

  let lyricsWarning: 'not_embedded' | 'translation_failed' | undefined;

  let lrcText: string | undefined;

  if (embedMetadata) {
    const { ffmpegMetadata, whisperMode } = splitMetadataForDownloadStages(embedMetadata);
    const {
      applyServerJobFfmpegMetadata,
      applyServerJobPostProcess,
    } = await import('@/lib/nrmApplyAudioMetadata.web');

    const needsTranslation = whisperMode === 'translation';
    const deeplApiKey = needsTranslation
      ? await (await import('@/lib/nrmDeepLApiSettings')).getDeepLApiKey()
      : '';
    const whisperModelPreference = whisperMode
      ? await (await import('@/lib/nrmDownloadSettings')).loadWhisperModelPreference()
      : undefined;

    const applyWhisperWarnings = (applied: {
      lyricsRequested: boolean;
      lyricsEmbedded: boolean;
      lyricsTranslationFailed?: boolean;
      lrcText?: string;
    }) => {
      if (applied.lrcText?.trim()) {
        lrcText = applied.lrcText.trim();
      }
      if (applied.lyricsRequested && !applied.lyricsEmbedded) {
        lyricsWarning = 'not_embedded';
      }
      if (applied.lyricsTranslationFailed) {
        lyricsWarning = 'translation_failed';
      }
    };

    if (whisperMode) {
      try {
        applyWhisperWarnings(
          await applyServerJobPostProcess(jobId, embedMetadata, {
            deeplApiKey,
            whisperModelPreference,
          }),
        );
      } catch {
        lyricsWarning = 'not_embedded';
      }
    } else if (hasEmbeddableAudioMetadata(ffmpegMetadata)) {
      await applyServerJobFfmpegMetadata(jobId, ffmpegMetadata);
    }
  }

  const apiBase = await getResolvedApiBaseUrl();
  const { persistAudioAfterServerJob } = await import('@/lib/nrmPersistServerDownload');
  const out = await persistAudioAfterServerJob(apiBase, jobId, {
    fileName: safeName,
    lrcText,
  });
  return { ...out, lyricsWarning };
}

function extensionFromUri(uri: string): string | null {
  const path = uri.replace(/^file:\/\//, '');
  return path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? null;
}

async function finalizeNativeParallel(
  extractionUri: string,
  fileName: string,
  embedMetadata: NrmAudioFileMetadata | undefined,
  options?: FinalizeParallelOptions,
): Promise<FinalizeParallelResult> {
  const encode = await loadDownloadEncodeSettings();

  // Android: mp3→m4a remux 등 실제 확장자를 Whisper·저장 전에 확정
  const transcodedUri = await applyFfmpegTranscodeStage(extractionUri);
  const extFromFile = extensionFromUri(transcodedUri);
  const effectiveExtension: NrmAudioExtension =
    extFromFile && isNrmAudioExtension(`.${extFromFile}`)
      ? (`.${extFromFile}` as NrmAudioExtension)
      : encode.extension;
  const safeName = applyDownloadExtension(fileName, effectiveExtension);
  const extension = effectiveExtension;
  const { whisperMode } = embedMetadata
    ? splitMetadataForDownloadStages(embedMetadata)
    : { whisperMode: null };

  const temps = new Set<string>([extractionUri]);
  if (transcodedUri !== extractionUri) {
    temps.add(transcodedUri);
  }
  const whisperRef: { result: WhisperLrcStageResult | null } = {
    result: null,
  };

  let whisperSourceUri = transcodedUri;
  if (whisperMode) {
    try {
      whisperSourceUri = await copyAudioForWhisperParallel(transcodedUri);
      temps.add(whisperSourceUri);
    } catch {
      whisperSourceUri = transcodedUri;
    }
  }

  const whisperTask = whisperMode
    ? transcribeWhisperLrc(whisperSourceUri, whisperMode, extension)
        .then(async (result) => {
          whisperRef.result = { ...result, lyricsEmbedded: false };
          return whisperRef.result;
        })
        .catch(async (e) => {
          const { logNrmRunError } = await import('@/lib/nrmDevLog');
          logNrmRunError('download.whisper', e, { extension });
          whisperRef.result = {
            lyricsRequested: true,
            lyricsEmbedded: false,
          };
          return whisperRef.result;
        })
    : Promise.resolve(null);

  const audioTask = applyFfmpegMetadataStage(transcodedUri, embedMetadata).then(
    async (processedUri) => {
      if (processedUri !== transcodedUri) {
        temps.add(processedUri);
      }
      const { persistAudioToDestination } = await import('@/lib/nrmPersistDownload.native');
      const saved = await persistAudioToDestination(processedUri, safeName, embedMetadata);
      options?.onAudioPersisted?.(saved.savedLabel);
      return saved;
    },
  );

  let audioSaved: { savedLabel: string; location: import('@/lib/nrmPersistDownload.native').PersistedAudioLocation };
  const [whisperSettled, audioSettled] = await Promise.allSettled([whisperTask, audioTask]);

  if (audioSettled.status === 'rejected') {
    throw audioSettled.reason;
  }

  audioSaved = audioSettled.value;
  if (whisperSettled.status === 'fulfilled' && !whisperRef.result && whisperSettled.value) {
    whisperRef.result = whisperSettled.value;
  }

  if (whisperRef.result?.lrcFull?.trim()) {
    try {
      const { persistLrcForSavedAudio } = await import('@/lib/nrmPersistDownload.native');
      const lrcUri = await persistLrcForSavedAudio(audioSaved.location, whisperRef.result.lrcFull);
      whisperRef.result = {
        ...whisperRef.result,
        lyricsEmbedded: !!lrcUri,
      };
      if (!lrcUri) {
        const { logNrmDev } = await import('@/lib/nrmDevLog');
        logNrmDev('download.lrc', {
          event: 'finalize_no_uri',
          audioFileName: audioSaved.location.fileName,
        });
      }
    } catch (e) {
      const { logNrmRunError } = await import('@/lib/nrmDevLog');
      logNrmRunError('download.lrc', e, {
        event: 'finalize_persist_failed',
        audioFileName: audioSaved.location.fileName,
      });
      whisperRef.result = {
        ...whisperRef.result,
        lyricsEmbedded: false,
      };
    }
  } else if (whisperRef.result?.lyricsRequested) {
    const { logNrmDev } = await import('@/lib/nrmDevLog');
    logNrmDev('download.lrc', {
      event: 'finalize_skip_no_text',
      audioFileName: audioSaved.location.fileName,
      lyricsEmbedded: whisperRef.result.lyricsEmbedded,
    });
  }

  await deleteLocalAudioTemps(temps);

  return {
    savedLabel: audioSaved.savedLabel,
    lyricsWarning: whisperWarningFromResult(whisperRef.result),
  };
}

/** 추출 완료 후 ffmpeg·Whisper 병렬 → 저장 */
export async function finalizeAudioDownloadParallel(
  extraction: AudioExtractionResult,
  fileName: string,
  metadata?: NrmAudioFileMetadata,
  options?: FinalizeParallelOptions,
): Promise<FinalizeParallelResult> {
  const encode = await loadDownloadEncodeSettings();
  const normalized = metadata
    ? metadataForAudioExtension(normalizeDownloadMetadata(metadata), encode.extension)
    : undefined;
  const postMeta = metadataNeedsPostProcess(normalized) ? normalized : undefined;

  if (extraction.kind === 'server') {
    return finalizeServerJobParallel(extraction.jobId, fileName, postMeta);
  }

  if (Platform.OS === 'web') {
    throw new Error('finalizeAudioDownloadParallel is not for web native extraction');
  }

  return finalizeNativeParallel(extraction.fileUri, fileName, postMeta, options);
}
