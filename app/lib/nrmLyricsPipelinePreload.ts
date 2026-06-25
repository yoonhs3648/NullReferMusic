import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmAlignModelId } from '@/lib/nrmAlignModelCatalog';
import type { NrmMelonSyncSettings } from '@/lib/nrmMelonSyncSettings';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';

export type LyricsPipelinePreloadBundle = {
  serialGate: typeof import('@/lib/nrmWhisperSerialGate');
  melonStage?: typeof import('@/lib/nrmMelonLyricsLrcStage');
  alignModelPreference?: NrmAlignModelId;
  translationClient?: typeof import('@/lib/nrmTranslationClient');
  melonSyncSettings?: NrmMelonSyncSettings;
};

const inflight = new Map<string, Promise<LyricsPipelinePreloadBundle>>();

function preloadKey(metadata: NrmAudioFileMetadata): string | null {
  const { whisperMode, melonMode } = splitMetadataForDownloadStages(metadata);
  if (!whisperMode && !melonMode) return null;
  return `${whisperMode ?? ''}:${melonMode ?? ''}`;
}

/**
 * innertube 추출·ffmpeg 변환과 겹쳐 가사 파이프라인 모듈·설정을 미리 로드합니다.
 * 동일 모드로 중복 호출해도 한 번만 실행됩니다.
 */
export function startLyricsPipelinePreload(
  metadata: NrmAudioFileMetadata | undefined,
): Promise<LyricsPipelinePreloadBundle> | null {
  if (!metadata) return null;
  const key = preloadKey(metadata);
  if (!key) return null;

  const existing = inflight.get(key);
  if (existing) return existing;

  const { whisperMode, melonMode } = splitMetadataForDownloadStages(metadata);
  const needsTranslation =
    whisperMode === 'translation' || melonMode === 'melon_translation';

  const task = (async (): Promise<LyricsPipelinePreloadBundle> => {
    const [serialGate, melonStage, settingsMod, translationClient, melonSyncSettings] =
      await Promise.all([
        import('@/lib/nrmWhisperSerialGate'),
        melonMode ? import('@/lib/nrmMelonLyricsLrcStage') : Promise.resolve(undefined),
        import('@/lib/nrmDownloadSettings'),
        needsTranslation ? import('@/lib/nrmTranslationClient') : Promise.resolve(undefined),
        melonMode
          ? import('@/lib/nrmMelonSyncSettings').then((m) => m.loadMelonSyncSettings())
          : Promise.resolve(undefined),
      ]);

    const alignModelPreference = melonMode
      ? await settingsMod.loadAlignModelPreference()
      : undefined;

    if (melonMode) {
      void import('@/lib/nrmAlignModelNative');
    }

    return {
      serialGate,
      melonStage,
      alignModelPreference,
      translationClient,
      melonSyncSettings,
    };
  })();

  inflight.set(key, task);
  void task.finally(() => {
    setTimeout(() => {
      if (inflight.get(key) === task) inflight.delete(key);
    }, 5 * 60 * 1000);
  });
  return task;
}

export async function awaitLyricsPipelinePreload(
  metadata: NrmAudioFileMetadata | undefined,
): Promise<LyricsPipelinePreloadBundle | null> {
  const started = startLyricsPipelinePreload(metadata);
  if (!started) return null;
  try {
    return await started;
  } catch {
    return null;
  }
}
