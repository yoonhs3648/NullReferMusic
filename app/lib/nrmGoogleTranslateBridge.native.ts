/**
 * 숨김 WebView(translate.google.com)에서 Google Translate 웹 API를 호출해 배치 번역합니다.
 */
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
  (async function() {
    var results = [];
    var sourceLangs = [];
    try {
      for (var i = 0; i < texts.length; i++) {
        var text = texts[i];
        if (!text || !String(text).trim()) {
          results.push('');
          sourceLangs.push('');
          continue;
        }
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q='
          + encodeURIComponent(String(text));
        var res = await fetch(url);
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        var data = await res.json();
        var translated = '';
        if (data && data[0]) {
          for (var j = 0; j < data[0].length; j++) {
            translated += data[0][j][0];
          }
        }
        results.push(translated);
        sourceLangs.push((data && data[2]) ? String(data[2]).toUpperCase() : 'EN');
        if (i + 1 < texts.length) {
          await new Promise(function(r) { setTimeout(r, 60); });
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

export async function translateTextsViaGoogleTranslateWeb(
  texts: string[],
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  if (texts.length === 0) {
    return { texts: [], sourceLangs: [] };
  }
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
