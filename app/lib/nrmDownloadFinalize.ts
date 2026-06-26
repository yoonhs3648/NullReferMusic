/**
 * yt-dlp 추출 완료 후 ffmpeg·가사 순차 후처리.
 * 1. ffmpeg(변환·메타) → 저장 경로에 오디오 기록 → 오디오 완료 알림
 * 2. Whisper/Melon 가사 생성 (저장된 오디오와 동일한 변환본 기준)
 * 3. LRC 사이드카 저장 또는 내장(embed) → 가사 완료 알림
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
  extensionFromLocalPath,
  extensionToYtDlpFormat,
  loadDownloadEncodeSettings,
  loadLyricsOutputMode,
} from '@/lib/nrmDownloadSettings';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { appendActivityHistory } from '@/lib/nrmActivityHistory';
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import { nrmYieldToEventLoop } from '@/lib/nrmYieldToEventLoop';
import {
  startLyricsPipelinePreload,
  type LyricsPipelinePreloadBundle,
} from '@/lib/nrmLyricsPipelinePreload';
import {
  transcribeWhisperLrc,
  type WhisperLrcStageResult,
} from '@/lib/nrmWhisperLrcStage';
import type { PersistedAudioLocation } from '@/lib/nrmPersistDownload.native';
import type { NrmMelonLyricsMode } from '@/lib/nrmMelonLyrics';
import type { NrmWhisperLyricsMode } from '@/lib/nrmWhisperLyrics';

export type FinalizeParallelOptions = {
  /** APK: 오디오가 저장 경로에 쓰인 직후 (알림용) */
  onAudioPersisted?: (savedLabel: string) => void;
  /** APK: 가사 생성 작업 큐 진입/시작 (알림용) */
  onLyricsStageStarted?: () => void;
  /** APK: 가사 생성 작업 종료 (성공/실패 무관) */
  onLyricsStageEnded?: () => void;
  /** APK: LRC 사이드카가 실제 저장 경로에 쓰인 직후 (알림용) */
  onLyricsPersisted?: (lrcUri: string) => void;
};

export type FinalizeParallelResult = {
  savedLabel: string;
  lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient';
};

function whisperWarningFromResult(
  result: WhisperLrcStageResult | null,
): 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient' | undefined {
  if (!result) return undefined;
  if (result.lyricsTranslationExhausted) return 'translation_exhausted';
  if (result.lyricsTranslationFailed) return 'translation_failed';
  if (result.lyricsMelonMemoryInsufficient) return 'memory_insufficient';
  if (result.lyricsMelonAlignFailed) return 'melon_align_failed';
  if (result.lyricsRequested && !result.lyricsEmbedded) return 'not_embedded';
  return undefined;
}

/** 웹 백엔드와 동일 — ffmpeg in-place 변환과 Whisper 전사가 같은 파일을 두지 않음 */
async function copyAudioForWhisperParallel(sourceUri: string): Promise<string> {
  await nrmYieldToEventLoop();
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

  let lyricsWarning: 'not_embedded' | 'translation_failed' | 'melon_align_failed' | undefined;

  let lrcText: string | undefined;

  if (embedMetadata) {
    const { ffmpegMetadata, whisperMode, melonMode, melonLyricsPlain } =
      splitMetadataForDownloadStages(embedMetadata);
    const {
      applyServerJobFfmpegMetadata,
      applyServerJobPostProcess,
      applyServerJobMelonAlign,
    } = await import('@/lib/nrmApplyAudioMetadata.web');

    const needsTranslation = whisperMode === 'translation';
    const [
      { getDeepLApiKey },
      { loadTranslationProvider },
      { loadWhisperModelPreference, loadAlignModelPreference },
    ] = await Promise.all([
      import('@/lib/nrmDeepLApiSettings'),
      import('@/lib/nrmTranslationSettings'),
      import('@/lib/nrmDownloadSettings'),
    ]);
    const [provider, whisperModelPreference, alignModelPreference] = await Promise.all([
      loadTranslationProvider(),
      whisperMode ? loadWhisperModelPreference() : Promise.resolve(undefined),
      melonMode ? loadAlignModelPreference() : Promise.resolve(undefined),
    ]);
    const deeplApiKey =
      needsTranslation && provider === 'deepl' ? await getDeepLApiKey() : '';

    const applyLyricsWarnings = (applied: {
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

    if (melonMode) {
      try {
        let plainForMelon = melonLyricsPlain?.trim() ?? '';
        if (!plainForMelon && embedMetadata.website) {
          const { fetchMelonPlainLyricsFromWebsite } = await import('@/lib/nrmMelonLyrics');
          plainForMelon = (await fetchMelonPlainLyricsFromWebsite(embedMetadata.website)).trim();
        }
        if (hasEmbeddableAudioMetadata(ffmpegMetadata)) {
          await applyServerJobFfmpegMetadata(jobId, ffmpegMetadata);
        }
        applyLyricsWarnings(
          await applyServerJobMelonAlign(jobId, embedMetadata, {
            melonLyricsPlain: plainForMelon,
            alignModelPreference,
            deeplApiKey,
          }),
        );
      } catch {
        lyricsWarning = 'melon_align_failed';
      }
    } else if (whisperMode) {
      try {
        applyLyricsWarnings(
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
    metadata: embedMetadata,
  });
  return { ...out, lyricsWarning };
}

export type NativeAudioStageResult = {
  savedLabel: string;
  safeName: string;
  extension: string;
  audioSaved: { savedLabel: string; location: PersistedAudioLocation };
  whisperSourceUri: string;
  embedMetadata: NrmAudioFileMetadata | undefined;
  whisperMode: NrmWhisperLyricsMode | null;
  melonMode: NrmMelonLyricsMode | null;
  melonLyricsPlain: string | null;
  melonAlignLang: 'ko' | 'en';
  lyricsModeActive: boolean;
  lyricsPreloadTask: Promise<LyricsPipelinePreloadBundle | null> | null;
  temps: Set<string>;
};

/** ffmpeg 변환·메타 → 물리 경로 저장 (가사 단계 제외) */
export async function finalizeNativeAudioStage(
  extractionUri: string,
  fileName: string,
  embedMetadata: NrmAudioFileMetadata | undefined,
  options?: Pick<FinalizeParallelOptions, 'onAudioPersisted'>,
): Promise<NativeAudioStageResult> {
  const encode = await loadDownloadEncodeSettings();
  const { whisperMode, melonMode, melonLyricsPlain, melonAlignLang, ffmpegMetadata } = embedMetadata
    ? splitMetadataForDownloadStages(embedMetadata)
    : {
        whisperMode: null,
        melonMode: null,
        melonLyricsPlain: null,
        melonAlignLang: 'ko' as const,
        ffmpegMetadata: undefined,
      };

  const lyricsModeActive = !!(whisperMode ?? melonMode);
  const safeName = applyDownloadExtension(fileName, encode.extension);
  const extension = encode.extension;
  const temps = new Set<string>([extractionUri]);

  logDownloadStage('pipeline', 'finalize_audio_start', {
    fileName,
    extension,
    hasMetadata: !!embedMetadata,
    whisperMode: whisperMode ?? null,
    melonMode: melonMode ?? null,
  });

  const lyricsPreloadTask =
    lyricsModeActive && embedMetadata ? startLyricsPipelinePreload(embedMetadata) : null;

  const wantExt = encode.extension.slice(1).toLowerCase();
  const srcFsPath = extractionUri.startsWith('file://') ? extractionUri.slice(7) : extractionUri;
  const haveExt = extensionFromLocalPath(srcFsPath);
  const willTranscodeNonMp3 =
    (haveExt !== wantExt || encode.losslessMode === 'always_reencode') && wantExt !== 'mp3';

  const normalizedForCombined = ffmpegMetadata
    ? normalizeDownloadMetadata(ffmpegMetadata)
    : undefined;
  const hasCombinableMetadata =
    normalizedForCombined != null && hasEmbeddableAudioMetadata(normalizedForCombined);

  const usesCombinedPath =
    Platform.OS === 'android' && willTranscodeNonMp3 && hasCombinableMetadata;

  await nrmYieldToEventLoop({ critical: true });
  let processedUri: string;
  if (usesCombinedPath) {
    try {
      const { transcodeAndApplyMetadataForAudio } = await import(
        '@/lib/nrmApplyAudioMetadata.native'
      );
      const combinedResult = await transcodeAndApplyMetadataForAudio(
        srcFsPath,
        encode,
        extensionToYtDlpFormat(encode.extension),
        normalizedForCombined!,
      );
      processedUri = combinedResult.path.startsWith('file://')
        ? combinedResult.path
        : `file://${combinedResult.path}`;
      logDownloadStage('ffmpeg', 'combined_transcode_meta_ok', {
        format: wantExt,
        coverEmbedded: combinedResult.coverEmbedded,
      });
    } catch (combinedErr) {
      logNrmRunError('download.combined.ffmpeg', combinedErr, { format: wantExt });
      let fallbackUri = await applyFfmpegTranscodeStage(extractionUri);
      if (fallbackUri !== extractionUri) temps.add(fallbackUri);
      processedUri = await applyFfmpegMetadataStage(fallbackUri, embedMetadata);
    }
  } else {
    const transcodedUri = await applyFfmpegTranscodeStage(extractionUri);
    if (transcodedUri !== extractionUri) temps.add(transcodedUri);
    processedUri = await applyFfmpegMetadataStage(transcodedUri, embedMetadata);
  }
  if (processedUri !== extractionUri) temps.add(processedUri);

  let whisperSourceUri = processedUri;
  const whisperCopyTask = lyricsModeActive
    ? copyAudioForWhisperParallel(processedUri).catch(() => processedUri)
    : null;

  await nrmYieldToEventLoop({ critical: true });
  const { persistAudioToDestination } = await import('@/lib/nrmPersistDownload.native');
  const [audioSaved, whisperCopyResult] = await Promise.all([
    persistAudioToDestination(processedUri, safeName, embedMetadata),
    whisperCopyTask ?? Promise.resolve(processedUri),
  ]);
  if (whisperCopyResult !== processedUri) {
    temps.add(whisperCopyResult);
    whisperSourceUri = whisperCopyResult;
  }
  options?.onAudioPersisted?.(audioSaved.savedLabel);
  void appendActivityHistory({
    fileName: displayLabelFromAudioFileName(safeName),
    audioUri: audioSaved.location.audioUri,
    kind: 'download',
  });

  logDownloadStage('pipeline', 'finalize_audio_ok', { fileName: safeName, extension });

  return {
    savedLabel: audioSaved.savedLabel,
    safeName,
    extension,
    audioSaved,
    whisperSourceUri,
    embedMetadata,
    whisperMode,
    melonMode,
    melonLyricsPlain,
    melonAlignLang,
    lyricsModeActive,
    lyricsPreloadTask,
    temps,
  };
}

/** Whisper/Melon·번역·LRC 저장 (오디오 저장 완료 후) */
export async function finalizeNativeLyricsStage(
  audioStage: NativeAudioStageResult,
  options?: Pick<
    FinalizeParallelOptions,
    'onLyricsStageStarted' | 'onLyricsStageEnded' | 'onLyricsPersisted'
  >,
): Promise<FinalizeParallelResult> {
  const {
    safeName,
    extension,
    audioSaved,
    whisperSourceUri,
    embedMetadata,
    whisperMode,
    melonMode,
    melonLyricsPlain,
    melonAlignLang,
    lyricsModeActive,
    lyricsPreloadTask,
    temps,
  } = audioStage;

  const whisperRef: { result: WhisperLrcStageResult | null } = { result: null };
  let lyricsStageStarted = false;

  if (lyricsModeActive) {
    lyricsStageStarted = true;
    const activeMode = whisperMode ?? melonMode!;
    options?.onLyricsStageStarted?.();
    logNrmDev('download.lyrics', {
      event: 'finalize_lyrics_start',
      fileName: safeName,
      mode: activeMode,
      extension,
      engine: melonMode ? 'whisperx-align' : 'whisper',
    });
    let lyricsPreload: LyricsPipelinePreloadBundle | null = null;
    if (lyricsPreloadTask) {
      try {
        lyricsPreload = await lyricsPreloadTask;
      } catch {
        lyricsPreload = null;
      }
    }
    const serialGate =
      lyricsPreload?.serialGate?.runWhisperTranscribeSerial ??
      (await import('@/lib/nrmWhisperSerialGate')).runWhisperTranscribeSerial;
    let plainForMelonAlign = melonLyricsPlain?.trim() ?? '';
    if (melonMode && !plainForMelonAlign && embedMetadata?.website) {
      const { fetchMelonPlainLyricsFromWebsite } = await import('@/lib/nrmMelonLyrics');
      plainForMelonAlign = (await fetchMelonPlainLyricsFromWebsite(embedMetadata.website)).trim();
    }
    const melonPreload = lyricsPreload
      ? {
          alignModelPreference: lyricsPreload.alignModelPreference,
          melonSyncSettings: lyricsPreload.melonSyncSettings,
          translationClient: lyricsPreload.translationClient,
        }
      : undefined;
    try {
      const result = await serialGate(safeName, () => {
        if (melonMode && plainForMelonAlign) {
          const melonStage = lyricsPreload?.melonStage;
          if (melonStage) {
            return melonStage.transcribeMelonLyricsLrc(
              whisperSourceUri,
              melonMode,
              extension,
              plainForMelonAlign,
              melonAlignLang,
              melonPreload,
            );
          }
          return import('@/lib/nrmMelonLyricsLrcStage').then((m) =>
            m.transcribeMelonLyricsLrc(
              whisperSourceUri,
              melonMode,
              extension,
              plainForMelonAlign,
              melonAlignLang,
              melonPreload,
            ),
          );
        }
        return transcribeWhisperLrc(whisperSourceUri, whisperMode!, extension);
      });
      logNrmDev('download.lyrics', {
        event: 'finalize_lyrics_done',
        fileName: safeName,
        mode: activeMode,
        engine: melonMode ? 'whisperx-align' : 'whisper',
        lyricsTranslationFailed: result.lyricsTranslationFailed ?? false,
        lyricsTranslationExhausted: result.lyricsTranslationExhausted ?? false,
        lrcChars: result.lrcFull?.length ?? 0,
      });
      whisperRef.result = { ...result, lyricsEmbedded: false };
    } catch (e) {
      logNrmRunError('download.lyrics', e, { extension, mode: activeMode });
      whisperRef.result = {
        lyricsRequested: true,
        lyricsEmbedded: false,
        ...(melonMode ? { lyricsMelonAlignFailed: true } : {}),
      };
    }
  }

  const whisperDone = whisperRef.result;
  const lrcToPersist = whisperDone?.lrcFull?.trim() ?? '';
  const persistedLyricsMode =
    lyricsModeActive && (whisperMode ?? melonMode)
      ? (whisperMode ?? melonMode!)
      : null;
  const { prepareSidecarLrcTextForPersist } = await import('@/lib/nrmLrcUiMode');
  const lrcForSidecar = prepareSidecarLrcTextForPersist(lrcToPersist, persistedLyricsMode);
  const canPersistLrc = lrcToPersist.length > 0;
  let lyricsPersistedOk = false;

  if (canPersistLrc && whisperDone) {
    const lyricsOutputMode = await loadLyricsOutputMode();
    const audioExt = extension;
    const supportsEmbed = audioExt === '.mp3' || audioExt === '.m4a';
    const useEmbed = lyricsOutputMode === 'embed' && supportsEmbed;

    if (useEmbed) {
      try {
        const { embedSyncedLyricsIntoAudio } = await import('@/lib/nrmApplyAudioMetadata.native');
        await embedSyncedLyricsIntoAudio(
          audioSaved.location.audioUri,
          lrcToPersist,
          audioExt,
          persistedLyricsMode ?? undefined,
        );
        whisperRef.result = { ...whisperDone, lyricsEmbedded: true };
        lyricsPersistedOk = true;
        options?.onLyricsPersisted?.(audioSaved.location.audioUri);
      } catch (e) {
        logNrmRunError('download.lrc', e, {
          event: 'embed_lyrics_fail',
          audioFileName: audioSaved.location.fileName,
        });
        whisperRef.result = { ...whisperDone, lyricsEmbedded: false };
      }
    } else {
      try {
        const { persistLrcForSavedAudio } = await import('@/lib/nrmPersistDownload.native');
        const lrcUri = await persistLrcForSavedAudio(audioSaved.location, lrcForSidecar);
        whisperRef.result = {
          ...whisperDone,
          lyricsEmbedded: !!lrcUri,
        };
        if (lrcUri) {
          lyricsPersistedOk = true;
          options?.onLyricsPersisted?.(lrcUri);
        }
      } catch (e) {
        logNrmRunError('download.lrc', e, {
          event: 'finalize_persist_failed',
          audioFileName: audioSaved.location.fileName,
        });
        whisperRef.result = {
          ...whisperDone,
          lyricsEmbedded: false,
        };
      }
    }
  }

  if (lyricsStageStarted) {
    if (lyricsPersistedOk && whisperRef.result) {
      const translationRequested =
        persistedLyricsMode === 'translation' || persistedLyricsMode === 'melon_translation';
      const translationSucceeded =
        translationRequested && !(whisperRef.result.lyricsTranslationFailed ?? false);
      void appendActivityHistory({
        fileName: displayLabelFromAudioFileName(safeName),
        audioUri: audioSaved.location.audioUri,
        kind: translationSucceeded ? 'lyrics_translation' : 'lyrics',
      });
    }
    options?.onLyricsStageEnded?.();
  }

  await deleteLocalAudioTemps(temps);

  logDownloadStage('pipeline', 'finalize_ok', {
    fileName: safeName,
    extension,
    lyricsWarning: whisperWarningFromResult(whisperRef.result) ?? null,
  });

  return {
    savedLabel: audioStage.savedLabel,
    lyricsWarning: whisperWarningFromResult(whisperRef.result),
  };
}

async function finalizeNativeParallel(
  extractionUri: string,
  fileName: string,
  embedMetadata: NrmAudioFileMetadata | undefined,
  options?: FinalizeParallelOptions,
): Promise<FinalizeParallelResult> {
  const encode = await loadDownloadEncodeSettings();
  logDownloadStage('pipeline', 'finalize_start', {
    fileName,
    extension: encode.extension,
    hasMetadata: !!embedMetadata,
  });
  const audioStage = await finalizeNativeAudioStage(extractionUri, fileName, embedMetadata, {
    onAudioPersisted: options?.onAudioPersisted,
  });
  if (!audioStage.lyricsModeActive) {
    await deleteLocalAudioTemps(audioStage.temps);
    return { savedLabel: audioStage.savedLabel };
  }
  return finalizeNativeLyricsStage(audioStage, {
    onLyricsStageStarted: options?.onLyricsStageStarted,
    onLyricsStageEnded: options?.onLyricsStageEnded,
    onLyricsPersisted: options?.onLyricsPersisted,
  });
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
  const whisperMode = postMeta
    ? splitMetadataForDownloadStages(postMeta).whisperMode
    : null;
  if (whisperMode) {
    logNrmDev('download.whisper', {
      event: 'finalize_parallel_start',
      fileName,
      mode: whisperMode,
      platform: Platform.OS,
      extractionKind: extraction.kind,
    });
  }

  if (extraction.kind === 'server') {
    return finalizeServerJobParallel(extraction.jobId, fileName, postMeta);
  }

  if (Platform.OS === 'web') {
    throw new Error('finalizeAudioDownloadParallel is not for web native extraction');
  }

  return finalizeNativeParallel(extraction.fileUri, fileName, postMeta, options);
}
