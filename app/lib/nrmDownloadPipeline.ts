import { Platform } from 'react-native';

import { requestDownload } from '@/lib/downloadClient';
import {
  metadataForAudioExtension,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { metadataNeedsPostProcess } from '@/lib/nrmDownloadAudioMetadata';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  applyDownloadExtension,
  extensionToYtDlpFormat,
  loadDownloadEncodeSettings,
} from '@/lib/nrmDownloadSettings';

export type AudioExtractionResult =
  | { kind: 'server'; fileUri?: string; jobId: string }
  | { kind: 'native'; fileUri: string };

export { cleanupAudioExtraction, cleanupServerExtraction } from '@/lib/nrmDownloadCleanup';
export {
  finalizeAudioDownloadParallel,
  type FinalizeParallelOptions,
  type FinalizeParallelResult,
} from '@/lib/nrmDownloadFinalize';

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * yt-dlp(서버 또는 Android) / innertube(iOS·폴백)로 오디오만 추출합니다.
 * 메타데이터(ffmpeg)는 포함하지 않습니다.
 */
export async function startAudioExtraction(
  videoId: string,
): Promise<AudioExtractionResult> {
  if (Platform.OS !== 'web' && !usesPcBackendInDev()) {
    const { extractYoutubeAudioOnDevice } = await import('@/lib/nrmInnertubeYoutube');
    const { fileUri } = await extractYoutubeAudioOnDevice(videoId);
    return { kind: 'native', fileUri };
  }

  const encode = await loadDownloadEncodeSettings();
  const res = await requestDownload(youtubeWatchUrl(videoId), {
    noPlaylist: true,
    audioFormat: extensionToYtDlpFormat(encode.extension),
    audioQuality: encode.audioQuality,
  });
  const jobId = res.jobId;
  if (!jobId || typeof jobId !== 'string') {
    throw new Error('서버 응답에 jobId가 없어 파일을 받을 수 없습니다.');
  }
  return { kind: 'server', jobId };
}

export type FinalizeAudioDownloadOptions = import('@/lib/nrmDownloadFinalize').FinalizeParallelOptions;

/**
 * 추출 완료 후 ffmpeg·Whisper 병렬 후처리·저장.
 * @deprecated 이름 호환 — finalizeAudioDownloadParallel 과 동일
 */
export async function finalizeAudioDownload(
  extraction: AudioExtractionResult,
  fileName: string,
  metadata?: NrmAudioFileMetadata,
  options?: FinalizeAudioDownloadOptions,
): Promise<{
  savedLabel: string;
  lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted';
}> {
  const encode = await loadDownloadEncodeSettings();
  const normalized = metadata
    ? metadataForAudioExtension(normalizeDownloadMetadata(metadata), encode.extension)
    : undefined;
  const postMeta = metadataNeedsPostProcess(normalized) ? normalized : undefined;

  const { finalizeAudioDownloadParallel } = await import('@/lib/nrmDownloadFinalize');
  return finalizeAudioDownloadParallel(extraction, fileName, postMeta, options);
}
