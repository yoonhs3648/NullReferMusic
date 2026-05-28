import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import type { AudioExtractionResult } from '@/lib/nrmDownloadPipeline';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';

/** 추출·후처리 단계에서 만든 로컬 임시 파일 삭제 */
export async function deleteLocalAudioTemp(fileUri: string): Promise<void> {
  if (!fileUri?.trim()) return;
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  await FileSystem.deleteAsync(siblingLrcUri(fileUri), { idempotent: true }).catch(() => {});
}

/** 여러 임시 URI 일괄 삭제 */
export async function deleteLocalAudioTemps(uris: Iterable<string>): Promise<void> {
  const seen = new Set<string>();
  for (const uri of uris) {
    const key = uri.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    await deleteLocalAudioTemp(key);
  }
}

/** 서버 downloads 폴더 job 아티팩트 삭제 */
export async function cleanupServerExtraction(jobId: string): Promise<void> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return;
  const { cleanupServerJobArtifacts } = await import('@/lib/nrmPersistDownload.web');
  await cleanupServerJobArtifacts(base, jobId).catch(() => {});
}

/** yt-dlp/innertube 추출 결과·서버 job 임시 파일 정리 */
export async function cleanupAudioExtraction(
  extraction: AudioExtractionResult,
): Promise<void> {
  if (extraction.kind === 'server') {
    await cleanupServerExtraction(extraction.jobId);
    return;
  }
  await deleteLocalAudioTemp(extraction.fileUri);
}
