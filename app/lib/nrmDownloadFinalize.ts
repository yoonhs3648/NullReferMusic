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
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import { nrmYieldToEventLoop } from '@/lib/nrmYieldToEventLoop';
import {
  transcribeWhisperLrc,
  type WhisperLrcStageResult,
} from '@/lib/nrmWhisperLrcStage';

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

  let lyricsWarning: 'not_embedded' | 'translation_failed' | undefined;

  let lrcText: string | undefined;

  if (embedMetadata) {
    const { ffmpegMetadata, whisperMode } = splitMetadataForDownloadStages(embedMetadata);
    const {
      applyServerJobFfmpegMetadata,
      applyServerJobPostProcess,
    } = await import('@/lib/nrmApplyAudioMetadata.web');

    const needsTranslation = whisperMode === 'translation';
    const [{ getDeepLApiKey }, { loadTranslationProvider }] = await Promise.all([
      import('@/lib/nrmDeepLApiSettings'),
      import('@/lib/nrmTranslationSettings'),
    ]);
    const provider = await loadTranslationProvider();
    const deeplApiKey =
      needsTranslation && provider === 'deepl' ? await getDeepLApiKey() : '';
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
  const { whisperMode, melonMode, melonLyricsPlain, melonAlignLang, ffmpegMetadata } = embedMetadata
    ? splitMetadataForDownloadStages(embedMetadata)
    : {
        whisperMode: null,
        melonMode: null,
        melonLyricsPlain: null,
        melonAlignLang: 'ko' as const,
        ffmpegMetadata: undefined,
      };

  const lyricsModeActive = whisperMode ?? melonMode;

  logDownloadStage('pipeline', 'finalize_start', {
    fileName,
    extension: encode.extension,
    hasMetadata: !!embedMetadata,
    whisperMode: whisperMode ?? null,
    melonMode: melonMode ?? null,
  });

  const safeName = applyDownloadExtension(fileName, encode.extension);
  const extension = encode.extension;
  const temps = new Set<string>([extractionUri]);
  const whisperRef: { result: WhisperLrcStageResult | null } = { result: null };

  // ── 결합 패스 가능 여부 판단 ────────────────────────────────────────────────
  // Android + 비MP3 포맷 변환 + 임베드 메타 있음 → transcode + metadata 단일 패스
  // (MP3는 shineenc 파이프를 쓰므로 분리 유지)
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

  // ── 1단계: ffmpeg 변환·메타 (가사와 분리) ───────────────────────────────────
  await nrmYieldToEventLoop();
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

  // persist 시 원본 캐시가 삭제되므로, 가사용 로컬 복사본을 먼저 만든다
  let whisperSourceUri = processedUri;
  if (lyricsModeActive) {
    try {
      const wCopy = await copyAudioForWhisperParallel(processedUri);
      temps.add(wCopy);
      whisperSourceUri = wCopy;
    } catch {
      whisperSourceUri = processedUri;
    }
  }

  // ── 2단계: 오디오 저장 → 완료 알림 ─────────────────────────────────────────
  await nrmYieldToEventLoop();
  const { persistAudioToDestination } = await import('@/lib/nrmPersistDownload.native');
  const audioSaved = await persistAudioToDestination(processedUri, safeName, embedMetadata);
  options?.onAudioPersisted?.(audioSaved.savedLabel);

  // ── 3단계: 가사 생성 (오디오가 저장된 뒤) ───────────────────────────────────
  if (lyricsModeActive) {
    const activeMode = whisperMode ?? melonMode!;
    options?.onLyricsStageStarted?.();
    logNrmDev('download.lyrics', {
      event: 'finalize_lyrics_start',
      fileName: safeName,
      mode: activeMode,
      extension,
      engine: melonMode ? 'whisperx-align' : 'whisper',
    });
    const { runWhisperTranscribeSerial } = await import('@/lib/nrmWhisperSerialGate');
    try {
      const result = await runWhisperTranscribeSerial(safeName, () => {
        if (melonMode && melonLyricsPlain) {
          return import('@/lib/nrmMelonLyricsLrcStage').then((m) =>
            m.transcribeMelonLyricsLrc(
              whisperSourceUri,
              melonMode,
              extension,
              melonLyricsPlain,
              melonAlignLang,
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
    } finally {
      options?.onLyricsStageEnded?.();
    }
  }

  const whisperDone = whisperRef.result;
  const lrcToPersist = whisperDone?.lrcFull?.trim() ?? '';
  const persistedLyricsMode =
    lyricsModeActive && (whisperMode ?? melonMode)
      ? (whisperMode ?? melonMode!)
      : null;
  const lrcToWrite =
    lrcToPersist && persistedLyricsMode
      ? (await import('@/lib/nrmLrcUiMode')).withNrmLyricsModeHeader(
          lrcToPersist,
          persistedLyricsMode,
        )
      : lrcToPersist;
  // 번역 실패 시에도 폴백 원본 LRC가 있으면 저장한다
  const canPersistLrc = lrcToWrite.length > 0;

  if (canPersistLrc && whisperDone) {
    const lyricsOutputMode = await loadLyricsOutputMode();
    const audioExt = extension; // 예: '.mp3', '.m4a'
    const supportsEmbed = audioExt === '.mp3' || audioExt === '.m4a';
    const useEmbed = lyricsOutputMode === 'embed' && supportsEmbed;

    if (useEmbed) {
      try {
        logNrmDev('download.lrc', {
          event: 'embed_lyrics_start',
          audioFileName: audioSaved.location.fileName,
          storageKind: audioSaved.location.kind,
          extension: audioExt,
          lrcChars: lrcToWrite.length,
        });
        const { embedSyncedLyricsIntoAudio } = await import('@/lib/nrmApplyAudioMetadata.native');
        await embedSyncedLyricsIntoAudio(
          audioSaved.location.audioUri,
          lrcToWrite,
          audioExt,
          persistedLyricsMode ?? undefined,
        );
        whisperRef.result = { ...whisperDone, lyricsEmbedded: true };
        logNrmDev('download.lrc', {
          event: 'embed_lyrics_ok',
          audioFileName: audioSaved.location.fileName,
          storageKind: audioSaved.location.kind,
          extension: audioExt,
        });
        options?.onLyricsPersisted?.(audioSaved.location.audioUri);
      } catch (e) {
        logNrmRunError('download.lrc', e, {
          event: 'embed_lyrics_fail',
          audioFileName: audioSaved.location.fileName,
          storageKind: audioSaved.location.kind,
          extension: audioExt,
        });
        whisperRef.result = { ...whisperDone, lyricsEmbedded: false };
      }
    } else {
      try {
        logNrmDev('download.lrc', {
          event: 'move_to_audio_dir_start',
          audioFileName: audioSaved.location.fileName,
          storageKind: audioSaved.location.kind,
          lrcChars: lrcToWrite.length,
        });
        const { persistLrcForSavedAudio } = await import('@/lib/nrmPersistDownload.native');
        const lrcUri = await persistLrcForSavedAudio(audioSaved.location, lrcToWrite);
        whisperRef.result = {
          ...whisperDone,
          lyricsEmbedded: !!lrcUri,
        };
        logNrmDev('download.lrc', {
          event: lrcUri ? 'move_to_audio_dir_ok' : 'move_to_audio_dir_empty_uri',
          audioFileName: audioSaved.location.fileName,
          storageKind: audioSaved.location.kind,
          lrcUri: lrcUri ?? '',
        });
        if (lrcUri) {
          options?.onLyricsPersisted?.(lrcUri);
        }
        if (!lrcUri) {
          logNrmDev('download.lrc', {
            event: 'finalize_no_uri',
            audioFileName: audioSaved.location.fileName,
          });
        }
      } catch (e) {
        logNrmRunError('download.lrc', e, {
          event: 'finalize_persist_failed',
          stage: 'move_to_audio_dir_fail',
          audioFileName: audioSaved.location.fileName,
          storageKind: audioSaved.location.kind,
        });
        whisperRef.result = {
          ...whisperDone,
          lyricsEmbedded: false,
        };
      }
    }
  } else if (whisperRef.result?.lyricsRequested) {
    logNrmDev('download.lrc', {
      event: whisperRef.result.lyricsTranslationFailed
        ? 'finalize_skip_translation_failed'
        : 'finalize_skip_no_text',
      audioFileName: audioSaved.location.fileName,
      lyricsEmbedded: whisperRef.result.lyricsEmbedded,
    });
  }

  await deleteLocalAudioTemps(temps);

  logDownloadStage('pipeline', 'finalize_ok', {
    fileName: safeName,
    extension,
    lyricsWarning: whisperWarningFromResult(whisperRef.result) ?? null,
  });

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
