import type { EnKoTransliteratorStatus } from '@/lib/nrmEnKoTransliteratorNative';

export function isEnKoTransliteratorNativeAvailable(): boolean {
  return false;
}

export async function fetchEnKoTransliteratorStatus(): Promise<EnKoTransliteratorStatus> {
  return { installed: false, downloading: false, progress: 0 };
}

export async function isEnKoTransliteratorInstalled(): Promise<boolean> {
  return false;
}

export async function probeEnKoTransliteratorForAlign(): Promise<boolean> {
  return false;
}

export async function startEnKoTransliteratorDownload(): Promise<boolean> {
  return false;
}

export async function transliteratePlainLinesForEnKo(lines: string[]): Promise<string[]> {
  return [...lines];
}

export function subscribeEnKoTransliteratorDownloadEvents(
  _onEvent: (payload: {
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
  }) => void,
): () => void {
  return () => {};
}
