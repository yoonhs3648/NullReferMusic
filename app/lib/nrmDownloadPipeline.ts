import { Platform } from 'react-native';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { requestDownload } from '@/lib/downloadClient';
import {
  hasEmbeddableAudioMetadata,
  metadataForAudioExtension,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { persistAudioAfterServerJob } from '@/lib/nrmPersistServerDownload';
import {
  applyDownloadExtension,
  extensionToYtDlpFormat,
  loadDownloadEncodeSettings,
} from '@/lib/nrmDownloadSettings';
import { parseWhisperLyricsMode } from '@/lib/nrmWhisperLyrics';

export type AudioExtractionResult =
  | { kind: 'server'; fileUri?: string; jobId: string }
  | { kind: 'native'; fileUri: string };

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

export type FinalizeAudioDownloadOptions = {
  /** reserved for future options */
};

/**
 * 추출이 끝난 뒤 사용자가 확정한 메타데이터로 ffmpeg 적용·저장합니다.
 */
export async function finalizeAudioDownload(
  extraction: AudioExtractionResult,
  fileName: string,
  metadata?: NrmAudioFileMetadata,
  options?: FinalizeAudioDownloadOptions,
): Promise<{ savedLabel: string; lyricsWarning?: 'not_embedded' | 'translation_failed' }> {
  const encode = await loadDownloadEncodeSettings();
  const safeName = applyDownloadExtension(fileName, encode.extension);
  const normalized = metadata
    ? metadataForAudioExtension(normalizeDownloadMetadata(metadata), encode.extension)
    : undefined;
  let embedMetadata =
    normalized && hasEmbeddableAudioMetadata(normalized) ? normalized : undefined;
  let lyricsWarning: 'not_embedded' | 'translation_failed' | undefined;

  if (extraction.kind === 'server') {
    if (embedMetadata) {
      const { applyServerJobMetadata } = await import('@/lib/nrmApplyAudioMetadata.web');
      const needsTranslation = parseWhisperLyricsMode(embedMetadata.lyrics) === 'translation';
      const needsWhisperLyrics = parseWhisperLyricsMode(embedMetadata.lyrics) != null;
      const deeplApiKey = needsTranslation
        ? await (await import('@/lib/nrmDeepLApiSettings')).getDeepLApiKey()
        : '';
      const whisperModelPreference = needsWhisperLyrics
        ? await (await import('@/lib/nrmDownloadSettings')).loadWhisperModelPreference()
        : undefined;
      try {
        const applied = await applyServerJobMetadata(extraction.jobId, embedMetadata, {
          deeplApiKey,
          whisperModelPreference,
        });
        if (applied.lyricsRequested && !applied.lyricsEmbedded) {
          lyricsWarning = 'not_embedded';
        }
        if (applied.lyricsTranslationFailed) {
          lyricsWarning = 'translation_failed';
        }
      } catch (err) {
        if (needsWhisperLyrics) {
          // Whisper/translation 실패 시 오디오는 그대로 저장하고 가사만 포기한다.
          lyricsWarning = 'not_embedded';
        } else {
          throw err;
        }
      }
    }

    const apiBase = await getResolvedApiBaseUrl();
    const out = await persistAudioAfterServerJob(apiBase, extraction.jobId, { fileName: safeName });
    return { ...out, lyricsWarning };
  }

  const { finalizeYoutubeAudioOnDevice } = await import('@/lib/nrmInnertubeYoutube');
  const out = await finalizeYoutubeAudioOnDevice(
    extraction.fileUri,
    safeName,
    embedMetadata,
  );
  return { ...out, lyricsWarning: out.lyricsWarning ?? lyricsWarning };
}
