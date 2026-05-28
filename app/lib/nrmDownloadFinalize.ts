/**
 * yt-dlp 추출 완료 후 ffmpeg·Whisper 병렬 후처리.
 * - Whisper 먼저 끝나면 → 다운로드 경로에 `.lrc` 선저장
 * - ffmpeg 먼저 끝나면 → 다운로드 경로에 오디오 저장 (+ APK 완료 알림)
 * - 각 단계 종료 시 관련 임시 파일 삭제
 */
import { Platform } from 'react-native';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  hasEmbeddableAudioMetadata,
  metadataForAudioExtension,
  metadataNeedsPostProcess,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { applyFfmpegMetadataStage } from '@/lib/nrmDownloadAudioStages';
import { deleteLocalAudioTemps } from '@/lib/nrmDownloadCleanup';
import type { AudioExtractionResult } from '@/lib/nrmDownloadPipeline';
import {
  applyDownloadExtension,
  loadDownloadEncodeSettings,
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

async function finalizeNativeParallel(
  extractionUri: string,
  fileName: string,
  embedMetadata: NrmAudioFileMetadata | undefined,
  options?: FinalizeParallelOptions,
): Promise<FinalizeParallelResult> {
  const encode = await loadDownloadEncodeSettings();
  const safeName = applyDownloadExtension(fileName, encode.extension);
  const extension = encode.extension;
  const { whisperMode } = embedMetadata
    ? splitMetadataForDownloadStages(embedMetadata)
    : { whisperMode: null };

  const temps = new Set<string>([extractionUri]);
  const whisperRef: { result: WhisperLrcStageResult | null } = { result: null };

  const whisperTask = whisperMode
    ? transcribeWhisperLrc(extractionUri, whisperMode, extension)
        .then(async (result) => {
          let lrcWritten = false;
          if (result.lrcFull?.trim()) {
            try {
              const { persistLrcTextToDestination } = await import(
                '@/lib/nrmPersistDownload.native'
              );
              await persistLrcTextToDestination(safeName, result.lrcFull);
              lrcWritten = true;
            } catch {
              lrcWritten = false;
            }
          }
          whisperRef.result = { ...result, lyricsEmbedded: lrcWritten };
          return whisperRef.result;
        })
        .catch(() => {
          whisperRef.result = {
            lyricsRequested: true,
            lyricsEmbedded: false,
          };
          return whisperRef.result;
        })
    : Promise.resolve(null);

  const audioTask = applyFfmpegMetadataStage(extractionUri, embedMetadata)
    .then(async (processedUri) => {
      if (processedUri !== extractionUri) {
        temps.add(processedUri);
      }
      const { persistAudioToDestination } = await import('@/lib/nrmPersistDownload.native');
      const saved = await persistAudioToDestination(processedUri, safeName, embedMetadata);
      options?.onAudioPersisted?.(saved.savedLabel);
      return saved;
    })
    .catch(async () => {
      const { persistAudioToDestination } = await import('@/lib/nrmPersistDownload.native');
      const saved = await persistAudioToDestination(extractionUri, safeName, embedMetadata);
      options?.onAudioPersisted?.(saved.savedLabel);
      return saved;
    });

  const [whisperResult, audioSaved] = await Promise.all([whisperTask, audioTask]);

  if (!whisperRef.result && whisperResult) {
    whisperRef.result = whisperResult;
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
