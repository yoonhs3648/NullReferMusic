import { NativeModules } from 'react-native';

export const NRM_YOUTUBE_HTTP_CONNECT_TIMEOUT_MS = 15_000;

type YoutubeHttpFetchResult = {
  status: number;
  body: string;
  headers: Record<string, string>;
};

type NrmBackgroundWorkHttp = {
  youtubeHttpFetch?: (
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | null,
    connectTimeoutMs: number,
    readTimeoutMs: number,
  ) => Promise<YoutubeHttpFetchResult>;
};

const mod = NativeModules.NrmBackgroundWork as NrmBackgroundWorkHttp | undefined;

export function isNativeYoutubeHttpFetchAvailable(): boolean {
  return !!mod?.youtubeHttpFetch;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function readFetchBody(init?: RequestInit, input?: RequestInfo | URL): Promise<string | null> {
  const raw =
    init?.body ??
    (input instanceof Request && input.body != null ? input.body : undefined);
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    return new TextDecoder().decode(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    );
  }
  if (typeof Blob !== 'undefined' && raw instanceof Blob) {
    return raw.text();
  }
  return null;
}

function resolveMethod(init?: RequestInit, input?: RequestInfo | URL): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function mergeHeaders(init?: RequestInit, input?: RequestInfo | URL): Headers {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  return headers;
}

/** innertube API 전용 — Kotlin HttpURLConnection (readTimeout) */
export async function youtubeHttpFetchNative(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  readTimeoutMs: number,
): Promise<Response> {
  if (!mod?.youtubeHttpFetch) {
    throw new Error('NATIVE_YT_HTTP_UNAVAILABLE');
  }
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = resolveMethod(init, input);
  const headers = mergeHeaders(init, input);
  const body = await readFetchBody(init, input);
  const readMs = Math.max(1_000, readTimeoutMs);
  const result = await mod.youtubeHttpFetch(
    url,
    method,
    headersToRecord(headers),
    body,
    NRM_YOUTUBE_HTTP_CONNECT_TIMEOUT_MS,
    readMs,
  );
  const respHeaders = new Headers(result.headers);
  return new Response(result.body, {
    status: result.status,
    headers: respHeaders,
  });
}

export function isYoutubeHttpTimeoutError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.message.includes('E_YT_HTTP_TIMEOUT') ||
    e.message.includes('socket_timeout') ||
    e.message.toLowerCase().includes('timeout')
  );
}
