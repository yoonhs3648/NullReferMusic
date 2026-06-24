/**
 * Android/iOS: gtx 네이티브 fetch(배치) 우선, 실패 시 숨김 WebView fallback.
 */
import { logNrmDev } from '@/lib/nrmDevLog';
import {
  GTX_BATCH_DELAY_MS,
  GTX_BATCH_SIZE,
  GTX_CONCURRENCY,
  translateTextsViaGtxBatched,
} from '@/lib/nrmGoogleTranslateGtx';

type InjectedWebView = {
  injectJavaScript: (script: string) => void;
};

type TranslateJob = {
  jobId: string;
  texts: string[];
  resolve: (v: { texts: string[]; sourceLangs: string[] }) => void;
  reject: (e: Error) => void;
};

const translateQueue: TranslateJob[] = [];
let webView: InjectedWebView | null = null;
let webReady = false;
let translateBusy = false;
let currentJob: TranslateJob | null = null;

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

function buildTranslateInject(jobId: string, texts: string[]): string {
  return `
(function(){
  var jobId = ${JSON.stringify(jobId)};
  var texts = ${JSON.stringify(texts)};
  var batchSize = ${GTX_BATCH_SIZE};
  var batchDelayMs = ${GTX_BATCH_DELAY_MS};
  var concurrencyLimit = ${GTX_CONCURRENCY};
  var fetchTimeoutMs = 15000;
  function parseOne(segments) {
    if (!segments || !segments.length) return '';
    var out = '';
    for (var j = 0; j < segments.length; j++) {
      out += segments[j][0] || '';
    }
    return out;
  }
  function fetchJson(url) {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('fetch timeout')); }, fetchTimeoutMs);
      fetch(url).then(function(res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(resolve).catch(function(e) {
        clearTimeout(timer);
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
        var group = slots.slice(b, b + concurrencyLimit);
        var groupResults = await Promise.all(group.map(async function(slot) {
          var data = await fetchJson(buildUrl([slot.text]));
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
  if (translateBusy || !webReady || !webView) return;
  const job = translateQueue.shift();
  if (!job) return;
  translateBusy = true;
  currentJob = job;
  webView.injectJavaScript(buildTranslateInject(job.jobId, job.texts));
}

export function routeGoogleTranslateWebViewMessage(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('nrm' in parsed) ||
    (parsed as { nrm: string }).nrm !== 'gt'
  ) {
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
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  await waitForWebViewReady(20_000);
  if (!webView) {
    throw new Error('Google Translate WebView가 없습니다.');
  }
  const jobId = `gt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve, reject) => {
    translateQueue.push({ jobId, texts, resolve, reject });
    drainTranslateQueue();
  });
}

async function translateViaNativeFetch(
  texts: string[],
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  return translateTextsViaGtxBatched(texts, globalThis.fetch.bind(globalThis));
}

export async function translateTextsViaGoogleTranslateWeb(
  texts: string[],
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  if (texts.length === 0) {
    return { texts: [], sourceLangs: [] };
  }
  try {
    const out = await translateViaNativeFetch(texts);
    logNrmDev('lyrics.translate', {
      event: 'googletranslate_native_ok',
      lineCount: texts.length,
    });
    return out;
  } catch (nativeErr) {
    const msg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
    logNrmDev('lyrics.translate', {
      event: 'googletranslate_native_fallback',
      message: msg.slice(0, 120),
      lineCount: texts.length,
    });
    return translateViaWebView(texts);
  }
}
