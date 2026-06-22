import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';
import { NRM_WHISPER_MODEL_IDS, getWhisperCatalogEntry } from '@/lib/nrmWhisperCatalog';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';

export type WhisperModelStatusRow = {
  modelId: NrmWhisperModelId;
  installed: boolean;
  downloading: boolean;
  progress: number;
};

type DownloadListener = (payload: {
  modelId: NrmWhisperModelId;
  phase: 'progress' | 'complete' | 'failed';
  progress: number;
}) => void;

const downloadListeners = new Set<DownloadListener>();
const lastSnapshot = new Map<string, { downloading: boolean; installed: boolean; progress: number }>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function encodeModelId(modelId: string): string {
  return encodeURIComponent(modelId);
}

export async function fetchWhisperModelStatusesFromBackend(): Promise<WhisperModelStatusRow[]> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return [];
  try {
    const res = await nrmBackendFetch(`${base}/api/whisper/models`);
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      modelId?: string;
      installed?: boolean;
      downloading?: boolean;
      progress?: number;
    }>;
    const byId = new Map(rows.map((r) => [r.modelId, r]));
    return NRM_WHISPER_MODEL_IDS.map((id) => {
      const row = byId.get(id);
      return {
        modelId: id,
        installed: !!row?.installed,
        downloading: !!row?.downloading,
        progress: Math.min(100, Math.max(0, row?.progress ?? (row?.installed ? 100 : 0))),
      };
    });
  } catch {
    return [];
  }
}

function emitDownloadEvents(rows: WhisperModelStatusRow[]): void {
  for (const row of rows) {
    const prev = lastSnapshot.get(row.modelId);
    if (row.downloading) {
      if (!prev?.downloading || row.progress !== prev.progress) {
        for (const fn of downloadListeners) {
          fn({ modelId: row.modelId, phase: 'progress', progress: row.progress });
        }
      }
    } else if (prev?.downloading) {
      const phase = row.installed ? 'complete' : 'failed';
      for (const fn of downloadListeners) {
        fn({
          modelId: row.modelId,
          phase,
          progress: row.installed ? 100 : 0,
        });
      }
    }
    lastSnapshot.set(row.modelId, {
      downloading: row.downloading,
      installed: row.installed,
      progress: row.progress,
    });
  }
}

async function pollDownloadProgress(): Promise<void> {
  const rows = await fetchWhisperModelStatusesFromBackend();
  emitDownloadEvents(rows);
}

function ensurePollLoop(): void {
  if (pollTimer != null) return;
  pollTimer = setInterval(() => {
    void pollDownloadProgress();
  }, 1000);
}

function stopPollLoopIfIdle(): void {
  if (downloadListeners.size > 0) return;
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function hasAnyWhisperModelOnBackend(): Promise<boolean> {
  const rows = await fetchWhisperModelStatusesFromBackend();
  return rows.some((r) => r.installed);
}

export async function isWhisperModelInstalledOnBackend(
  modelId: NrmWhisperModelId,
): Promise<boolean> {
  const rows = await fetchWhisperModelStatusesFromBackend();
  const row = rows.find((r) => r.modelId === modelId);
  return !!row?.installed && !row.downloading;
}

export async function startWhisperModelDownloadOnBackend(
  modelId: NrmWhisperModelId,
): Promise<void> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return;
  ensurePollLoop();
  lastSnapshot.set(modelId, { downloading: true, installed: false, progress: 0 });
  const res = await nrmBackendFetch(
    `${base}/api/whisper/models/${encodeModelId(modelId)}/download`,
    { method: 'POST' },
  );
  if (!res.ok) {
    lastSnapshot.set(modelId, { downloading: false, installed: false, progress: 0 });
    throw new Error(`download_start_failed_${res.status}`);
  }
  void pollDownloadProgress();
}

export function subscribeWhisperModelDownloadEventsOnBackend(onEvent: DownloadListener): () => void {
  downloadListeners.add(onEvent);
  ensurePollLoop();
  void pollDownloadProgress();
  return () => {
    downloadListeners.delete(onEvent);
    stopPollLoopIfIdle();
  };
}

export function whisperModelDownloadCompleteMessage(modelId: NrmWhisperModelId): string {
  const label = getWhisperCatalogEntry(modelId).label;
  return `Whisper 모델 "${label}" 다운로드가 완료되었습니다.`;
}
