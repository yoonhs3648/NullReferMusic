import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';
import { getWhisperCatalogEntry } from '@/lib/nrmWhisperCatalog';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

export type WhisperModelStatusRow = {
  modelId: NrmWhisperModelId;
  installed: boolean;
  downloading: boolean;
  progress: number;
};

type NrmWhisperNative = {
  getModelStatuses?: () => Promise<
    Array<{
      modelId: string;
      installed?: boolean;
      downloading?: boolean;
      progress?: number;
    }>
  >;
  hasAnyModelInstalled?: () => Promise<boolean>;
  startModelDownload?: (modelId: string) => Promise<{ started?: boolean }>;
};

const mod = NativeModules.NrmWhisper as NrmWhisperNative | undefined;

function usesWhisperBackendBridge(): boolean {
  return usesPcBackendInDev() && !(Platform.OS === 'android' && !!mod?.getModelStatuses);
}

export function isWhisperModelNativeAvailable(): boolean {
  if (Platform.OS === 'android' && !!mod?.getModelStatuses) return true;
  return usesPcBackendInDev();
}

export async function fetchWhisperModelStatuses(): Promise<WhisperModelStatusRow[]> {
  if (usesWhisperBackendBridge()) {
    const { fetchWhisperModelStatusesFromBackend } = await import('@/lib/nrmWhisperModelBackend');
    return fetchWhisperModelStatusesFromBackend();
  }
  if (!isWhisperModelNativeAvailable() || !mod?.getModelStatuses) {
    return [];
  }
  const rows = await mod.getModelStatuses();
  const { NRM_WHISPER_MODEL_IDS } = await import('@/lib/nrmWhisperCatalog');
  const byId = new Map(rows.map((r) => [r.modelId, r]));
  return NRM_WHISPER_MODEL_IDS.map((id) => {
    const row = byId.get(id);
    const downloading = !!row?.downloading;
    const installed = !!row?.installed && !downloading;
    return {
      modelId: id,
      installed,
      downloading,
      progress: Math.min(100, Math.max(0, row?.progress ?? (installed ? 100 : 0))),
    };
  });
}

export async function hasAnyWhisperModelOnDevice(): Promise<boolean> {
  if (usesWhisperBackendBridge()) {
    const { hasAnyWhisperModelOnBackend } = await import('@/lib/nrmWhisperModelBackend');
    return hasAnyWhisperModelOnBackend();
  }
  if (!isWhisperModelNativeAvailable() || !mod?.hasAnyModelInstalled) {
    return false;
  }
  return mod.hasAnyModelInstalled();
}

export async function isWhisperModelInstalled(modelId: NrmWhisperModelId): Promise<boolean> {
  if (usesWhisperBackendBridge()) {
    const { isWhisperModelInstalledOnBackend } = await import('@/lib/nrmWhisperModelBackend');
    return isWhisperModelInstalledOnBackend(modelId);
  }
  if (!isWhisperModelNativeAvailable()) {
    return false;
  }
  const rows = await fetchWhisperModelStatuses();
  const row = rows.find((r) => r.modelId === modelId);
  return !!row?.installed && !row.downloading;
}

export async function startWhisperModelDownloadOnDevice(
  modelId: NrmWhisperModelId,
): Promise<void> {
  if (usesWhisperBackendBridge()) {
    const { startWhisperModelDownloadOnBackend } = await import('@/lib/nrmWhisperModelBackend');
    await startWhisperModelDownloadOnBackend(modelId);
    return;
  }
  if (!isWhisperModelNativeAvailable() || !mod?.startModelDownload) return;
  await mod.startModelDownload(modelId);
}

export function subscribeWhisperModelDownloadEvents(
  onEvent: (payload: {
    modelId: NrmWhisperModelId;
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
  }) => void,
): () => void {
  if (usesWhisperBackendBridge()) {
    let unsub: (() => void) | undefined;
    void import('@/lib/nrmWhisperModelBackend').then(
      ({ subscribeWhisperModelDownloadEventsOnBackend }) => {
        unsub = subscribeWhisperModelDownloadEventsOnBackend(onEvent);
      },
    );
    return () => unsub?.();
  }
  if (!isWhisperModelNativeAvailable() || !mod) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(NativeModules.NrmWhisper);
  const sub = emitter.addListener(
    'WhisperModelDownload',
    (body: { modelId?: string; phase?: string; progress?: number }) => {
      const id = (body.modelId ?? '').trim();
      if (!id.startsWith('whisper:')) return;
      const phase =
        body.phase === 'complete'
          ? 'complete'
          : body.phase === 'failed'
            ? 'failed'
            : 'progress';
      onEvent({
        modelId: id as NrmWhisperModelId,
        phase,
        progress: Math.min(100, Math.max(0, body.progress ?? 0)),
      });
    },
  );
  return () => sub.remove();
}

export function whisperModelDownloadCompleteMessage(modelId: NrmWhisperModelId): string {
  const label = getWhisperCatalogEntry(modelId).label;
  return `Whisper 모델 "${label}" 다운로드가 완료되었습니다.`;
}
