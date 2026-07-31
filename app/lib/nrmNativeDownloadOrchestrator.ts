/**
 * APK 네이티브 다운로드 — 작업 큐 + innertube→yt-dlp 추출 + 오디오/가사 분리
 */
import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  metadataForAudioExtension,
  metadataNeedsPostProcess,
  normalizeDownloadMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { deleteLocalAudioTemps } from '@/lib/nrmDownloadCleanup';
import { reportNativeDownloadExtractFailure } from '@/lib/nrmDownloadFailureReport';
import {
  finalizeNativeAudioStage,
  finalizeNativeLyricsStage,
  type FinalizeParallelOptions,
  type FinalizeParallelResult,
  type NativeAudioStageResult,
} from '@/lib/nrmDownloadFinalize';
import {
  registerDownloadPipelineEnd,
  registerDownloadPipelineStart,
} from '@/lib/nrmDownloadLyricsWorkGate';
import {
  applyDownloadExtension,
  loadDownloadEncodeSettings,
} from '@/lib/nrmDownloadSettings';
import {
  enqueueAudioDownloadWork,
  enqueueLyricsDownloadWork,
} from '@/lib/nrmDownloadWorkQueue';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { extractYoutubeAudioOnDevice } from '@/lib/nrmInnertubeYoutube';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';

export type ScheduleNativeDownloadParams = {
  videoId: string;
  fileName: string;
  metadata?: NrmAudioFileMetadata;
  isAborted?: () => boolean;
  options?: FinalizeParallelOptions;
};

type LyricsWaiter = {
  promise: Promise<NativeAudioStageResult>;
  resolve: (value: NativeAudioStageResult) => void;
  reject: (reason: unknown) => void;
  options?: FinalizeParallelOptions;
};

const lyricsWaiters = new Map<string, LyricsWaiter>();

function createLyricsWaiter(
  videoId: string,
  options?: FinalizeParallelOptions,
): LyricsWaiter {
  let resolve!: (value: NativeAudioStageResult) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<NativeAudioStageResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const waiter: LyricsWaiter = { promise, resolve, reject, options };
  lyricsWaiters.set(videoId, waiter);
  return waiter;
}

/**
 * 추출·ffmpeg·저장(오디오)과 가사(+번역)를 각각 큐에 넣어 순서·선점 규칙을 적용한다.
 * 오디오 큐 작업을 먼저 등록·완료한 뒤 가사 큐에 넣는다 (가사 선등록 시 pump 데드락 방지).
 */
export function scheduleNativeDownloadJob(
  params: ScheduleNativeDownloadParams,
): Promise<FinalizeParallelResult> {
  if (Platform.OS === 'web') {
    return Promise.reject(new Error('scheduleNativeDownloadJob is native-only'));
  }

  const { videoId, fileName, metadata, isAborted = () => false, options } = params;

  return new Promise<FinalizeParallelResult>((resolve, reject) => {
    void (async () => {
      const encode = await loadDownloadEncodeSettings();
      const normalized = metadata
        ? metadataForAudioExtension(normalizeDownloadMetadata(metadata), encode.extension)
        : undefined;
      const postMeta = metadataNeedsPostProcess(normalized) ? normalized : undefined;
      const safeName = applyDownloadExtension(fileName, encode.extension);
      const displayLabel = displayLabelFromAudioFileName(safeName);
      const split = postMeta ? splitMetadataForDownloadStages(postMeta) : null;
      const needsLyrics = !!(split?.whisperMode ?? split?.melonMode);

      let lyricsWarning: FinalizeParallelResult['lyricsWarning'];
      let savedLabel = displayLabel;
      let lyricsDone: Promise<void> = Promise.resolve();
      const lyricsWaiter = needsLyrics ? createLyricsWaiter(videoId, options) : null;

      try {
        await enqueueAudioDownloadWork(
          videoId,
          displayLabel,
            async () => {
            if (isAborted()) {
              throw new Error('DOWNLOAD_ABORTED');
            }
            options?.onAudioDownloadStarted?.();
            registerDownloadPipelineStart(videoId);
            let pipelineEnded = false;
            const endPipeline = (reason: string) => {
              if (pipelineEnded) return;
              pipelineEnded = true;
              registerDownloadPipelineEnd(videoId, reason);
            };

            try {
              const { fileUri } = await extractYoutubeAudioOnDevice(videoId);
              if (isAborted()) {
                throw new Error('DOWNLOAD_ABORTED');
              }
              const audioStage = await finalizeNativeAudioStage(fileUri, fileName, postMeta, {
                youtubeVideoId: videoId,
                onAudioPersisted: (label) => {
                  savedLabel = label;
                  options?.onAudioPersisted?.(label);
                  endPipeline('audio_persisted');
                },
              });
              savedLabel = audioStage.savedLabel;

              if (lyricsWaiter) {
                lyricsWaiter.resolve(audioStage);
              } else {
                await deleteLocalAudioTemps(audioStage.temps);
              }
            } catch (e) {
              endPipeline('audio_fail');
              lyricsWaiter?.reject(e);
              const aborted = e instanceof Error && e.message === 'DOWNLOAD_ABORTED';
              if (!aborted && !isAborted()) {
                await reportNativeDownloadExtractFailure(videoId, displayLabel, e);
              }
              throw e;
            }
          },
          isAborted,
        );

        if (lyricsWaiter) {
          lyricsDone = enqueueLyricsDownloadWork(
            videoId,
            displayLabel,
            async () => {
              if (isAborted()) {
                lyricsWaiter.options?.onLyricsStageEnded?.(false);
                return;
              }
              try {
                const audioStage = await lyricsWaiter.promise;
                const out = await finalizeNativeLyricsStage(audioStage, {
                  onLyricsStageStarted: lyricsWaiter.options?.onLyricsStageStarted,
                  onLyricsStageEnded: lyricsWaiter.options?.onLyricsStageEnded,
                  onLyricsPersisted: lyricsWaiter.options?.onLyricsPersisted,
                  onLyricsStageFailed: lyricsWaiter.options?.onLyricsStageFailed,
                  melonLyricsPreloadOverride:
                    lyricsWaiter.options?.melonLyricsPreloadOverride,
                });
                lyricsWarning = out.lyricsWarning;
              } catch (e) {
                logNrmRunError('download.lyrics_queue', e, { videoId });
                throw e;
              } finally {
                lyricsWaiters.delete(videoId);
              }
            },
            isAborted,
          ).catch((e) => {
            lyricsWaiters.delete(videoId);
            logNrmRunError('download.lyrics_queue_outer', e, { videoId });
          });
        }

        await lyricsDone;
        resolve({ savedLabel, lyricsWarning });
      } catch (e) {
        reject(e);
      }
    })();
  });
}
