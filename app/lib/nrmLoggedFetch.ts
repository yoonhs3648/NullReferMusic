import { appendNrmFileLog } from '@/lib/nrmFileLog';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { isNrmFileLoggingActive } from '@/lib/nrmFileLoggingRuntime';

const MAX_BODY_LOG = 8_000;
const FAILURE_PAD = '\n\n\n';

function clip(text: string, max = MAX_BODY_LOG): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…(truncated ${t.length - max} chars)`;
}

function headerSnapshot(init?: RequestInit): string {
  try {
    const h = new Headers(init?.headers ?? undefined);
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key === 'authorization') {
        out[k] = v.trim().length > 12 ? `${v.slice(0, 8)}…` : '(set)';
      } else {
        out[k] = v;
      }
    });
    return JSON.stringify(out);
  } catch {
    return '{}';
  }
}

async function readResponseSnippet(res: Response): Promise<string> {
  try {
    const clone = res.clone();
    const text = await clone.text();
    return clip(text);
  } catch {
    return '(response body unreadable)';
  }
}

export function logNrmFailureBanner(
  tag: string,
  title: string,
  detail: string,
): void {
  if (!isNrmFileLoggingActive()) return;
  const block = [
    FAILURE_PAD,
    '████████████████████████████████████████',
    '██  FAILURE',
    `██  ${title}`,
    '████████████████████████████████████████',
    detail,
    '████████████████████████████████████████',
    FAILURE_PAD,
  ].join('\n');
  appendNrmFileLog(tag, 'error', block);
  logNrmRunError(tag, new Error(title), { detail: clip(detail, 2000) });
}

type LoggedFetchOptions = {
  tag: string;
};

/** 모든 HTTP API 요청·응답 파일 로깅 (사용자 토글 on일 때만) */
export async function nrmLoggedFetch(
  url: string,
  init?: RequestInit,
  options?: LoggedFetchOptions,
): Promise<Response> {
  const tag = options?.tag?.trim() || 'api';
  const method = (init?.method ?? 'GET').toUpperCase();
  const t0 = Date.now();

  if (isNrmFileLoggingActive()) {
    appendNrmFileLog(
      tag,
      'info',
      JSON.stringify({
        event: 'request',
        method,
        url,
        headers: headerSnapshot(init),
        body: typeof init?.body === 'string' ? clip(init.body, 2000) : undefined,
      }),
    );
  }

  try {
    const res = await fetch(url, init);
    const elapsedMs = Date.now() - t0;

    if (isNrmFileLoggingActive()) {
      const bodySnippet = await readResponseSnippet(res);
      appendNrmFileLog(
        tag,
        res.ok ? 'info' : 'error',
        JSON.stringify({
          event: 'response',
          method,
          url,
          status: res.status,
          ok: res.ok,
          elapsedMs,
          body: bodySnippet,
        }),
      );
      if (!res.ok) {
        logNrmFailureBanner(
          tag,
          `HTTP ${res.status} ${method} ${url}`,
          `elapsedMs=${elapsedMs}\nbody=${bodySnippet}`,
        );
      }
    }

    return res;
  } catch (e) {
    const elapsedMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    if (isNrmFileLoggingActive()) {
      logNrmFailureBanner(
        tag,
        `NETWORK ${method} ${url}`,
        `elapsedMs=${elapsedMs}\nerror=${msg}`,
      );
    }
    throw e;
  }
}

/** 외부 API 직접 fetch (백엔드 프록시 없음) */
export function nrmDirectFetch(
  url: string,
  init?: RequestInit,
  tag = 'api',
): Promise<Response> {
  return nrmLoggedFetch(url, init, { tag });
}
