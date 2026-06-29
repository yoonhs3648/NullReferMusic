/** 웹 — Google Translate gtx 배치 번역 (동일 API, 순차 1줄 요청과 동일 의미). */

import { translateTextsViaGtxBatched, resolveGtxRuntimeLimits } from '@/lib/nrmGoogleTranslateGtx';

export function attachGoogleTranslateWebView(_ref: unknown): void {}

export function markGoogleTranslateWebViewLoading(): void {}

export function markGoogleTranslateWebViewReady(): void {}

export function routeGoogleTranslateWebViewMessage(_raw: string): void {}

/** 웹/tsc 스텁 — 네이티브에서만 동작 */
export function registerGoogleTranslateWebViewCallbacks(
  _requestMount: (() => void) | null,
  _releaseMount: (() => void) | null,
): void {}

export async function translateTextsViaGoogleTranslateWeb(
  texts: string[],
  batchId?: string,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  return translateTextsViaGtxBatched(texts, globalThis.fetch.bind(globalThis), {
    batchId,
    limits: resolveGtxRuntimeLimits(),
  });
}
