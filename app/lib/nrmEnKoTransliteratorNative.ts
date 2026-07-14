import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';

export type EnKoTransliteratorStatus = {
  installed: boolean;
  downloading: boolean;
  progress: number;
};

type NrmWhisperEnKoNative = {
  getEnKoTransliteratorStatus?: () => Promise<EnKoTransliteratorStatus>;
  startEnKoTransliteratorDownload?: () => Promise<{ started?: boolean }>;
  probeEnKoTransliteratorForAlign?: () => Promise<boolean>;
  transliteratePlainLinesForEnKo?: (lines: string[]) => Promise<string[]>;
};

const mod = NativeModules.NrmWhisper as NrmWhisperEnKoNative | undefined;

export function isEnKoTransliteratorNativeAvailable(): boolean {
  return (
    Platform.OS === 'android' &&
    isStandaloneAndroid() &&
    !!mod?.getEnKoTransliteratorStatus
  );
}

export async function fetchEnKoTransliteratorStatus(): Promise<EnKoTransliteratorStatus> {
  if (!isEnKoTransliteratorNativeAvailable() || !mod?.getEnKoTransliteratorStatus) {
    return { installed: false, downloading: false, progress: 0 };
  }
  try {
    const row = await mod.getEnKoTransliteratorStatus();
    return {
      installed: !!row.installed,
      downloading: !!row.downloading,
      progress: Math.min(100, Math.max(0, row.progress ?? 0)),
    };
  } catch {
    return { installed: false, downloading: false, progress: 0 };
  }
}

export async function isEnKoTransliteratorInstalled(): Promise<boolean> {
  const s = await fetchEnKoTransliteratorStatus();
  return s.installed && !s.downloading;
}

/** FA 전처리 직전 — EN→KO transliterator 프로브 (실패 시 원문 FA) */
export async function probeEnKoTransliteratorForAlign(): Promise<boolean> {
  if (!isEnKoTransliteratorNativeAvailable() || !mod?.probeEnKoTransliteratorForAlign) {
    return false;
  }
  try {
    return !!(await mod.probeEnKoTransliteratorForAlign());
  } catch {
    return false;
  }
}

export async function startEnKoTransliteratorDownload(): Promise<boolean> {
  if (!isEnKoTransliteratorNativeAvailable() || !mod?.startEnKoTransliteratorDownload) {
    return false;
  }
  try {
    const result = await mod.startEnKoTransliteratorDownload();
    return result?.started !== false;
  } catch {
    return false;
  }
}

export async function transliteratePlainLinesForEnKo(lines: string[]): Promise<string[]> {
  if (!lines.length) return [];
  if (!isEnKoTransliteratorNativeAvailable() || !mod?.transliteratePlainLinesForEnKo) {
    return [...lines];
  }
  try {
    const out = await mod.transliteratePlainLinesForEnKo(lines);
    if (!Array.isArray(out) || out.length !== lines.length) return [...lines];
    return out.map((v, i) => (typeof v === 'string' && v.trim() ? v : lines[i]));
  } catch {
    return [...lines];
  }
}

export function subscribeEnKoTransliteratorDownloadEvents(
  onEvent: (payload: {
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
  }) => void,
): () => void {
  if (!isEnKoTransliteratorNativeAvailable() || !mod) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.NrmWhisper);
  const sub = emitter.addListener(
    'EnKoTransliteratorDownload',
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
