/** Google Translate gtx 엔드포인트 공통 유틸 (웹·네이티브 공유). */

import { getActiveDownloadPipelineCount } from '@/lib/nrmDownloadLyricsWorkGate';
import { getDownloadWorkQueueDepth } from '@/lib/nrmDownloadWorkQueue';
import { logNrmDev } from '@/lib/nrmDevLog';

/** gtx는 다중 q= 요청 시 첫 줄만 번역하므로 1줄씩 요청 */
export const GTX_BATCH_SIZE = 1;
/**
 * JS fetch fallback 기준 그룹 간 지연.
 * Native 경로에서는 Kotlin GROUP_DELAY_MS(600ms)가 대신 적용됨.
 */
export const GTX_BATCH_DELAY_MS = 600;
/**
 * JS fetch fallback 동시 요청 수.
 * Native 경로에서는 Kotlin CONCURRENCY(3)가 대신 적용됨.
 */
export const GTX_CONCURRENCY = 3;
/** 대기 중인 다운로드·파이프라인이 있을 때 */
export const GTX_CONCURRENCY_BUSY = 2;
export const GTX_BATCH_DELAY_BUSY_MS = 700;
export const GTX_CONCURRENCY_HEAVY = 1;
export const GTX_BATCH_DELAY_HEAVY_MS = 800;
/** 줄당 응답 대기 상한 — 초과 시 해당 곡 번역 전체 실패(원문 싱크만 저장) */
export const GTX_FETCH_TIMEOUT_MS = 15_000;
/** 5xx 일시 오류 1회 재시도 전 대기 (타임아웃·429에는 미적용) */
export const GTX_RETRY_BACKOFF_MS = 2_000;
export const GTX_MAX_TRANSIENT_RETRIES = 1;

export type GtxRuntimeLimits = {
  concurrency: number;
  batchDelayMs: number;
  reason: 'default' | 'pending_download' | 'multi_job';
};

/** 다른 곡 다운로드 큐·파이프라인과 네트워크 경쟁 완화 */
export function resolveGtxRuntimeLimits(): GtxRuntimeLimits {
  const depth = getDownloadWorkQueueDepth();
  const pipelines = getActiveDownloadPipelineCount();
  const pendingJobs = depth.audio + depth.lyrics;
  if (pendingJobs >= 2 || pipelines >= 2) {
    return {
      concurrency: GTX_CONCURRENCY_HEAVY,
      batchDelayMs: GTX_BATCH_DELAY_HEAVY_MS,
      reason: 'multi_job',
    };
  }
  if (pendingJobs >= 1 || pipelines >= 1) {
    return {
      concurrency: GTX_CONCURRENCY_BUSY,
      batchDelayMs: GTX_BATCH_DELAY_BUSY_MS,
      reason: 'pending_download',
    };
  }
  return {
    concurrency: GTX_CONCURRENCY,
    batchDelayMs: GTX_BATCH_DELAY_MS,
    reason: 'default',
  };
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

function newGtxBatchId(): string {
  return `gtx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGtxTimeoutError(e: unknown): boolean {
  if (e instanceof Error) {
    // Kotlin NrmGtxModule에서 E_GTX_TIMEOUT 코드로 reject
    if ((e as unknown as { code?: string }).code === 'E_GTX_TIMEOUT') return true;
    // JS fetch AbortController timeout
    return e.message.includes('fetch timeout');
  }
  return false;
}

/** 429 rate-limit — 재시도 없이 즉시 번역 실패 */
export function isGtxRateLimitError(e: unknown): boolean {
  if (e instanceof Error) {
    // Kotlin NrmGtxModule에서 E_GTX_RATE_LIMIT 코드로 reject
    if ((e as unknown as { code?: string }).code === 'E_GTX_RATE_LIMIT') return true;
    return /HTTP 429/i.test(e.message);
  }
  return false;
}

/** 타임아웃·429 제외 — 5xx 일시 오류만 1회 재시도 대상 */
export function isGtxRetryableError(e: unknown): boolean {
  if (isGtxTimeoutError(e)) return false;
  if (isGtxRateLimitError(e)) return false;
  const msg = e instanceof Error ? e.message : String(e);
  return /HTTP 5\d{2}/i.test(msg);
}

export function buildGtxTranslateUrl(texts: string[]): string {
  const params = new URLSearchParams();
  params.set('client', 'gtx');
  params.set('sl', 'auto');
  params.set('tl', 'ko');
  params.set('dt', 't');
  for (const text of texts) {
    const trimmed = String(text ?? '').trim();
    if (trimmed) {
      params.append('q', trimmed);
    }
  }
  return `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
}

type GtxJson = unknown;

function parseOneQuerySegments(segments: unknown): string {
  if (!Array.isArray(segments)) return '';
  let translated = '';
  for (const seg of segments) {
    if (Array.isArray(seg) && seg.length > 0) {
      translated += String(seg[0] ?? '');
    }
  }
  return translated.trim();
}

/** 단일 q= 응답 (기존과 동일). */
export function parseGtxSingleResponse(data: GtxJson): { text: string; sourceLang: string } {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate 응답 형식이 올바르지 않습니다.');
  }
  const text = parseOneQuerySegments(data[0]);
  const sourceLang = typeof data[2] === 'string' ? data[2].toUpperCase() : 'EN';
  return { text, sourceLang };
}

/** 다중 q= 응답 — 줄마다 독립 번역 (순차 1줄 요청과 동일 의미). */
export function parseGtxMultiResponse(
  data: GtxJson,
  queryCount: number,
): { texts: string[]; sourceLangs: string[] } {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate 응답 형식이 올바르지 않습니다.');
  }
  const root = data[0] as unknown[];
  const sourceLang = typeof data[2] === 'string' ? data[2].toUpperCase() : 'EN';
  const texts: string[] = [];
  const sourceLangs: string[] = [];
  for (let i = 0; i < queryCount; i++) {
    texts.push(parseOneQuerySegments(root[i]));
    sourceLangs.push(sourceLang);
  }
  return { texts, sourceLangs };
}

export type GtxFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type GtxFetchResult = {
  data: GtxJson;
  status: number;
  elapsedMs: number;
};

export async function fetchGtxJson(
  fetchFn: GtxFetchFn,
  url: string,
  timeoutMs = GTX_FETCH_TIMEOUT_MS,
  parentSignal?: AbortSignal,
): Promise<GtxFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener('abort', onParentAbort);
  const reqAtMs = Date.now();
  try {
    if (parentSignal?.aborted) {
      throw new Error('Google Translate 요청이 취소되었습니다.');
    }
    const res = await fetchFn(url, { signal: controller.signal });
    const respAtMs = Date.now();
    const elapsedMs = respAtMs - reqAtMs;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as GtxJson;
    return { data, status: res.status, elapsedMs };
  } catch (e) {
    const respAtMs = Date.now();
    const elapsedMs = respAtMs - reqAtMs;
    if (e instanceof Error && e.name === 'AbortError') {
      if (parentSignal?.aborted) {
        throw new Error('Google Translate 요청이 취소되었습니다.');
      }
      throw new Error(`fetch timeout ${timeoutMs}ms (elapsed=${elapsedMs})`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

type GtxSlot = { index: number; text: string };

async function fetchGtxLineWithRetry(
  fetchFn: GtxFetchFn,
  slot: GtxSlot,
  batchId: string,
  seq: number,
  groupIndex: number,
  parentSignal?: AbortSignal,
): Promise<{ index: number; text: string; sourceLang: string }> {
  const url = buildGtxTranslateUrl([slot.text]);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= GTX_MAX_TRANSIENT_RETRIES; attempt++) {
    if (parentSignal?.aborted) {
      throw new Error('Google Translate 요청이 취소되었습니다.');
    }
    const reqAtMs = Date.now();
    logNrmDev('lyrics.translate', {
      event: 'googletranslate_gtx_request',
      batchId,
      seq,
      slotIndex: slot.index,
      groupIndex,
      textLen: slot.text.length,
      attempt,
      reqAtMs,
      reqAtIso: isoAt(reqAtMs),
    });
    try {
      const fetched = await fetchGtxJson(fetchFn, url, GTX_FETCH_TIMEOUT_MS, parentSignal);
      const respAtMs = Date.now();
      const row = parseGtxSingleResponse(fetched.data);
      logNrmDev('lyrics.translate', {
        event: 'googletranslate_gtx_response',
        batchId,
        seq,
        slotIndex: slot.index,
        groupIndex,
        ok: true,
        attempt,
        httpStatus: fetched.status,
        reqAtMs,
        respAtMs,
        reqAtIso: isoAt(reqAtMs),
        respAtIso: isoAt(respAtMs),
        elapsedMs: respAtMs - reqAtMs,
        fetchElapsedMs: fetched.elapsedMs,
        sourceLang: row.sourceLang,
        outLen: row.text.length,
      });
      return { index: slot.index, text: row.text, sourceLang: row.sourceLang };
    } catch (e) {
      lastErr = e;
      const respAtMs = Date.now();
      const err = e instanceof Error ? e.message : String(e);
      logNrmDev('lyrics.translate', {
        event: 'googletranslate_gtx_response',
        batchId,
        seq,
        slotIndex: slot.index,
        groupIndex,
        ok: false,
        attempt,
        reqAtMs,
        respAtMs,
        reqAtIso: isoAt(reqAtMs),
        respAtIso: isoAt(respAtMs),
        elapsedMs: respAtMs - reqAtMs,
        error: err.slice(0, 200),
        retryable: isGtxRetryableError(e),
        timeout: isGtxTimeoutError(e),
      });
      if (isGtxTimeoutError(e)) {
        throw e;
      }
      if (attempt < GTX_MAX_TRANSIENT_RETRIES && isGtxRetryableError(e)) {
        logNrmDev('lyrics.translate', {
          event: 'googletranslate_gtx_retry',
          batchId,
          seq,
          slotIndex: slot.index,
          backoffMs: GTX_RETRY_BACKOFF_MS,
        });
        await sleep(GTX_RETRY_BACKOFF_MS);
        continue;
      }
      throw e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export type GtxBatchedTranslateOptions = {
  batchId?: string;
  limits?: GtxRuntimeLimits;
};

export async function translateTextsViaGtxBatched(
  texts: string[],
  fetchFn: GtxFetchFn,
  options?: GtxBatchedTranslateOptions,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  if (texts.length === 0) {
    return { texts: [], sourceLangs: [] };
  }

  const batchId = options?.batchId ?? newGtxBatchId();
  const limits = options?.limits ?? resolveGtxRuntimeLimits();
  const batchT0 = Date.now();

  const outTexts: string[] = new Array(texts.length).fill('');
  const outSourceLangs: string[] = new Array(texts.length).fill('');

  const slots: GtxSlot[] = [];
  for (let i = 0; i < texts.length; i++) {
    const trimmed = String(texts[i] ?? '').trim();
    if (trimmed) {
      slots.push({ index: i, text: trimmed });
    }
  }

  logNrmDev('lyrics.translate', {
    event: 'googletranslate_gtx_batch_start',
    batchId,
    slotCount: slots.length,
    concurrency: limits.concurrency,
    batchDelayMs: limits.batchDelayMs,
    fetchTimeoutMs: GTX_FETCH_TIMEOUT_MS,
    limitReason: limits.reason,
    queueAudio: getDownloadWorkQueueDepth().audio,
    queueLyrics: getDownloadWorkQueueDepth().lyrics,
    activePipelines: getActiveDownloadPipelineCount(),
  });

  let okCount = 0;

  for (let groupStart = 0; groupStart < slots.length; groupStart += limits.concurrency) {
    const groupIndex = Math.floor(groupStart / limits.concurrency);
    const group = slots.slice(groupStart, groupStart + limits.concurrency);
    const groupAbort = new AbortController();

    logNrmDev('lyrics.translate', {
      event: 'googletranslate_gtx_group_start',
      batchId,
      groupIndex,
      groupSize: group.length,
      seqFrom: groupStart,
      atIso: isoAt(Date.now()),
    });

    try {
      for (let offsetInGroup = 0; offsetInGroup < group.length; offsetInGroup++) {
        const slot = group[offsetInGroup]!;
        const seq = groupStart + offsetInGroup;
        const row = await fetchGtxLineWithRetry(
          fetchFn,
          slot,
          batchId,
          seq,
          groupIndex,
          groupAbort.signal,
        );
        outTexts[row.index] = row.text;
        outSourceLangs[row.index] = row.sourceLang;
        okCount += 1;
      }
    } catch (e) {
      groupAbort.abort();
      logNrmDev('lyrics.translate', {
        event: 'googletranslate_gtx_batch_aborted',
        batchId,
        slotCount: slots.length,
        completedOk: okCount,
        failedSeq: groupStart,
        timeout: isGtxTimeoutError(e),
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
        totalMs: Date.now() - batchT0,
      });
      throw e;
    }

    if (groupStart + limits.concurrency < slots.length) {
      await sleep(limits.batchDelayMs);
    }
  }

  logNrmDev('lyrics.translate', {
    event: 'googletranslate_gtx_batch_done',
    batchId,
    slotCount: slots.length,
    okCount,
    totalMs: Date.now() - batchT0,
    concurrency: limits.concurrency,
    limitReason: limits.reason,
  });

  return { texts: outTexts, sourceLangs: outSourceLangs };
}
