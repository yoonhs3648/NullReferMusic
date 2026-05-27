import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { HealthResponse, DownloadResponse } from '@/lib/downloadTypes';
import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';

export async function fetchHealth(): Promise<HealthResponse> {
  const base = await getResolvedApiBaseUrl();
  const res = await nrmBackendFetch(`${base}/api/health`);
  const data = (await res.json().catch(() => ({}))) as HealthResponse;
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return data;
}

function metadataPayload(meta: NrmAudioFileMetadata): Record<string, string> {
  const body: Record<string, string> = {
    artist: meta.artist,
    title: meta.title,
    album: meta.album,
    genre: meta.genre,
    releaseDate: meta.releaseDate,
    coverUrl: meta.coverUrl,
  };
  const opt = [
    'albumArtist',
    'trackNumber',
    'discNumber',
    'composer',
    'lyrics',
    'bpm',
    'copyright',
    'website',
    'producer',
    'remixer',
  ] as const;
  for (const k of opt) {
    const v = meta[k];
    if (v?.trim()) body[k] = v.trim();
  }
  return body;
}

export async function requestDownload(
  url: string,
  options?: {
    noPlaylist?: boolean;
    audioFormat?: string;
    audioQuality?: number;
    metadata?: NrmAudioFileMetadata;
  },
): Promise<DownloadResponse> {
  const base = await getResolvedApiBaseUrl();
  const res = await nrmBackendFetch(`${base}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: url.trim(),
      noPlaylist: options?.noPlaylist ?? true,
      audioFormat: options?.audioFormat,
      audioQuality: options?.audioQuality,
      ...(options?.metadata ? metadataPayload(options.metadata) : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as DownloadResponse;
  if (!res.ok) {
    const msg =
      data.error ||
      data.detail ||
      (typeof data.message === 'string' ? data.message : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export {
  getResolvedApiBaseUrl,
  getDefaultApiBaseUrl,
  setApiBaseUrlOverride,
  clearApiBaseUrlOverride,
  normalizeApiBaseUrl,
} from '@/lib/apiBaseUrl';
