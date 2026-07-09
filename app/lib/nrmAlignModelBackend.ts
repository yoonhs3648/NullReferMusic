import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  NRM_ALIGN_MODEL_OPTIONS,
  NRM_ALIGN_WAV2VEC2_BASE_ID,
  NRM_ALIGN_WAV2VEC2_EN_ID,
  NRM_ALIGN_WAV2VEC2_KO_ID,
  WAV2VEC2_PACK_IDS,
  alignModelLabel,
  isNrmAlignModelId,
  isNrmAlignModelPackId,
  migrateAlignModelPreference,
  type NrmAlignModelId,
  type NrmAlignModelPackId,
} from '@/lib/nrmAlignModelCatalog';
import type { MelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';
import {
  loadMelonSyncSettings,
  melonSyncSettingsToNativePayload,
} from '@/lib/nrmMelonSyncSettings';
import { resolveAlignModelForMelonSync } from '@/lib/nrmAlignLyricsLang';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';

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

export type MelonAlignNativeResult = {
  lrc: string;
  alignFailed: boolean;
  alignMemoryInsufficient: boolean;
};

type NativeAlignStatus = {
  modelId: string;
  installed?: boolean;
  downloading?: boolean;
  progress?: number;
};

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

export async function fetchAlignModelStatusesFromBackend(): Promise<AlignModelStatusRow[]> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return [];
  try {
    const res = await nrmBackendFetch(`${base}/api/align/models`);
    if (!res.ok) return [];
    const rows = (await res.json()) as NativeAlignStatus[];
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
  } catch {
    return [];
  }
}

export async function isAlignModelInstalledOnBackend(modelId: NrmAlignModelId): Promise<boolean> {
  const rows = await fetchAlignModelStatusesFromBackend();
  const row = rows.find((r) => r.modelId === modelId);
  return !!row?.installed && !row.downloading;
}

export async function isAnyAlignModelInstalledOnBackend(): Promise<boolean> {
  const rows = await fetchAlignModelStatusesFromBackend();
  return rows.some((r) => r.installed && !r.downloading);
}

export async function startAlignModelDownloadOnBackend(_modelId: NrmAlignModelId): Promise<boolean> {
  // PC: aeneas는 내장, wav2vec2는 library 폴더 수동 설치
  return false;
}

/** 웹/PC dev: wav2vec2 팩은 수동 설치 */
export async function startWav2Vec2BundleDownloadOnBackend(): Promise<boolean> {
  return false;
}

export function alignModelDownloadCompleteMessage(modelId: NrmAlignModelId): string {
  return `Forced Alignment(${alignModelLabel(modelId)}) 설치가 완료되었습니다.`;
}

export function subscribeAlignModelDownloadEventsOnBackend(
  _onEvent: (payload: {
    modelId: NrmAlignModelId | NrmAlignModelPackId;
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
    bundlePackProgress?: Wav2Vec2BundlePackProgress;
  }) => void,
): () => void {
  return () => {};
}

async function readFileBlob(fileUri: string, fileName: string): Promise<Blob> {
  if (typeof document !== 'undefined' && fileUri.startsWith('blob:')) {
    const res = await fetch(fileUri);
    return res.blob();
  }
  if (typeof document !== 'undefined' && fileUri.startsWith('nrm-web-track:')) {
    const { readWebTrackBlob } = await import('@/lib/nrmWebDownloadTrackCatalog');
    const blob = await readWebTrackBlob(fileUri);
    if (!blob) throw new Error('web_track_blob_missing');
    return blob;
  }
  const FileSystem = await import('expo-file-system/src/legacy/FileSystem');
  const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

export async function alignMelonLyricsViaBackend(
  audioPath: string,
  lyricsPlain: string,
  mode: 'melon' | 'melon_translation',
  alignModelPreference: string,
  lyricsLang: MelonAlignLyricsLanguage,
  fileName = 'audio.mp3',
): Promise<MelonAlignNativeResult> {
  void alignModelPreference;
  void lyricsLang;
  const base = await getResolvedApiBaseUrl();
  if (!base) {
    return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
  }
  try {
    const blob = await readFileBlob(
      audioPath.startsWith('file://') ? audioPath : audioPath,
      fileName,
    );
    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('lyricsPlain', lyricsPlain);
    form.append('mode', mode);
    const syncSettings = await loadMelonSyncSettings();
    const syncOptions = melonSyncSettingsToNativePayload(syncSettings, lyricsLang, alignModelPreference);
    void syncOptions;
    const res = await nrmBackendFetch(`${base}/api/align/melon`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
    }
    const body = (await res.json()) as {
      lrcText?: string;
      alignFailed?: boolean;
      alignMemoryInsufficient?: boolean;
    };
    const lrc = (body.lrcText ?? '').trim();
    return {
      lrc,
      alignFailed: !!body.alignFailed || !lrc,
      alignMemoryInsufficient: !!body.alignMemoryInsufficient,
    };
  } catch {
    return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
  }
}

export async function alignMelonJobViaBackend(
  jobId: string,
  metadata: Record<string, unknown>,
): Promise<{ lrcText?: string; alignFailed?: boolean }> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return { alignFailed: true };
  const res = await nrmBackendFetch(`${base}/api/download/melon-align`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ...metadata }),
  });
  if (!res.ok) return { alignFailed: true };
  const body = (await res.json()) as { lrcText?: string; lyricsEmbedded?: boolean };
  return { lrcText: body.lrcText, alignFailed: !body.lrcText?.trim() };
}

export { isNrmAlignModelId, isNrmAlignModelPackId, migrateAlignModelPreference, WAV2VEC2_PACK_IDS };
