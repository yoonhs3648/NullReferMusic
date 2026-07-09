import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';

export type EspeakNgStatus = {
  installed: boolean;
  downloading: boolean;
  progress: number;
};

type NrmWhisperEspeakNative = {
  getEspeakNgStatus?: () => Promise<EspeakNgStatus>;
  startEspeakNgDownload?: () => Promise<{ started?: boolean }>;
  transliteratePlainLinesForEspeak?: (lines: string[]) => Promise<string[]>;
};

const mod = NativeModules.NrmWhisper as NrmWhisperEspeakNative | undefined;

export function isEspeakNgNativeAvailable(): boolean {
  return Platform.OS === 'android' && isStandaloneAndroid() && !!mod?.getEspeakNgStatus;
}

export async function fetchEspeakNgStatus(): Promise<EspeakNgStatus> {
  if (!isEspeakNgNativeAvailable() || !mod?.getEspeakNgStatus) {
    return { installed: false, downloading: false, progress: 0 };
  }
  try {
    const row = await mod.getEspeakNgStatus();
    return {
      installed: !!row.installed,
      downloading: !!row.downloading,
      progress: Math.min(100, Math.max(0, row.progress ?? 0)),
    };
  } catch {
    return { installed: false, downloading: false, progress: 0 };
  }
}

export async function isEspeakNgInstalled(): Promise<boolean> {
  const s = await fetchEspeakNgStatus();
  return s.installed && !s.downloading;
}

export async function startEspeakNgDownload(): Promise<boolean> {
  if (!isEspeakNgNativeAvailable() || !mod?.startEspeakNgDownload) return false;
  try {
    const result = await mod.startEspeakNgDownload();
    return result?.started !== false;
  } catch {
    return false;
  }
}

export async function transliteratePlainLinesForEspeak(lines: string[]): Promise<string[]> {
  if (!lines.length) return [];
  if (!isEspeakNgNativeAvailable() || !mod?.transliteratePlainLinesForEspeak) {
    return [...lines];
  }
  try {
    const out = await mod.transliteratePlainLinesForEspeak(lines);
    if (!Array.isArray(out) || out.length !== lines.length) return [...lines];
    return out.map((v, i) => (typeof v === 'string' && v.trim() ? v : lines[i]));
  } catch {
    return [...lines];
  }
}

export function subscribeEspeakNgDownloadEvents(
  onEvent: (payload: {
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
  }) => void,
): () => void {
  if (!isEspeakNgNativeAvailable() || !mod) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.NrmWhisper);
  const sub = emitter.addListener(
    'EspeakNgDownload',
    (body: { phase?: string; progress?: number }) => {
      const phase =
        body.phase === 'complete'
          ? 'complete'
          : body.phase === 'failed'
            ? 'failed'
            : 'progress';
      onEvent({
        phase,
        progress: Math.min(100, Math.max(0, body.progress ?? 0)),
      });
    },
  );
  return () => sub.remove();
}
