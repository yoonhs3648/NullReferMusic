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
  extensionFromLocalPath,
  extensionToYtDlpFormat,
  loadDownloadEncodeSettings,
  loadLyricsOutputMode,
} from '@/lib/nrmDownloadSettings';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
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
  lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted';
};

function whisperWarningFromResult(
  result: WhisperLrcStageResult | null,
): 'not_embedded' | 'translation_failed' | 'translation_exhausted' | undefined {
  if (!result) return undefined;
  if (result.lyricsTranslationExhausted) return 'translation_exhausted';
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

async function finalizeNativeParallel(
  extractionUri: string,
  fileName: string,
  embedMetadata: NrmAudioFileMetadata | undefined,
  options?: FinalizeParallelOptions,
): Promise<FinalizeParallelResult> {
  const encode = await loadDownloadEncodeSettings();
  const { whisperMode, ffmpegMetadata } = embedMetadata
    ? splitMetadataForDownloadStages(embedMetadata)
    : { whisperMode: null, ffmpegMetadata: undefined };

  logDownloadStage('pipeline', 'finalize_start', {
    fileName,
    extension: encode.extension,
    hasMetadata: !!embedMetadata,
    whisperMode: whisperMode ?? null,
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
  const willTranscodeNonMp3 = haveExt !== wantExt && wantExt !== 'mp3';

  const normalizedForCombined = ffmpegMetadata
    ? normalizeDownloadMetadata(ffmpegMetadata)
    : undefined;
  const hasCombinableMetadata =
    normalizedForCombined != null && hasEmbeddableAudioMetadata(normalizedForCombined);

  const usesCombinedPath =
    Platform.OS === 'android' && willTranscodeNonMp3 && hasCombinableMetadata;

  // ── 오디오 태스크 + Whisper 소스 설정 ────────────────────────────────────────
  let whisperSourceUri: string;
  let audioTask: Promise<{
    savedLabel: string;
    location: import('@/lib/nrmPersistDownload.native').PersistedAudioLocation;
  }>;

  if (usesCombinedPath) {
    // 결합 경로: Whisper 소스를 변환 전 원본(소파일)에서 복사 (WAV 등 대형 출력 전)
    whisperSourceUri = extractionUri;
    if (whisperMode) {
      try {
        const wCopy = await copyAudioForWhisperParallel(extractionUri);
        temps.add(wCopy);
        whisperSourceUri = wCopy;
      } catch {
        // fallback: extractionUri 사용 (트랜스코드 후 삭제될 수 있으나 Whisper가 먼저 읽음)
      }
    }

    // 단일 ffmpeg 패스: transcode + metadata
    let combinedUri: string;
    try {
      const { transcodeAndApplyMetadataForAudio } = await import(
        '@/lib/nrmApplyAudioMetadata.native'
      );
      const combinedResult = await transcodeAndApplyMetadataForAudio(
        srcFsPath,
        extensionToYtDlpFormat(encode.extension),
        encode.audioQuality,
        normalizedForCombined!,
      );
      combinedUri = combinedResult.path;
      logDownloadStage('ffmpeg', 'combined_transcode_meta_ok', {
        format: wantExt,
        coverEmbedded: combinedResult.coverEmbedded,
      });
    } catch (combinedErr) {
      logNrmRunError('download.combined.ffmpeg', combinedErr, { format: wantExt });
      // 폴백: 기존 분리 패스
      combinedUri = await applyFfmpegTranscodeStage(extractionUri);
      combinedUri = await applyFfmpegMetadataStage(combinedUri, embedMetadata);
    }
    temps.add(combinedUri);

    audioTask = (async () => {
      const { persistAudioToDestination } = await import('@/lib/nrmPersistDownload.native');
      const saved = await persistAudioToDestination(combinedUri, safeName, embedMetadata);
      options?.onAudioPersisted?.(saved.savedLabel);
      return saved;
    })();
  } else {
    // 기존 경로: 별도 transcode + metadata
    const transcodedUri = await applyFfmpegTranscodeStage(extractionUri);
    if (transcodedUri !== extractionUri) {
      temps.add(transcodedUri);
    }

    whisperSourceUri = transcodedUri;
    if (whisperMode) {
      try {
        whisperSourceUri = await copyAudioForWhisperParallel(transcodedUri);
        temps.add(whisperSourceUri);
      } catch {
        whisperSourceUri = transcodedUri;
      }
    }

    audioTask = applyFfmpegMetadataStage(transcodedUri, embedMetadata).then(
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
  }

  const whisperTask: Promise<WhisperLrcStageResult | null> = whisperMode
    ? (async () => {
        options?.onLyricsStageStarted?.();
        logNrmDev('download.whisper', {
          event: 'finalize_whisper_parallel_start',
          fileName: safeName,
          mode: whisperMode,
          extension,
        });
        const { runWhisperTranscribeSerial } = await import('@/lib/nrmWhisperSerialGate');
        try {
          const result = await runWhisperTranscribeSerial(safeName, () =>
            transcribeWhisperLrc(whisperSourceUri, whisperMode, extension),
          );
          logNrmDev('download.whisper', {
            event: 'finalize_whisper_done',
            fileName: safeName,
            mode: whisperMode,
            lyricsTranslationFailed: result.lyricsTranslationFailed ?? false,
            lyricsTranslationExhausted: result.lyricsTranslationExhausted ?? false,
            lrcChars: result.lrcFull?.length ?? 0,
          });
          return { ...result, lyricsEmbedded: false };
        } catch (e) {
          logNrmRunError('download.whisper', e, { extension, mode: whisperMode });
          return {
            lyricsRequested: true,
            lyricsEmbedded: false,
          };
        } finally {
          options?.onLyricsStageEnded?.();
        }
      })()
    : Promise.resolve(null);

  let audioSaved: { savedLabel: string; location: import('@/lib/nrmPersistDownload.native').PersistedAudioLocation };
  try {
    const [saved, whisperResult] = await Promise.all([audioTask, whisperTask]);
    audioSaved = saved;
    whisperRef.result = whisperResult;
  } catch (e) {
    throw e;
  }

  const whisperDone = whisperRef.result;
  const lrcToPersist = whisperDone?.lrcFull?.trim() ?? '';
  // 번역 실패 시에도 폴백 원본 LRC가 있으면 저장한다
  const canPersistLrc = lrcToPersist.length > 0;

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
          lrcChars: lrcToPersist.length,
        });
        const { embedSyncedLyricsIntoAudio } = await import('@/lib/nrmApplyAudioMetadata.native');
        await embedSyncedLyricsIntoAudio(
          audioSaved.location.audioUri,
          lrcToPersist,
          audioExt,
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
          lrcChars: lrcToPersist.length,
        });
        const { persistLrcForSavedAudio } = await import('@/lib/nrmPersistDownload.native');
        const lrcUri = await persistLrcForSavedAudio(audioSaved.location, lrcToPersist);
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
