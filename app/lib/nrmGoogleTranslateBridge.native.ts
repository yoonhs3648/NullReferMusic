/**
 * Android/iOS: Kotlin NrmGtxModule 우선 사용 (OS 레벨 타임아웃, 백그라운드 freeze 무관).
 * native module 미설치 환경 fallback: JS globalThis.fetch 배치.
 */
import { NativeModules } from 'react-native';
import { logNrmDev } from '@/lib/nrmDevLog';
import {
  GTX_BATCH_SIZE,
  GTX_FETCH_TIMEOUT_MS,
  resolveGtxRuntimeLimits,
  translateTextsViaGtxBatched,
} from '@/lib/nrmGoogleTranslateGtx';

type NrmGtxNative = {
  translateTexts: (
    texts: string[],
    lineDelayMs: number,
  ) => Promise<{ texts: string[]; sourceLangs: string[] }>;
};

const gtxNative = NativeModules.NrmGtx as NrmGtxNative | undefined;

type InjectedWebView = {
  injectJavaScript: (script: string) => void;
};

type TranslateJob = {
  jobId: string;
  batchId: string;
  texts: string[];
  limits: ReturnType<typeof resolveGtxRuntimeLimits>;
  resolve: (v: { texts: string[]; sourceLangs: string[] }) => void;
  reject: (e: Error) => void;
};

const translateQueue: TranslateJob[] = [];
let webView: InjectedWebView | null = null;
let webReady = false;
let translateBusy = false;
let currentJob: TranslateJob | null = null;

// ── 레이지 마운트 ──────────────────────────────────────────────────────────────
let requestGtMountFn: (() => void) | null = null;
let releaseGtMountFn: (() => void) | null = null;
let gtIdleTimer: ReturnType<typeof setTimeout> | null = null;
/** 번역 완료 후 이 시간만큼 idle이면 WebView를 언마운트 */
const GT_IDLE_UNMOUNT_MS = 3 * 60 * 1000; // 3분

export function registerGoogleTranslateWebViewCallbacks(
  requestMount: (() => void) | null,
  releaseMount: (() => void) | null,
): void {
  requestGtMountFn = requestMount;
  releaseGtMountFn = releaseMount;
}

function requestGtMount(): void {
  if (gtIdleTimer !== null) {
    clearTimeout(gtIdleTimer);
    gtIdleTimer = null;
  }
  requestGtMountFn?.();
}

function scheduleGtIdleUnmount(): void {
  if (gtIdleTimer !== null) clearTimeout(gtIdleTimer);
  gtIdleTimer = setTimeout(() => {
    gtIdleTimer = null;
    if (!translateBusy && translateQueue.length === 0 && currentJob === null) {
      releaseGtMountFn?.();
    }
  }, GT_IDLE_UNMOUNT_MS);
}

export function attachGoogleTranslateWebView(ref: InjectedWebView | null): void {
  webView = ref;
  if (!ref) {
    webReady = false;
  }
}

export function markGoogleTranslateWebViewLoading(): void {
  webReady = false;
}

export function markGoogleTranslateWebViewReady(): void {
  webReady = true;
  drainTranslateQueue();
}

function buildTranslateInject(
  jobId: string,
  texts: string[],
  batchId: string,
  concurrencyLimit: number,
  batchDelayMs: number,
): string {
  return `
(function(){
  var jobId = ${JSON.stringify(jobId)};
  var batchId = ${JSON.stringify(batchId)};
  var texts = ${JSON.stringify(texts)};
  var batchSize = ${GTX_BATCH_SIZE};
  var batchDelayMs = ${batchDelayMs};
  var concurrencyLimit = ${concurrencyLimit};
  var fetchTimeoutMs = ${GTX_FETCH_TIMEOUT_MS};
  function isoAt(ms) {
    try { return new Date(ms).toISOString(); } catch (e) { return String(ms); }
  }
  function postLine(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ nrm: 'gt_line', batchId: batchId }, payload)));
    } catch (e) {}
  }
  function parseOne(segments) {
    if (!segments || !segments.length) return '';
    var out = '';
    for (var j = 0; j < segments.length; j++) {
      out += segments[j][0] || '';
    }
    return out;
  }
  function fetchJson(url, meta) {
    var reqAtMs = Date.now();
    postLine(Object.assign({ event: 'googletranslate_gtx_request', phase: 'request' }, meta, {
      reqAtMs: reqAtMs,
      reqAtIso: isoAt(reqAtMs)
    }));
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        var respAtMs = Date.now();
        postLine(Object.assign({ event: 'googletranslate_gtx_response', phase: 'response', ok: false }, meta, {
          reqAtMs: reqAtMs,
          respAtMs: respAtMs,
          reqAtIso: isoAt(reqAtMs),
          respAtIso: isoAt(respAtMs),
          elapsedMs: respAtMs - reqAtMs,
          error: 'fetch timeout'
        }));
        reject(new Error('fetch timeout'));
      }, fetchTimeoutMs);
      fetch(url).then(function(res) {
        clearTimeout(timer);
        var respAtMs = Date.now();
        if (!res.ok) {
          postLine(Object.assign({ event: 'googletranslate_gtx_response', phase: 'response', ok: false }, meta, {
            reqAtMs: reqAtMs,
            respAtMs: respAtMs,
            reqAtIso: isoAt(reqAtMs),
            respAtIso: isoAt(respAtMs),
            elapsedMs: respAtMs - reqAtMs,
            httpStatus: res.status,
            error: 'HTTP ' + res.status
          }));
          throw new Error('HTTP ' + res.status);
        }
        return res.json().then(function(data) {
          postLine(Object.assign({ event: 'googletranslate_gtx_response', phase: 'response', ok: true }, meta, {
            reqAtMs: reqAtMs,
            respAtMs: respAtMs,
            reqAtIso: isoAt(reqAtMs),
            respAtIso: isoAt(respAtMs),
            elapsedMs: respAtMs - reqAtMs,
            httpStatus: res.status
          }));
          return data;
        });
      }).catch(function(e) {
        clearTimeout(timer);
        var respAtMs = Date.now();
        var msg = (e && e.message) ? e.message : String(e);
        postLine(Object.assign({ event: 'googletranslate_gtx_response', phase: 'response', ok: false }, meta, {
          reqAtMs: reqAtMs,
          respAtMs: respAtMs,
          reqAtIso: isoAt(reqAtMs),
          respAtIso: isoAt(respAtMs),
          elapsedMs: respAtMs - reqAtMs,
          error: msg
        }));
        reject(e);
      });
    });
  }
  function buildUrl(batchTexts) {
    var params = 'client=gtx&sl=auto&tl=ko&dt=t';
    for (var i = 0; i < batchTexts.length; i++) {
      params += '&q=' + encodeURIComponent(batchTexts[i]);
    }
    return 'https://translate.googleapis.com/translate_a/single?' + params;
  }
  (async function() {
    var results = new Array(texts.length).fill('');
    var sourceLangs = new Array(texts.length).fill('');
    var slots = [];
    try {
      for (var i = 0; i < texts.length; i++) {
        var text = texts[i];
        if (!text || !String(text).trim()) continue;
        slots.push({ index: i, text: String(text).trim() });
      }
      for (var b = 0; b < slots.length; b += concurrencyLimit) {
        var groupIndex = Math.floor(b / concurrencyLimit);
        var group = slots.slice(b, b + concurrencyLimit);
        var groupResults = await Promise.all(group.map(async function(slot, offsetInGroup) {
          var seq = b + offsetInGroup;
          var data = await fetchJson(buildUrl([slot.text]), {
            seq: seq,
            slotIndex: slot.index,
            groupIndex: groupIndex,
            textLen: slot.text.length
          });
          var src = (data && data[2]) ? String(data[2]).toUpperCase() : 'EN';
          var segs = data && data[0];
          return { index: slot.index, text: parseOne(segs), src: src };
        }));
        for (var k = 0; k < groupResults.length; k++) {
          results[groupResults[k].index] = groupResults[k].text;
          sourceLangs[groupResults[k].index] = groupResults[k].src;
        }
        if (b + concurrencyLimit < slots.length) {
          await new Promise(function(r) { setTimeout(r, batchDelayMs); });
        }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        nrm: 'gt', jobId: jobId, ok: true, texts: results, sourceLangs: sourceLangs
      }));
    } catch (__e) {
      var __m = (__e && __e.message) ? __e.message : String(__e);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        nrm: 'gt', jobId: jobId, ok: false, err: __m
      }));
    }
  })();
})();
true;
`;
}

function drainTranslateQueue(): void {
  if (translateBusy || !webReady || !webView) {
    // 대기 중인 작업이 없고 idle → WebView 유지 불필요, 언마운트 예약
    if (!translateBusy && translateQueue.length === 0 && currentJob === null) {
      scheduleGtIdleUnmount();
    }
    return;
  }
  const job = translateQueue.shift();
  if (!job) {
    scheduleGtIdleUnmount();
    return;
  }
  translateBusy = true;
  currentJob = job;
  webView.injectJavaScript(
    buildTranslateInject(
      job.jobId,
      job.texts,
      job.batchId,
      job.limits.concurrency,
      job.limits.batchDelayMs,
    ),
  );
}

export function routeGoogleTranslateWebViewMessage(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null || !('nrm' in parsed)) {
    return;
  }
  const tag = (parsed as { nrm: string }).nrm;
  if (tag === 'gt_line') {
    const line = parsed as Record<string, unknown>;
    const { nrm: _nrm, phase: _phase, ...payload } = line;
    logNrmDev('lyrics.translate', payload as Record<string, unknown>);
    return;
  }
  if (tag !== 'gt') {
    return;
  }
  const msg = parsed as {
    jobId?: string;
    ok?: boolean;
    texts?: string[];
    sourceLangs?: string[];
    err?: string;
  };
  if (!currentJob || currentJob.jobId !== msg.jobId) return;
  const job = currentJob;
  currentJob = null;
  translateBusy = false;
  if (msg.ok) {
    job.resolve({
      texts: Array.isArray(msg.texts) ? msg.texts.map((t) => String(t ?? '').trim()) : [],
      sourceLangs: Array.isArray(msg.sourceLangs)
        ? msg.sourceLangs.map((v) => String(v ?? '').trim().toUpperCase())
        : [],
    });
  } else {
    job.reject(new Error(msg.err || 'Google Translate 번역에 실패했습니다.'));
  }
  drainTranslateQueue();
}

async function waitForWebViewReady(timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!webReady) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Google Translate WebView 준비 시간이 초과되었습니다.');
    }
    await new Promise((r) => setTimeout(r, 80));
  }
}

async function translateViaWebView(
  texts: string[],
  batchId: string,
  limits: ReturnType<typeof resolveGtxRuntimeLimits>,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  // WebView가 마운트되지 않은 경우 마운트 요청 후 준비될 때까지 대기
  requestGtMount();
  await waitForWebViewReady(20_000);
  if (!webView) {
    throw new Error('Google Translate WebView가 없습니다.');
  }
  const jobId = `gt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve, reject) => {
    translateQueue.push({ jobId, batchId, texts, limits, resolve, reject });
    drainTranslateQueue();
  });
}

async function translateViaNativeModule(
  texts: string[],
  limits: ReturnType<typeof resolveGtxRuntimeLimits>,
  batchId: string,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  const result = await gtxNative!.translateTexts(texts, limits.batchDelayMs);
  return {
    texts: Array.isArray(result.texts)
      ? result.texts.map((t) => String(t ?? '').trim())
      : [],
    sourceLangs: Array.isArray(result.sourceLangs)
      ? result.sourceLangs.map((v) => String(v ?? '').trim().toUpperCase())
      : [],
  };
}

async function translateViaJsFetch(
  texts: string[],
  batchId: string,
  limits: ReturnType<typeof resolveGtxRuntimeLimits>,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  return translateTextsViaGtxBatched(texts, globalThis.fetch.bind(globalThis), {
    batchId,
    limits,
  });
}

export async function translateTextsViaGoogleTranslateWeb(
  texts: string[],
  batchId?: string,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  if (texts.length === 0) {
    return { texts: [], sourceLangs: [] };
  }
  const resolvedBatchId = batchId ?? `gtx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const limits = resolveGtxRuntimeLimits();
  const t0 = Date.now();

  if (gtxNative?.translateTexts) {
    // Kotlin HttpURLConnection — readTimeout이 OS 레벨에서 정확히 작동, 백그라운드 freeze 무관
    const out = await translateViaNativeModule(texts, limits, resolvedBatchId);
    logNrmDev('lyrics.translate', {
      event: 'googletranslate_native_module_ok',
      batchId: resolvedBatchId,
      lineCount: texts.length,
      totalMs: Date.now() - t0,
      path: 'kotlin_httpclient',
      limitReason: limits.reason,
      lineDelayMs: limits.batchDelayMs,
    });
    return out;
  }

  // fallback: JS fetch (포그라운드에서만 타임아웃 정확)
  logNrmDev('lyrics.translate', {
    event: 'googletranslate_native_module_fallback',
    batchId: resolvedBatchId,
    reason: 'NrmGtx unavailable',
  });
  const out = await translateViaJsFetch(texts, resolvedBatchId, limits);
  logNrmDev('lyrics.translate', {
    event: 'googletranslate_native_ok',
    batchId: resolvedBatchId,
    lineCount: texts.length,
    totalMs: Date.now() - t0,
    path: 'js_fetch',
  });
  return out;
}
