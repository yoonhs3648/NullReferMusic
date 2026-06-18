/**
 * 전역 다운로드·변환 vs 가사 생성 우선순위 (A 방식)
 *
 * - 진행 중인 가사 작업은 끊지 않음
 * - 새 가사 작업은 activeDownloadPipeline 이 0이 될 때까지 대기
 * - 다운로드 파이프라인: 추출 시작(beginParallelExtraction) ~ 오디오 저장(onAudioPersisted)
 */
import { logNrmDev } from '@/lib/nrmDevLog';

const activeDownloadPipelines = new Set<string>();
const idleWaiters: Array<() => void> = [];

function pipelineToken(jobId: string): string {
  return `pipeline:${jobId.trim()}`;
}

export function getActiveDownloadPipelineCount(): number {
  return activeDownloadPipelines.size;
}

/** yt-dlp/innertube 추출이 시작될 때 (곡당 1회) */
export function registerDownloadPipelineStart(jobId: string): void {
  const token = pipelineToken(jobId);
  if (!token || token === 'pipeline:' || activeDownloadPipelines.has(token)) return;
  activeDownloadPipelines.add(token);
  logNrmDev('download.gate', {
    event: 'pipeline_start',
    jobId,
    active: activeDownloadPipelines.size,
  });
}

/** 오디오 저장 완료·실패·취소 시 (곡당 1회, idempotent) */
export function registerDownloadPipelineEnd(jobId: string, reason?: string): void {
  const token = pipelineToken(jobId);
  if (!token || token === 'pipeline:') return;
  if (!activeDownloadPipelines.delete(token)) return;
  logNrmDev('download.gate', {
    event: 'pipeline_end',
    jobId,
    reason: reason ?? 'done',
    active: activeDownloadPipelines.size,
  });
  if (activeDownloadPipelines.size === 0) {
    const pending = idleWaiters.splice(0);
    for (const resolve of pending) resolve();
  }
}

/** 새 가사 작업 시작 전 — 진행 중 다운로드·변환이 없을 때까지 대기 */
export function waitForDownloadsIdle(): Promise<void> {
  if (activeDownloadPipelines.size === 0) return Promise.resolve();
  const active = activeDownloadPipelines.size;
  logNrmDev('download.gate', { event: 'lyrics_wait_start', active });
  return new Promise((resolve) => {
    idleWaiters.push(() => {
      logNrmDev('download.gate', { event: 'lyrics_wait_end', active: activeDownloadPipelines.size });
      resolve();
    });
  });
}
