/**
 * 숨김 WebView: (1) 플레이어 복호화 new Function (2) googlevideo 미디어 fetch
 * — RN fetch/downloadAsync 와 다른 Chromium 스택이라 403 회피에 도움이 될 수 있음.
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

export type NrmDecipherResult = { n?: string; sig?: string };

type InjectedWebView = {
  injectJavaScript: (script: string) => void;
};

type DecipherJob = {
  code: string;
  resolve: (v: NrmDecipherResult) => void;
  reject: (e: Error) => void;
};

type StreamJob = {
  jobId: string;
  destUri: string;
  partPaths: Record<number, string>;
  nChunks: number | null;
  resolve: () => void;
  reject: (e: Error) => void;
};

const decipherQueue: DecipherJob[] = [];
let webView: InjectedWebView | null = null;
let webReady = false;
let decipherBusy = false;
let currentDecipherJob: DecipherJob | null = null;

let streamDownloadActive = false;
let streamJob: StreamJob | null = null;
let streamWriteChain: Promise<void> = Promise.resolve();

function uint8ToBase64(u8: Uint8Array): string {
  const CHUNK = 0x1000;
  let binary = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, u8.length);
    const sub = u8.subarray(i, end);
    binary += String.fromCharCode.apply(
      null,
      sub as unknown as number[],
    );
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function mergePartUris(partUris: string[], destUri: string): Promise<void> {
  const arrays = await Promise.all(
    partUris.map((uri) =>
      FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 }).then(
        base64ToUint8Array,
      ),
    ),
  );
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const merged = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) {
    merged.set(a, o);
    o += a.length;
  }
  await FileSystem.writeAsStringAsync(destUri, uint8ToBase64(merged), {
    encoding: EncodingType.Base64,
  });
  for (const uri of partUris) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

export function attachDecipherWebView(ref: InjectedWebView | null): void {
  webView = ref;
  if (!ref) {
    webReady = false;
  }
}

export function markDecipherWebViewLoading(): void {
  webReady = false;
}

export function markDecipherWebViewReady(): void {
  webReady = true;
  drainDecipherQueue();
}

/** 복호화 메시지 (기존) */
export function routeDecipherWebViewMessage(raw: string): void {
  if (!currentDecipherJob) return;
  const job = currentDecipherJob;
  currentDecipherJob = null;
  decipherBusy = false;
  try {
    const msg = JSON.parse(raw) as {
      ok?: boolean;
      v?: NrmDecipherResult;
      err?: string;
    };
    if (msg.ok && msg.v != null && typeof msg.v === 'object') {
      job.resolve(msg.v);
    } else {
      job.reject(new Error(msg.err || 'decipher_webview_failed'));
    }
  } catch (e) {
    job.reject(e instanceof Error ? e : new Error(String(e)));
  }
  drainDecipherQueue();
}

type StreamMsg = {
  nrm: string;
  phase: string;
  jobId: string;
  seq?: number;
  b64?: string;
  nChunks?: number;
  http?: number;
  err?: string;
};

function cleanupStreamParts(job: StreamJob): void {
  const paths = Object.values(job.partPaths);
  for (const p of paths) {
    FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {});
  }
}

async function finalizeStreamJob(job: StreamJob, nChunks: number): Promise<void> {
  const ordered: string[] = [];
  for (let i = 0; i < nChunks; i++) {
    const p = job.partPaths[i];
    if (!p) {
      throw new Error(`stream_part_missing:${i}`);
    }
    ordered.push(p);
  }
  if (ordered.length === 1) {
    try {
      await FileSystem.moveAsync({ from: ordered[0], to: job.destUri });
    } catch {
      await mergePartUris(ordered, job.destUri);
    }
  } else {
    await mergePartUris(ordered, job.destUri);
  }
}

function handleStreamMessage(msg: StreamMsg): void {
  if (!streamJob || msg.jobId !== streamJob.jobId) return;
  const job = streamJob;

  if (msg.phase === 'chunk' && typeof msg.seq === 'number' && typeof msg.b64 === 'string') {
    const seq = msg.seq;
    const b64 = msg.b64;
    streamWriteChain = streamWriteChain.then(async () => {
      const path = `${job.destUri}.wvp.${seq}`;
      await FileSystem.writeAsStringAsync(path, b64, {
        encoding: EncodingType.Base64,
      });
      job.partPaths[seq] = path;
    });
    return;
  }

  if (msg.phase === 'done' && typeof msg.nChunks === 'number') {
    streamWriteChain = streamWriteChain
      .then(async () => {
        await finalizeStreamJob(job, msg.nChunks!);
      })
      .then(() => {
        streamDownloadActive = false;
        streamJob = null;
        job.resolve();
        drainDecipherQueue();
      })
      .catch((e) => {
        streamDownloadActive = false;
        cleanupStreamParts(job);
        FileSystem.deleteAsync(job.destUri, { idempotent: true }).catch(() => {});
        streamJob = null;
        job.reject(e instanceof Error ? e : new Error(String(e)));
        drainDecipherQueue();
      });
    return;
  }

  if (msg.phase === 'err') {
    streamWriteChain = streamWriteChain.then(() => {
      streamDownloadActive = false;
      cleanupStreamParts(job);
      FileSystem.deleteAsync(job.destUri, { idempotent: true }).catch(() => {});
      streamJob = null;
      const m =
        msg.err ||
        (msg.http != null ? `http_${msg.http}` : 'stream_webview_failed');
      job.reject(new Error(m));
      drainDecipherQueue();
    });
  }
}

/** Host `onMessage`: 스트림 / 복호화 분기 */
export function routeYoutubeWebViewMessage(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'nrm' in parsed &&
    (parsed as { nrm: string }).nrm === 'stream'
  ) {
    handleStreamMessage(parsed as StreamMsg);
    return;
  }
  routeDecipherWebViewMessage(raw);
}

function buildDecipherInject(code: string): string {
  return `
(function(){
  try {
    var __code = ${JSON.stringify(code)};
    var __fn = new Function(__code);
    var __r = __fn();
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, v: __r }));
  } catch (__e) {
    var __m = (__e && __e.message) ? __e.message : String(__e);
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, err: __m }));
  }
})();
true;
`;
}

function buildStreamFetchInject(fullUrl: string, jobId: string): string {
  return `
(function(){
  var url = ${JSON.stringify(fullUrl)};
  var jobId = ${JSON.stringify(jobId)};
  (async function() {
    try {
      var res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'X-YouTube-Client-Name': '5',
          'X-YouTube-Client-Version': '19.29.1'
        },
        // include: 시스템 CookieManager에 저장된 YouTube 쿠키를 자동 포함.
        // NrmYoutubeCookieHarvester 가 youtube.com 방문 후 쿠키를 적재했으므로
        // VISITOR_INFO1_LIVE, YSC, SAPISID 등이 자동으로 첨부됩니다.
        credentials: 'include'
      });
      if (!res.ok) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          nrm: 'stream', phase: 'err', jobId: jobId, http: res.status
        }));
        return;
      }
      var buf = await res.arrayBuffer();
      var u8 = new Uint8Array(buf);
      var CHUNK = 262144;
      var seq = 0;
      for (var i = 0; i < u8.length; i += CHUNK) {
        var end = Math.min(i + CHUNK, u8.length);
        var slice = u8.subarray(i, end);
        var bin = '';
        for (var j = 0; j < slice.length; j++) bin += String.fromCharCode(slice[j]);
        var b64 = btoa(bin);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          nrm: 'stream', phase: 'chunk', jobId: jobId, seq: seq, b64: b64
        }));
        seq++;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        nrm: 'stream', phase: 'done', jobId: jobId, nChunks: seq
      }));
    } catch (__e) {
      var __m = (__e && __e.message) ? __e.message : String(__e);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        nrm: 'stream', phase: 'err', jobId: jobId, err: __m
      }));
    }
  })();
})();
true;
`;
}

function drainDecipherQueue(): void {
  if (streamDownloadActive || decipherBusy) return;
  if (decipherQueue.length === 0 || webView == null || !webReady) return;
  decipherBusy = true;
  const job = decipherQueue.shift()!;
  currentDecipherJob = job;
  try {
    webView.injectJavaScript(buildDecipherInject(job.code));
  } catch (e) {
    currentDecipherJob = null;
    decipherBusy = false;
    job.reject(e instanceof Error ? e : new Error(String(e)));
    drainDecipherQueue();
  }
}

async function waitForWebViewReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (webView != null && webReady) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(
    'YouTube WebView가 준비되지 않았습니다. 앱을 다시 시작해 보세요.',
  );
}

export async function waitForDecipherIdle(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!decipherBusy && decipherQueue.length === 0 && !streamDownloadActive) {
      return;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('YouTube WebView 작업 대기 시간이 초과되었습니다.');
}

export async function evalYoutubePlayerInWebView(
  code: string,
): Promise<NrmDecipherResult> {
  await waitForWebViewReady(12_000);
  return new Promise((resolve, reject) => {
    decipherQueue.push({ code, resolve, reject });
    drainDecipherQueue();
  });
}

/**
 * Chromium `fetch`로 googlevideo(등) 바이너리를 받아 `destUri`에 저장. 백엔드 불필요.
 */
export async function downloadMediaUrlViaWebView(
  fullUrl: string,
  destUri: string,
): Promise<void> {
  await waitForWebViewReady(15_000);
  await waitForDecipherIdle(15_000);
  if (webView == null) {
    throw new Error('WebView 없음');
  }

  const jobId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  streamWriteChain = Promise.resolve();

  return new Promise((resolve, reject) => {
    streamJob = {
      jobId,
      destUri,
      partPaths: {},
      nChunks: null,
      resolve,
      reject,
    };
    streamDownloadActive = true;
    try {
      webView!.injectJavaScript(buildStreamFetchInject(fullUrl, jobId));
    } catch (e) {
      streamDownloadActive = false;
      streamJob = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
