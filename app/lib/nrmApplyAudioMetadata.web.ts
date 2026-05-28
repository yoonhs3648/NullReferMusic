import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';

/** 웹: 서버가 job 파일에 메타를 쓴 뒤 받는 흐름이 아니면 스킵 */
export async function applyAudioFileMetadata(
  fileUri: string,
  _metadata: NrmAudioFileMetadata,
): Promise<string> {
  void fileUri;
  return fileUri;
}

/** PC 백엔드 다운로드 직후 서버 파일에 메타데이터 적용 */
export async function applyServerJobMetadata(
  jobId: string,
  metadata: NrmAudioFileMetadata,
  options?: { deeplApiKey?: string; whisperModelPreference?: string },
): Promise<{ lyricsRequested: boolean; lyricsEmbedded: boolean; lyricsTranslationFailed?: boolean }> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return { lyricsRequested: false, lyricsEmbedded: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  const res = await nrmBackendFetch(`${base}/api/download/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      jobId,
      ...metadata,
      deeplApiKey: options?.deeplApiKey?.trim() || undefined,
      whisperModelPreference: options?.whisperModelPreference?.trim() || undefined,
    }),
  }).finally(() => {
    clearTimeout(timeout);
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  const body = (await res.json().catch(() => ({}))) as {
    lyricsRequested?: boolean;
    lyricsEmbedded?: boolean;
    lyricsTranslationFailed?: boolean;
  };
  return {
    lyricsRequested: !!body.lyricsRequested,
    lyricsEmbedded: !!body.lyricsEmbedded,
    lyricsTranslationFailed: !!body.lyricsTranslationFailed,
  };
}
