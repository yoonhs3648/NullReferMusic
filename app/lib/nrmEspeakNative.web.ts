import type { EspeakNgStatus } from '@/lib/nrmEspeakNative';

export function isEspeakNgNativeAvailable(): boolean {
  return false;
}

export async function fetchEspeakNgStatus(): Promise<EspeakNgStatus> {
  return { installed: false, downloading: false, progress: 0 };
}

export async function isEspeakNgInstalled(): Promise<boolean> {
  return false;
}

export async function startEspeakNgDownload(): Promise<boolean> {
  return false;
}

export async function transliteratePlainLinesForEspeak(lines: string[]): Promise<string[]> {
  return [...lines];
}

export function subscribeEspeakNgDownloadEvents(
  _onEvent: (payload: {
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
  }) => void,
): () => void {
  return () => {};
}
