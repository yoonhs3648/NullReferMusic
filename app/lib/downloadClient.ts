import type { HealthResponse, DownloadResponse } from '@/lib/downloadTypes';
import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';

export async function fetchHealth(): Promise<HealthResponse> {
  const base = await getResolvedApiBaseUrl();
  const res = await fetch(`${base}/api/health`);
  const data = (await res.json().catch(() => ({}))) as HealthResponse;
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return data;
}

export async function requestDownload(
  url: string,
  options?: { noPlaylist?: boolean },
): Promise<DownloadResponse> {
  const base = await getResolvedApiBaseUrl();
  const res = await fetch(`${base}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: url.trim(),
      noPlaylist: options?.noPlaylist ?? true,
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
