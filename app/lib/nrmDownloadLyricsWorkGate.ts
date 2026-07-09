/**
 * 전역 다운로드·변환 vs 가사 생성 우선순위 (A 방식)
 *
 * - 진행 중인 가사 작업은 끊지 않음
 * - 새 가사 작업은 activeDownloadPipeline 이 0이 될 때까지 대기
 * - 다운로드 파이프라인: 추출 시작(beginParallelExtraction) ~ 오디오 저장(onAudioPersisted)
 */
import { Platform } from 'react-native';

import { logNrmDev } from '@/lib/nrmDevLog';
import {
  nrmBackgroundWorkRegisterActiveAudioExtract,
  nrmBackgroundWorkUnregisterActiveAudioExtract,
} from '@/lib/nrmBackgroundWork.native';

const activeDownloadPipelines = new Set<string>();
const pipelineStartedAt = new Map<string, number>();
const idleWaiters: Array<() => void> = [];

/** JS 이벤트 루프 지연 등으로 pipeline_end가 누락될 때 가사 대기 무한 정체 방지 */
const PIPELINE_STALE_MS = 20 * 60 * 1000;

function pipelineToken(jobId: string): string {
  return `pipeline:${jobId.trim()}`;
}

function notifyIdleWaiters(): void {
  if (activeDownloadPipelines.size === 0) {
    const pending = idleWaiters.splice(0);
    for (const resolve of pending) resolve();
  }
}

function forceClearStalePipelines(): number {
  const now = Date.now();
  let cleared = 0;
  for (const token of [...activeDownloadPipelines]) {
    const started = pipelineStartedAt.get(token) ?? now;
    if (now - started >= PIPELINE_STALE_MS) {
      activeDownloadPipelines.delete(token);
      pipelineStartedAt.delete(token);
      cleared += 1;
    }
  }
  if (cleared > 0) {
    logNrmDev('download.gate', {
      event: 'pipeline_stale_force_clear',
      cleared,
      remaining: activeDownloadPipelines.size,
    });
    notifyIdleWaiters();
  }
  return cleared;
}

export function getActiveDownloadPipelineCount(): number {
  return activeDownloadPipelines.size;
}

/** yt-dlp/innertube 추출이 시작될 때 (곡당 1회) */
export function registerDownloadPipelineStart(jobId: string): void {
  const token = pipelineToken(jobId);
  if (!token || token === 'pipeline:' || activeDownloadPipelines.has(token)) return;
  activeDownloadPipelines.add(token);
  pipelineStartedAt.set(token, Date.now());
  if (Platform.OS === 'android') {
    nrmBackgroundWorkRegisterActiveAudioExtract(jobId);
  }
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
  pipelineStartedAt.delete(token);
  if (Platform.OS === 'android') {
    nrmBackgroundWorkUnregisterActiveAudioExtract(jobId);
  }
  logNrmDev('download.gate', {
    event: 'pipeline_end',
    jobId,
    reason: reason ?? 'done',
    active: activeDownloadPipelines.size,
  });
  notifyIdleWaiters();
}

/** 새 가사 작업 시작 전 — 진행 중 다운로드·변환이 없을 때까지 대기 */
export function waitForDownloadsIdle(): Promise<void> {
  forceClearStalePipelines();
  if (activeDownloadPipelines.size === 0) return Promise.resolve();
  const active = activeDownloadPipelines.size;
  logNrmDev('download.gate', { event: 'lyrics_wait_start', active });
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      const idx = idleWaiters.indexOf(finish);
      if (idx >= 0) idleWaiters.splice(idx, 1);
      logNrmDev('download.gate', {
        event: 'lyrics_wait_end',
        active: activeDownloadPipelines.size,
      });
      resolve();
    };
    idleWaiters.push(finish);
    timer = setInterval(() => {
      forceClearStalePipelines();
      if (activeDownloadPipelines.size === 0) finish();
    }, 30_000);
  });
}
