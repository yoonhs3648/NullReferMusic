/**
 * 다운로드 후처리 파이프라인 (단계 분리)
 *
 * 1. yt-dlp — 오디오 추출만 (nrmInnertubeYoutube / 서버 download)
 * 2. ffmpeg — 확장자 변환 + ID3/커버 메타 (Whisper sentinel·가사 태그 없음)
 * 3. Whisper — LRC 사이드카 파일만 (2단계와 병렬, ffmpeg 가사 태그 없음)
 */
import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  hasEmbeddableAudioMetadata,
  normalizeDownloadMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { shouldSkipExtensionTranscode } from '@/lib/nrmDownloadEncodePolicy';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import {
  runWhisperLrcStage,
  transcribeWhisperLrc,
  type WhisperLrcStageResult,
} from '@/lib/nrmWhisperLrcStage';

export type PostProcessAudioResult = {
  fileUri: string;
  lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient';
};

/** Android: 확장자 변환만 (메타·Whisper 전에 호출해 실제 확장자 확정) */
export async function applyFfmpegTranscodeStage(fileUri: string): Promise<string> {
  let uri = fileUri;
  if (Platform.OS !== 'android') return uri;

  const { isOnDeviceDownloadAvailable, transcodeAudioOnDevice } =
    await import('@/lib/onDeviceDownload');
  if (!isOnDeviceDownloadAvailable()) return uri;

  const {
    loadDownloadEncodeSettings,
    extensionToYtDlpFormat,
    assertLocalPathMatchesExtension,
    extensionFromLocalPath,
  } = await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();
  const path = uri.startsWith('file://') ? uri.slice(7) : uri;
  const wantExt = encode.extension.slice(1).toLowerCase();
  const haveExt = extensionFromLocalPath(path);
  if (shouldSkipExtensionTranscode(encode.losslessMode, haveExt, wantExt)) return uri;

  const t0 = Date.now();
  const { path: outPath, format, fallbackReason } = await transcodeAudioOnDevice(
    path,
    extensionToYtDlpFormat(encode.extension),
    encode,
  );
  const effective = (format ?? extensionFromLocalPath(outPath) ?? '').toLowerCase();
  if (fallbackReason) {
    logDownloadStage('ffmpeg', 'transcode_fallback', {
      reason: fallbackReason,
      requested: wantExt,
      effective,
    });
  }
  uri = outPath.startsWith('file://') ? outPath : `file://${outPath}`;
  assertLocalPathMatchesExtension(uri, encode.extension);
  logDownloadStage('ffmpeg', 'transcode_ok', {
    requested: encode.extension,
    effective: `.${effective}`,
    elapsedMs: Date.now() - t0,
  });
  return uri;
}

/** 2단계: 사용자 설정 확장자로 ffmpeg 변환 후 메타·커버 적용 */
export async function applyFfmpegConversionAndMetadataStage(
  fileUri: string,
  metadata?: NrmAudioFileMetadata,
): Promise<string> {
  const uri = await applyFfmpegTranscodeStage(fileUri);
  return applyFfmpegMetadataStage(uri, metadata);
}

/** 2단계: ffmpeg 메타데이터·커버만 (Whisper와 무관, 가사 태그 없음) */
export async function applyFfmpegMetadataStage(
  fileUri: string,
  metadata?: NrmAudioFileMetadata,
): Promise<string> {
  if (!metadata) return fileUri;

  const { ffmpegMetadata } = splitMetadataForDownloadStages(metadata);
  const normalized = normalizeDownloadMetadata(ffmpegMetadata);
  if (!hasEmbeddableAudioMetadata(normalized)) {
    return fileUri;
  }

  const t0 = Date.now();
  logDownloadStage('ffmpeg', 'meta_embed_start', {
    artist: normalized.artist,
    title: normalized.title,
  });
  try {
    const { applyAudioFileMetadata } = await import('@/lib/nrmApplyAudioMetadata');
    const out = await applyAudioFileMetadata(fileUri, normalized);
    logDownloadStage('ffmpeg', 'meta_embed_ok', { elapsedMs: Date.now() - t0 });
    return out;
  } catch (e) {
    logNrmRunError('download.metadata.ffmpeg', e, {
      artist: normalized.artist,
      title: normalized.title,
    });
    try {
      const { applyAudioFileMetadata: retryApply } = await import('@/lib/nrmApplyAudioMetadata');
      const out = await retryApply(fileUri, normalized);
      logDownloadStage('ffmpeg', 'meta_embed_ok_retry', { elapsedMs: Date.now() - t0 });
      return out;
    } catch (retryErr) {
      logDownloadStage('ffmpeg', 'meta_embed_fail', {
        elapsedMs: Date.now() - t0,
        err: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
      logNrmRunError('download.metadata.ffmpeg.retry', retryErr, {});
      return fileUri;
    }
  }
}

function whisperWarningFromResult(
  result: WhisperLrcStageResult,
): 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient' | undefined {
  if (result.lyricsTranslationExhausted) return 'translation_exhausted';
  if (result.lyricsTranslationFailed) return 'translation_failed';
  if (result.lyricsMelonMemoryInsufficient) return 'memory_insufficient';
  if (result.lyricsMelonAlignFailed) return 'melon_align_failed';
  if (result.lyricsRequested && !result.lyricsEmbedded) return 'not_embedded';
  return undefined;
}

/** 2단계 → 3단계 순서 실행 (서로 실패 전파하지 않음) */
export async function postProcessDownloadedAudio(
  fileUri: string,
  metadata: NrmAudioFileMetadata | undefined,
  extension: string,
): Promise<PostProcessAudioResult> {
  let uri = fileUri;
  const split = metadata ? splitMetadataForDownloadStages(metadata) : null;
  const whisperMode = split?.whisperMode ?? null;
  const melonPlain = split?.melonLyricsPlain ?? null;

  uri = await applyFfmpegMetadataStage(uri, metadata);

  let lyricsWarning: 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient' | undefined;
  let plainAlreadyInLrcEmbed = false;
  if (whisperMode) {
    const { logNrmDev } = await import('@/lib/nrmDevLog');
    logNrmDev('download.whisper', {
      event: 'post_process_start',
      mode: whisperMode,
      extension,
    });

    const { loadLyricsOutputMode } = await import('@/lib/nrmDownloadSettings');
    const lyricsOutputMode = await loadLyricsOutputMode();
    const supportsEmbed = extension === '.mp3' || extension === '.m4a';
    const useEmbed = lyricsOutputMode === 'embed' && supportsEmbed;

    let whisperResult: WhisperLrcStageResult;
    if (useEmbed) {
      // 임베드 모드: 전사 후 오디오 파일에 직접 임베드
      whisperResult = await transcribeWhisperLrc(uri, whisperMode, extension);
      if (whisperResult.lrcFull?.trim()) {
        try {
          const { embedSyncedLyricsIntoAudio } = await import('@/lib/nrmApplyAudioMetadata.native');
          await embedSyncedLyricsIntoAudio(
            uri,
            whisperResult.lrcFull.trim(),
            extension,
            whisperMode,
            melonPlain,
          );
          whisperResult = { ...whisperResult, lyricsEmbedded: true };
          plainAlreadyInLrcEmbed = !!melonPlain;
        } catch (embedErr) {
          logNrmRunError('download.lrc', embedErr, { event: 'embed_lyrics_fail_sequential', extension });
          whisperResult = { ...whisperResult, lyricsEmbedded: false };
        }
      }
    } else {
      // 사이드카 모드: 기존 동작
      whisperResult = await runWhisperLrcStage(uri, whisperMode, extension);
    }

    lyricsWarning = whisperWarningFromResult(whisperResult);
    logNrmDev('download.whisper', {
      event: 'post_process_done',
      mode: whisperMode,
      extension,
      lyricsEmbedded: whisperResult.lyricsEmbedded,
      lyricsTranslationFailed: whisperResult.lyricsTranslationFailed ?? false,
      lyricsTranslationExhausted: whisperResult.lyricsTranslationExhausted ?? false,
      lyricsWarning: lyricsWarning ?? null,
      lyricsOutputMode: useEmbed ? 'embed' : 'sidecar',
    });
  }

  if (melonPlain && !plainAlreadyInLrcEmbed) {
    try {
      const { persistPlainLyricsEmbedIfNeeded } = await import('@/lib/nrmPersistPlainLyricsEmbed');
      await persistPlainLyricsEmbedIfNeeded(uri, extension, melonPlain);
    } catch (embedErr) {
      logNrmRunError('download.plain', embedErr, { event: 'embed_plain_fail_sequential', extension });
    }
  }

  return { fileUri: uri, lyricsWarning };
}
