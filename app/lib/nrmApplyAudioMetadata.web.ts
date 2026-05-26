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
): Promise<void> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return;
  const res = await nrmBackendFetch(`${base}/api/download/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ...metadata }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}
