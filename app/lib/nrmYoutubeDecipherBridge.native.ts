/**
 * 숨김 WebView: (1) 플레이어 복호화 new Function (2) googlevideo 미디어 fetch
 * — RN fetch/downloadAsync 와 다른 Chromium 스택이라 403 회피에 도움이 될 수 있음.
 * 백그라운드(AppState !== active)에서는 WebView를 쓰지 않는다 — Activity 없으면 hang.
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';
import { AppState, NativeModules } from 'react-native';

type NrmAudioMetaNative = {
  concatFiles?: (parts: string[], dest: string) => Promise<void>;
};

export type NrmDecipherResult = { n?: string; sig?: string };

type InjectedWebView = {
  injectJavaScript: (script: string) => void;
};

type DecipherJob = {
  code: string;
  resolve: (v: NrmDecipherResult) => void;
  reject: (e: Error) => void;
};

/** googlevideo WebView 스트림 — innertube 추출 타임아웃보다 짧게 두어 hang 시 빠른 abort */
export const NRM_GOOGLEVIDEO_WEBVIEW_TIMEOUT_MS = 45_000;

export type WebViewMediaDownloadOptions = {
  isCancelled?: () => boolean;
  /** wall-clock 기준 절대 시각(ms). 없으면 timeoutMs만 사용 */
  deadlineMs?: number;
  timeoutMs?: number;
};

type StreamJob = {
  jobId: string;
  destUri: string;
  partPaths: Record<number, string>;
  nChunks: number | null;
  resolve: () => void;
  reject: (e: Error) => void;
  cancelWatch?: () => void;
};

const decipherQueue: DecipherJob[] = [];
let webView: InjectedWebView | null = null;
let webReady = false;
let decipherBusy = false;
let currentDecipherJob: DecipherJob | null = null;

let streamDownloadActive = false;
let streamJob: StreamJob | null = null;
let streamWriteChain: Promise<void> = Promise.resolve();

// ── 레이지 마운트 ──────────────────────────────────────────────────────────────
let requestDecipherMountFn: (() => void) | null = null;
let releaseDecipherMountFn: (() => void) | null = null;
let decipherIdleTimer: ReturnType<typeof setTimeout> | null = null;
/** 다운로드·복호화 완료 후 이 시간만큼 idle이면 WebView를 언마운트 */
const DECIPHER_IDLE_UNMOUNT_MS = 3 * 60 * 1000; // 3분

export function registerDecipherWebViewCallbacks(
  requestMount: (() => void) | null,
  releaseMount: (() => void) | null,
): void {
  requestDecipherMountFn = requestMount;
  releaseDecipherMountFn = releaseMount;
}

function requestDecipherMount(): void {
  if (decipherIdleTimer !== null) {
    clearTimeout(decipherIdleTimer);
    decipherIdleTimer = null;
  }
  requestDecipherMountFn?.();
}

function scheduleDecipherIdleUnmount(): void {
  if (decipherIdleTimer !== null) clearTimeout(decipherIdleTimer);
  decipherIdleTimer = setTimeout(() => {
    decipherIdleTimer = null;
    if (!decipherBusy && !streamDownloadActive && decipherQueue.length === 0) {
      releaseDecipherMountFn?.();
    }
  }, DECIPHER_IDLE_UNMOUNT_MS);
}

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
  const mod = NativeModules.NrmAudioMetadata as NrmAudioMetaNative | undefined;
  if (mod?.concatFiles) {
    await mod.concatFiles(partUris, destUri);
    return;
  }
  // JS base64 폴백 (네이티브 모듈 미사용 환경)
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
        job.cancelWatch?.();
        job.resolve();
        drainDecipherQueue();
      })
      .catch((e) => {
        streamDownloadActive = false;
        cleanupStreamParts(job);
        FileSystem.deleteAsync(job.destUri, { idempotent: true }).catch(() => {});
        streamJob = null;
        job.cancelWatch?.();
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
      job.cancelWatch?.();
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
  var aborted = false;
  window.__nrmStreamAbort = function() { aborted = true; };
  (async function() {
    try {
      if (aborted) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          nrm: 'stream', phase: 'err', jobId: jobId, err: 'aborted'
        }));
        return;
      }
      var res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'X-YouTube-Client-Name': '5',
          'X-YouTube-Client-Version': '19.29.1'
        },
        credentials: 'include'
      });
      if (aborted) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          nrm: 'stream', phase: 'err', jobId: jobId, err: 'aborted'
        }));
        return;
      }
      if (!res.ok) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          nrm: 'stream', phase: 'err', jobId: jobId, http: res.status
        }));
        return;
      }
      var buf = await res.arrayBuffer();
      if (aborted) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          nrm: 'stream', phase: 'err', jobId: jobId, err: 'aborted'
        }));
        return;
      }
      var u8 = new Uint8Array(buf);
      var CHUNK = 262144;
      var seq = 0;
      for (var i = 0; i < u8.length; i += CHUNK) {
        if (aborted) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            nrm: 'stream', phase: 'err', jobId: jobId, err: 'aborted'
          }));
          return;
        }
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
    } finally {
      if (window.__nrmStreamAbort) delete window.__nrmStreamAbort;
    }
  })();
})();
true;
`;
}

function rejectStreamJob(job: StreamJob, message: string): void {
  streamDownloadActive = false;
  cleanupStreamParts(job);
  FileSystem.deleteAsync(job.destUri, { idempotent: true }).catch(() => {});
  streamJob = null;
  job.cancelWatch?.();
  job.reject(new Error(message));
  drainDecipherQueue();
}

/** 진행 중 WebView googlevideo 스트림 강제 중단 */
export function cancelActiveStreamDownload(reason = 'cancelled'): void {
  if (!streamJob || !streamDownloadActive) return;
  const job = streamJob;
  try {
    webView?.injectJavaScript(
      `(function(){ if(window.__nrmStreamAbort) window.__nrmStreamAbort(); })(); true;`,
    );
  } catch {
    /* inject 실패 시 아래 reject로 정리 */
  }
  rejectStreamJob(job, `stream_cancelled:${reason}`);
}

function cancelActiveDecipherWork(reason = 'cancelled'): void {
  if (currentDecipherJob) {
    const job = currentDecipherJob;
    currentDecipherJob = null;
    decipherBusy = false;
    job.reject(new Error(`decipher_cancelled:${reason}`));
  }
  while (decipherQueue.length > 0) {
    const job = decipherQueue.shift()!;
    job.reject(new Error(`decipher_cancelled:${reason}`));
  }
  drainDecipherQueue();
}

/** innertube 추출 타임아웃·취소 시 orphan WebView 작업 정리 */
export function cancelActiveInnertubeExtractions(reason = 'timeout'): void {
  cancelActiveStreamDownload(reason);
  cancelActiveDecipherWork(reason);
}

function armStreamDownloadWatchdog(
  job: StreamJob,
  options?: WebViewMediaDownloadOptions,
): () => void {
  const isCancelled = options?.isCancelled ?? (() => false);
  const deadlineMs =
    options?.deadlineMs ??
    (options?.timeoutMs != null ? Date.now() + options.timeoutMs : null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;

  const fire = (why: string) => {
    if (streamJob !== job) return;
    cancelActiveStreamDownload(why);
  };

  if (deadlineMs != null) {
    const msLeft = Math.max(0, deadlineMs - Date.now());
    timer = setTimeout(() => fire('timeout'), msLeft);
    interval = setInterval(() => {
      if (Date.now() >= deadlineMs) fire('timeout');
      if (isCancelled()) fire('cancelled');
    }, 500);
  } else if (options?.timeoutMs != null) {
    timer = setTimeout(() => fire('timeout'), options.timeoutMs);
    interval = setInterval(() => {
      if (isCancelled()) fire('cancelled');
    }, 500);
  } else {
    interval = setInterval(() => {
      if (isCancelled()) fire('cancelled');
    }, 500);
  }

  return () => {
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
  };
}

function drainDecipherQueue(): void {
  if (streamDownloadActive || decipherBusy) return;
  if (decipherQueue.length === 0 || webView == null || !webReady) {
    // 대기 중인 작업이 없고 idle → WebView 유지 불필요, 언마운트 예약
    if (!streamDownloadActive && !decipherBusy && decipherQueue.length === 0) {
      scheduleDecipherIdleUnmount();
    }
    return;
  }
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

function assertWebViewAllowedInForeground(kind: 'decipher' | 'download'): void {
  if (AppState.currentState === 'active') return;
  throw new Error(
    kind === 'decipher'
      ? 'WEBVIEW_DECIPHER_BACKGROUND_FORBIDDEN'
      : 'WEBVIEW_DOWNLOAD_BACKGROUND_FORBIDDEN',
  );
}

/** 포그라운드에서만 WebView decipher/다운로드 허용 */
export function isYoutubeWebViewAllowed(): boolean {
  return AppState.currentState === 'active';
}

export async function evalYoutubePlayerInWebView(
  code: string,
): Promise<NrmDecipherResult> {
  assertWebViewAllowedInForeground('decipher');
  requestDecipherMount();
  await waitForWebViewReady(12_000);
  assertWebViewAllowedInForeground('decipher');
  return new Promise((resolve, reject) => {
    decipherQueue.push({ code, resolve, reject });
    drainDecipherQueue();
  });
}

/**
 * Chromium `fetch`로 googlevideo(등) 바이너리를 받아 `destUri`에 저장. 백엔드 불필요.
 * 백그라운드에서는 호출하지 말 것 (네이티브 downloadAsync 경로 사용).
 */
export async function downloadMediaUrlViaWebView(
  fullUrl: string,
  destUri: string,
  options?: WebViewMediaDownloadOptions,
): Promise<void> {
  assertWebViewAllowedInForeground('download');
  requestDecipherMount();
  await waitForWebViewReady(15_000);
  await waitForDecipherIdle(15_000);
  assertWebViewAllowedInForeground('download');
  if (webView == null) {
    throw new Error('WebView 없음');
  }

  const jobId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  streamWriteChain = Promise.resolve();

  return new Promise((resolve, reject) => {
    const job: StreamJob = {
      jobId,
      destUri,
      partPaths: {},
      nChunks: null,
      resolve: () => {
        job.cancelWatch?.();
        resolve();
      },
      reject: (e) => {
        job.cancelWatch?.();
        reject(e);
      },
    };
    streamJob = job;
    streamDownloadActive = true;
    job.cancelWatch = armStreamDownloadWatchdog(job, options);
    try {
      webView!.injectJavaScript(buildStreamFetchInject(fullUrl, jobId));
    } catch (e) {
      streamDownloadActive = false;
      streamJob = null;
      job.cancelWatch?.();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
