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
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import { runWhisperLrcStage, type WhisperLrcStageResult } from '@/lib/nrmWhisperLrcStage';

export type PostProcessAudioResult = {
  fileUri: string;
  lyricsWarning?: 'not_embedded' | 'translation_failed';
};

/** Android: 확장자 변환만 (메타·Whisper 전에 호출해 실제 확장자 확정) */
export async function applyFfmpegTranscodeStage(fileUri: string): Promise<string> {
  let uri = fileUri;
  if (Platform.OS !== 'android') return uri;

  const { isOnDeviceDownloadAvailable, transcodeAudioOnDevice } =
    await import('@/lib/onDeviceDownload');
  if (!isOnDeviceDownloadAvailable()) return uri;

  const { loadDownloadEncodeSettings, extensionToYtDlpFormat } =
    await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();
  const path = uri.startsWith('file://') ? uri.slice(7) : uri;
  const wantExt = encode.extension.slice(1).toLowerCase();
  const haveExt = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (haveExt === wantExt) return uri;

  const { path: outPath, format, fallbackReason } = await transcodeAudioOnDevice(
    path,
    extensionToYtDlpFormat(encode.extension),
    encode.audioQuality,
  );
  if (fallbackReason) {
    const { logNrmDev } = await import('@/lib/nrmDevLog');
    logNrmDev('download.transcode.fallback', {
      reason: fallbackReason,
      requested: wantExt,
      effective: format ?? 'unknown',
    });
  }
  uri = outPath.startsWith('file://') ? outPath : `file://${outPath}`;
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

  try {
    const { applyAudioFileMetadata } = await import('@/lib/nrmApplyAudioMetadata');
    return await applyAudioFileMetadata(fileUri, normalized);
  } catch (e) {
    logNrmRunError('download.metadata.ffmpeg', e, {
      artist: normalized.artist,
      title: normalized.title,
    });
    try {
      const { applyAudioFileMetadata: retryApply } = await import('@/lib/nrmApplyAudioMetadata');
      return await retryApply(fileUri, normalized);
    } catch (retryErr) {
      logNrmRunError('download.metadata.ffmpeg.retry', retryErr, {});
      return fileUri;
    }
  }
}

function whisperWarningFromResult(
  result: WhisperLrcStageResult,
): 'not_embedded' | 'translation_failed' | undefined {
  if (result.lyricsTranslationFailed) return 'translation_failed';
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
  const whisperMode = metadata
    ? splitMetadataForDownloadStages(metadata).whisperMode
    : null;

  uri = await applyFfmpegMetadataStage(uri, metadata);

  let lyricsWarning: 'not_embedded' | 'translation_failed' | undefined;
  if (whisperMode) {
    const whisperResult = await runWhisperLrcStage(uri, whisperMode, extension);
    lyricsWarning = whisperWarningFromResult(whisperResult);
  }

  return { fileUri: uri, lyricsWarning };
}
