/**
 * APK: Whisper 전사는 네이티브 FIFO 큐가 있지만, JS에서도 한 번에 하나만
 * transcribeToLrc 를 호출해 큐 depth·캐시 WAV 중복·연속 발열 스로틀을 줄인다.
 */
let chain: Promise<unknown> = Promise.resolve();

export function runWhisperTranscribeSerial<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const { waitForDownloadsIdle } = await import('@/lib/nrmDownloadLyricsWorkGate');
    await waitForDownloadsIdle();
    const { logNrmDev } = await import('@/lib/nrmDevLog');
    logNrmDev('download.whisper', { event: 'serial_gate_start', label });
    try {
      return await fn();
    } finally {
      logNrmDev('download.whisper', { event: 'serial_gate_end', label });
    }
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}
