import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import type { NrmLibreTranslatePackageId } from '@/lib/nrmLibreTranslateCatalog';
import { NRM_LIBRETRANSLATE_PACKAGE_IDS } from '@/lib/nrmLibreTranslateCatalog';

export type LibreTranslatePackageStatusRow = {
  packageId: NrmLibreTranslatePackageId;
  installed: boolean;
  downloading: boolean;
  progress: number;
};

type NrmLibreTranslateNative = {
  getPackageStatuses?: () => Promise<
    Array<{
      packageId: string;
      installed?: boolean;
      downloading?: boolean;
      progress?: number;
    }>
  >;
  isOfflineReady?: () => Promise<boolean>;
  getEngineInfo?: () => Promise<{ ready?: boolean; computeType?: string }>;
  startPackageDownload?: (packageId: string) => Promise<{ started?: boolean }>;
  translateTexts?: (
    texts: string[],
  ) => Promise<{ texts: string[]; sourceLangs?: string[] }>;
};

const mod = NativeModules.NrmLibreTranslate as NrmLibreTranslateNative | undefined;

export function isLibreTranslateNativeAvailable(): boolean {
  return Platform.OS === 'android' && !!mod?.getPackageStatuses;
}

export async function fetchLibreTranslatePackageStatuses(): Promise<
  LibreTranslatePackageStatusRow[]
> {
  if (!isLibreTranslateNativeAvailable() || !mod?.getPackageStatuses) {
    return [];
  }
  const rows = await mod.getPackageStatuses();
  const byId = new Map(rows.map((r) => [r.packageId, r]));
  return NRM_LIBRETRANSLATE_PACKAGE_IDS.map((id) => {
    const row = byId.get(id);
    const downloading = !!row?.downloading;
    const installed = !!row?.installed && !downloading;
    return {
      packageId: id,
      installed,
      downloading,
      progress: Math.min(100, Math.max(0, row?.progress ?? (installed ? 100 : 0))),
    };
  });
}

export async function fetchLibreTranslateEngineInfo(): Promise<{
  ready: boolean;
  computeType: string | null;
}> {
  if (!isLibreTranslateNativeAvailable() || !mod?.getEngineInfo) {
    return { ready: false, computeType: null };
  }
  const info = await mod.getEngineInfo();
  return {
    ready: !!info?.ready,
    computeType: (info?.computeType ?? '').trim() || null,
  };
}

export async function isLibreTranslateOfflineReady(): Promise<boolean> {
  if (!isLibreTranslateNativeAvailable() || !mod?.isOfflineReady) {
    return false;
  }
  return mod.isOfflineReady();
}

export async function startLibreTranslatePackageDownload(
  packageId: NrmLibreTranslatePackageId,
): Promise<void> {
  if (!isLibreTranslateNativeAvailable() || !mod?.startPackageDownload) return;
  await mod.startPackageDownload(packageId);
}

export async function translateTextsViaLibreTranslateNative(
  texts: string[],
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  const native = mod;
  if (!native?.translateTexts) {
    throw new Error('NrmLibreTranslate.translateTexts unavailable');
  }
  const out = await native.translateTexts(texts);
  return {
    texts: Array.isArray(out.texts) ? out.texts.map((t) => String(t ?? '').trim()) : [],
    sourceLangs: Array.isArray(out.sourceLangs)
      ? out.sourceLangs.map((v) => String(v ?? '').trim().toUpperCase())
      : [],
  };
}

export function subscribeLibreTranslatePackageDownloadEvents(
  onEvent: (payload: {
    packageId: NrmLibreTranslatePackageId;
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
    attempt?: number;
    maxAttempts?: number;
    urlIndex?: number;
    urlCount?: number;
    step?: 'downloading' | 'installing';
  }) => void,
): () => void {
  if (!isLibreTranslateNativeAvailable() || !mod) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(NativeModules.NrmLibreTranslate);
  const sub = emitter.addListener(
    'LibreTranslatePackageDownload',
    (body: {
      packageId?: string;
      phase?: string;
      progress?: number;
      attempt?: number;
      maxAttempts?: number;
      urlIndex?: number;
      urlCount?: number;
      step?: string;
    }) => {
      const id = (body.packageId ?? '').trim();
      if (!id.startsWith('libretranslate:')) return;
      const phase =
        body.phase === 'complete'
          ? 'complete'
          : body.phase === 'failed'
            ? 'failed'
            : 'progress';
      onEvent({
        packageId: id as NrmLibreTranslatePackageId,
        phase,
        progress: Math.min(100, Math.max(0, body.progress ?? 0)),
        attempt: body.attempt,
        maxAttempts: body.maxAttempts,
        urlIndex: body.urlIndex,
        urlCount: body.urlCount,
        step: body.step === 'installing' ? 'installing' : 'downloading',
      });
    },
  );
  return () => sub.remove();
}

export { libreTranslatePackageCompleteMessage } from '@/lib/nrmLibreTranslateCatalog';
