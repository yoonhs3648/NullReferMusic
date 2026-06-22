import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import {
  DEFAULT_ALIGN_MODEL_PREFERENCE,
  isNrmAlignModelId,
  isNrmAlignModelPackId,
  migrateAlignModelPreference,
  NRM_ALIGN_MODEL_OPTIONS,
  NRM_ALIGN_WAV2VEC2_BASE_ID,
  NRM_ALIGN_WAV2VEC2_EN_ID,
  NRM_ALIGN_WAV2VEC2_KO_ID,
  WAV2VEC2_PACK_IDS,
  type NrmAlignModelId,
  type NrmAlignModelPackId,
  alignModelLabel,
  alignPackLabel,
} from '@/lib/nrmAlignModelCatalog';
import type { MelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';
import {
  loadMelonSyncSettings,
  melonSyncSettingsToNativePayload,
} from '@/lib/nrmMelonSyncSettings';
import { resolveAlignModelForMelonSync } from '@/lib/nrmAlignLyricsLang';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

export type Wav2Vec2BundlePackProgress = {
  step: 1 | 2;
  koProgress: number;
  enProgress: number;
};

export type AlignModelStatusRow = {
  modelId: NrmAlignModelId;
  installed: boolean;
  downloading: boolean;
  progress: number;
  bundlePackProgress?: Wav2Vec2BundlePackProgress;
};

type NativeAlignStatus = {
  modelId: string;
  installed?: boolean;
  downloading?: boolean;
  progress?: number;
};

type NrmWhisperNative = {
  getAlignModelStatuses?: () => Promise<NativeAlignStatus[]>;
  isAlignModelInstalled?: (modelId: string) => Promise<boolean>;
  isAnyAlignModelInstalled?: () => Promise<boolean>;
  startAlignModelDownload?: (modelId: string) => Promise<{ started?: boolean }>;
  alignMelonLyricsToLrc?: (
    audioPath: string,
    lyricsPlain: string,
    mode: 'melon' | 'melon_translation',
    alignModelPreference: string,
    syncOptions?: Record<string, string | boolean>,
  ) => Promise<{ lrc?: string; alignFailed?: boolean; alignMemoryInsufficient?: boolean }>;
};

const mod = NativeModules.NrmWhisper as NrmWhisperNative | undefined;

function usesAlignBackendBridge(): boolean {
  return usesPcBackendInDev() && !(Platform.OS === 'android' && !!mod?.getAlignModelStatuses);
}

function packProgressFromRows(
  byId: Map<string, NativeAlignStatus>,
): Wav2Vec2BundlePackProgress | undefined {
  const ko = byId.get(NRM_ALIGN_WAV2VEC2_KO_ID);
  const en = byId.get(NRM_ALIGN_WAV2VEC2_EN_ID);
  const koInstalled = !!ko?.installed && !ko?.downloading;
  const enInstalled = !!en?.installed && !en?.downloading;
  const koDownloading = !!ko?.downloading;
  const enDownloading = !!en?.downloading;
  if (!koDownloading && !enDownloading && koInstalled && enInstalled) {
    return { step: 2, koProgress: 100, enProgress: 100 };
  }
  if (!koDownloading && !enDownloading) return undefined;
  const step: 1 | 2 = koDownloading || !koInstalled ? 1 : 2;
  return {
    step,
    koProgress: koInstalled ? 100 : Math.min(100, Math.max(0, ko?.progress ?? 0)),
    enProgress: enInstalled ? 100 : Math.min(100, Math.max(0, en?.progress ?? 0)),
  };
}

export function isAlignModelNativeAvailable(): boolean {
  if (Platform.OS === 'android' && !!mod?.getAlignModelStatuses) return true;
  return usesPcBackendInDev();
}

export async function fetchAlignModelStatuses(): Promise<AlignModelStatusRow[]> {
  if (usesAlignBackendBridge()) {
    const { fetchAlignModelStatusesFromBackend } = await import('@/lib/nrmAlignModelBackend');
    return fetchAlignModelStatusesFromBackend();
  }
  if (!isAlignModelNativeAvailable() || !mod?.getAlignModelStatuses) {
    return [];
  }
  const rows = await mod.getAlignModelStatuses();
  const byId = new Map(rows.map((r) => [r.modelId, r]));

  return NRM_ALIGN_MODEL_OPTIONS.map((opt) => {
    if (opt.id === NRM_ALIGN_WAV2VEC2_BASE_ID) {
      const ko = byId.get(NRM_ALIGN_WAV2VEC2_KO_ID);
      const en = byId.get(NRM_ALIGN_WAV2VEC2_EN_ID);
      const koOk = !!ko?.installed && !ko?.downloading;
      const enOk = !!en?.installed && !en?.downloading;
      const downloading = !!ko?.downloading || !!en?.downloading;
      return {
        modelId: opt.id,
        installed: koOk && enOk,
        downloading,
        progress: 0,
        bundlePackProgress: packProgressFromRows(byId),
      };
    }
    const row = byId.get(opt.id);
    const downloading = !!row?.downloading;
    const installed = !!row?.installed && !downloading;
    return {
      modelId: opt.id,
      installed,
      downloading,
      progress: Math.min(100, Math.max(0, row?.progress ?? (installed ? 100 : 0))),
    };
  });
}

async function isPackInstalled(packId: NrmAlignModelPackId): Promise<boolean> {
  if (!isAlignModelNativeAvailable() || !mod?.isAlignModelInstalled) return false;
  return mod.isAlignModelInstalled(packId);
}

export async function isAlignModelInstalled(modelId: NrmAlignModelId): Promise<boolean> {
  if (usesAlignBackendBridge()) {
    const { isAlignModelInstalledOnBackend } = await import('@/lib/nrmAlignModelBackend');
    return isAlignModelInstalledOnBackend(modelId);
  }
  if (!isAlignModelNativeAvailable()) return false;
  if (modelId === NRM_ALIGN_WAV2VEC2_BASE_ID) {
    const [ko, en] = await Promise.all([
      isPackInstalled(NRM_ALIGN_WAV2VEC2_KO_ID),
      isPackInstalled(NRM_ALIGN_WAV2VEC2_EN_ID),
    ]);
    return ko && en;
  }
  if (mod?.isAlignModelInstalled) {
    return mod.isAlignModelInstalled(modelId);
  }
  const rows = await fetchAlignModelStatuses();
  const row = rows.find((r) => r.modelId === modelId);
  return !!row?.installed && !row.downloading;
}

export async function isAnyAlignModelInstalled(): Promise<boolean> {
  if (usesAlignBackendBridge()) {
    const { isAnyAlignModelInstalledOnBackend } = await import('@/lib/nrmAlignModelBackend');
    return isAnyAlignModelInstalledOnBackend();
  }
  if (!isAlignModelNativeAvailable()) return false;
  if (mod?.isAnyAlignModelInstalled) {
    return mod.isAnyAlignModelInstalled();
  }
  const rows = await fetchAlignModelStatuses();
  return rows.some((r) => r.installed && !r.downloading);
}

function waitForPackDownload(packId: NrmAlignModelPackId): Promise<'complete' | 'failed'> {
  return new Promise((resolve) => {
    if (!isAlignModelNativeAvailable() || !mod) {
      resolve('failed');
      return;
    }
    const emitter = new NativeEventEmitter(NativeModules.NrmWhisper);
    const sub = emitter.addListener(
      'AlignModelDownload',
      (body: { modelId?: string; phase?: string }) => {
        if (body.modelId !== packId) return;
        if (body.phase === 'complete') {
          sub.remove();
          resolve('complete');
        } else if (body.phase === 'failed') {
          sub.remove();
          resolve('failed');
        }
      },
    );
  });
}

export async function startAlignModelDownload(modelId: NrmAlignModelId): Promise<boolean> {
  if (usesAlignBackendBridge()) {
    const { startAlignModelDownloadOnBackend } = await import('@/lib/nrmAlignModelBackend');
    return startAlignModelDownloadOnBackend(modelId);
  }
  if (!isAlignModelNativeAvailable() || !mod?.startAlignModelDownload) return false;
  if (!isNrmAlignModelId(modelId)) return false;
  try {
    if (modelId === NRM_ALIGN_WAV2VEC2_BASE_ID) {
      return await startWav2Vec2BundleDownload();
    }
    const result = await mod.startAlignModelDownload(modelId);
    return result?.started !== false;
  } catch {
    return false;
  }
}

/** wav2vec2-base — 한국어(1/2)·영어(2/2) 팩 순차 설치 */
export async function startWav2Vec2BundleDownload(): Promise<boolean> {
  if (!isAlignModelNativeAvailable() || !mod?.startAlignModelDownload) return false;
  for (const packId of WAV2VEC2_PACK_IDS) {
    if (await isPackInstalled(packId)) continue;
    try {
      const result = await mod.startAlignModelDownload(packId);
      if (result?.started === false) return false;
    } catch {
      return false;
    }
    const dlResult = await waitForPackDownload(packId);
    if (dlResult === 'failed') return false;
  }
  return true;
}

export function subscribeAlignModelDownloadEvents(
  onEvent: (payload: {
    modelId: NrmAlignModelId | NrmAlignModelPackId;
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
    bundlePackProgress?: Wav2Vec2BundlePackProgress;
  }) => void,
): () => void {
  if (usesAlignBackendBridge()) {
    let unsub: (() => void) | undefined;
    void import('@/lib/nrmAlignModelBackend').then(({ subscribeAlignModelDownloadEventsOnBackend }) => {
      unsub = subscribeAlignModelDownloadEventsOnBackend(onEvent);
    });
    return () => unsub?.();
  }
  if (!isAlignModelNativeAvailable() || !mod) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(NativeModules.NrmWhisper);
  const sub = emitter.addListener(
    'AlignModelDownload',
    async (body: { modelId?: string; phase?: string; progress?: number }) => {
      const packId = body.modelId ?? '';
      if (!isNrmAlignModelPackId(packId) && !isNrmAlignModelId(packId)) return;
      const phase =
        body.phase === 'complete'
          ? 'complete'
          : body.phase === 'failed'
            ? 'failed'
            : 'progress';
      const rows = await fetchAlignModelStatuses();
      const bundle = rows.find((r) => r.modelId === NRM_ALIGN_WAV2VEC2_BASE_ID);
      onEvent({
        modelId: isNrmAlignModelPackId(packId)
          ? packId
          : migrateAlignModelPreference(packId),
        phase,
        progress: Math.min(100, Math.max(0, body.progress ?? 0)),
        bundlePackProgress: bundle?.bundlePackProgress,
      });
    },
  );
  return () => sub.remove();
}

export type MelonAlignNativeResult = {
  lrc: string;
  alignFailed: boolean;
  alignMemoryInsufficient: boolean;
};

export async function alignMelonLyricsToLrcNative(
  audioPath: string,
  lyricsPlain: string,
  mode: 'melon' | 'melon_translation',
  alignModelPreference: NrmAlignModelId = DEFAULT_ALIGN_MODEL_PREFERENCE,
  lyricsLang: MelonAlignLyricsLanguage = 'ko',
): Promise<MelonAlignNativeResult> {
  const pref = resolveAlignModelForMelonSync(
    isNrmAlignModelId(alignModelPreference)
      ? alignModelPreference
      : DEFAULT_ALIGN_MODEL_PREFERENCE,
    lyricsLang,
  );
  if (usesAlignBackendBridge()) {
    const { alignMelonLyricsViaBackend } = await import('@/lib/nrmAlignModelBackend');
    return alignMelonLyricsViaBackend(audioPath, lyricsPlain, mode, pref, lyricsLang);
  }
  if (!mod?.alignMelonLyricsToLrc) {
    return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
  }
  const fsPath = audioPath.startsWith('file://') ? audioPath.slice(7) : audioPath;
  try {
    const syncSettings = await loadMelonSyncSettings();
    const syncOptions = melonSyncSettingsToNativePayload(syncSettings, lyricsLang);
    const result = await mod.alignMelonLyricsToLrc(
      fsPath,
      lyricsPlain,
      mode,
      pref,
      syncOptions,
    );
    const lrc = (result.lrc ?? '').trim();
    const alignMemoryInsufficient = !!result.alignMemoryInsufficient;
    return {
      lrc,
      alignFailed: alignMemoryInsufficient || !!result.alignFailed || !lrc,
      alignMemoryInsufficient,
    };
  } catch (e) {
    const { logNrmRunError } = await import('@/lib/nrmDevLog');
    logNrmRunError('forced-align.native', e, { mode, pref, audioPath: fsPath.slice(-120) });
    return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
  }
}

export function alignModelDownloadCompleteMessage(modelId: NrmAlignModelId): string {
  return `Forced Alignment(${alignModelLabel(modelId)}) 설치가 완료되었습니다.`;
}
