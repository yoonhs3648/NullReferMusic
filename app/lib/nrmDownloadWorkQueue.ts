/**
 * APK 다운로드 작업 큐 — 오디오 생성 vs 가사(+번역) 생성
 *
 * - 두 종류는 동시에 실행되지 않음
 * - audioQueue가 비어 있을 때만 lyricsQueue 처리
 * - 가사 1건 처리 후 audioQueue 재확인 → 선점(새 오디오 요청 시 나머지 가사 대기)
 */
import { logNrmDev } from '@/lib/nrmDevLog';

type QueueEntry = {
  id: string;
  label: string;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
  isAborted: () => boolean;
};

const audioQueue: QueueEntry[] = [];
const lyricsQueue: QueueEntry[] = [];
let pumpPromise: Promise<void> | null = null;

function logQueue(event: string, extra?: Record<string, unknown>): void {
  logNrmDev('download.queue', {
    event,
    audioPending: audioQueue.length,
    lyricsPending: lyricsQueue.length,
    ...extra,
  });
}

async function runEntry(entry: QueueEntry, lane: 'audio' | 'lyrics'): Promise<void> {
  if (entry.isAborted()) {
    entry.reject(new Error('DOWNLOAD_ABORTED'));
    return;
  }
  logQueue('job_start', { lane, id: entry.id, label: entry.label });
  try {
    await entry.run();
    entry.resolve();
    logQueue('job_ok', { lane, id: entry.id });
  } catch (e) {
    entry.reject(e);
    logQueue('job_fail', {
      lane,
      id: entry.id,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

async function pumpLoop(): Promise<void> {
  while (audioQueue.length > 0 || lyricsQueue.length > 0) {
    if (audioQueue.length > 0) {
      const entry = audioQueue.shift()!;
      await runEntry(entry, 'audio');
      continue;
    }
    if (lyricsQueue.length > 0) {
      const entry = lyricsQueue.shift()!;
      await runEntry(entry, 'lyrics');
    }
  }
}

function ensurePump(): Promise<void> {
  if (!pumpPromise) {
    pumpPromise = pumpLoop().finally(() => {
      pumpPromise = null;
      if (audioQueue.length > 0 || lyricsQueue.length > 0) {
        ensurePump();
      }
    });
  }
  return pumpPromise;
}

function enqueue(
  lane: 'audio' | 'lyrics',
  id: string,
  label: string,
  run: () => Promise<void>,
  isAborted: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const entry: QueueEntry = { id, label, run, resolve, reject, isAborted };
    if (lane === 'audio') audioQueue.push(entry);
    else lyricsQueue.push(entry);
    logQueue('enqueue', { lane, id, label });
    void ensurePump();
  });
}

/** 추출·ffmpeg·물리 저장까지 (곡당 1건) */
export function enqueueAudioDownloadWork(
  jobId: string,
  displayLabel: string,
  run: () => Promise<void>,
  isAborted: () => boolean = () => false,
): Promise<void> {
  return enqueue('audio', jobId, displayLabel, run, isAborted);
}

/** Whisper/Melon·번역·LRC 임베드/사이드카 (곡당 1건) */
export function enqueueLyricsDownloadWork(
  jobId: string,
  displayLabel: string,
  run: () => Promise<void>,
  isAborted: () => boolean = () => false,
): Promise<void> {
  return enqueue('lyrics', jobId, displayLabel, run, isAborted);
}

export function getDownloadWorkQueueDepth(): { audio: number; lyrics: number } {
  return { audio: audioQueue.length, lyrics: lyricsQueue.length };
}
