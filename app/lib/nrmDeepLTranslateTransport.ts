import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getResolvedApiBaseUrl, normalizeApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  chunkLrcLinesForDeepL,
  DEEPL_INTER_REQUEST_DELAY_MS,
  DEEPL_RETRY_BASE_MS,
  DEEPL_TRANSLATE_MAX_RETRIES,
  type DeepLTranslateTextsOutcome,
  estimateTranslateJsonBytes,
  isRetryableDeepLError,
  sleepMs,
} from '@/lib/nrmDeepLTranslateBatch';
import { isNativeDeepLTranslateAvailable, translateTextsViaNative } from '@/lib/nrmDeepLNative';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';

const DEEPL_FREE_API = 'https://api-free.deepl.com/v2';
const DEEPL_PRO_API = 'https://api.deepl.com/v2';
/** 배치 1회 HTTP (연결+읽기) 상한 */
const DEEPL_BATCH_TIMEOUT_MS = 120_000;

type DeepLTranslateJsonResponse = {
  translations?: Array<{ text?: string }>;
};

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: `DeepL-Auth-Key ${apiKey.trim()}` };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('DeepL 요청 시간이 초과되었습니다.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseTranslateJson(body: string, expectedCount: number): string[] {
  const json = JSON.parse(body) as DeepLTranslateJsonResponse;
  const arr = json.translations ?? [];
  const out: string[] = [];
  for (let i = 0; i < expectedCount; i++) {
    out.push((arr[i]?.text ?? '').trim());
  }
  return out;
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'DeepL API 토큰이 올바르지 않습니다.';
  if (status === 456 || status === 429) return 'DeepL 사용량이 초과되었습니다.';
  if (status === 413) return 'DeepL 요청 본문이 너무 큽니다.';
  return 'DeepL 번역 요청에 실패했습니다.';
}

async function translateOneBatchDirect(
  apiKey: string,
  texts: string[],
): Promise<{ texts: string[]; apiUsed: 'free' | 'pro' }> {
  const payload = JSON.stringify({
    text: texts,
    target_lang: 'KO',
    // source_lang 생략 → DeepL 자동 감지
    preserve_formatting: true,
    split_sentences: 'nonewlines',
  });
  const headers = {
    ...authHeader(apiKey),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': `NullReferenceMusic/${Constants.expoConfig?.version ?? '1.0'}`,
  };
  let res = await fetchWithTimeout(
    `${DEEPL_FREE_API}/translate`,
    { method: 'POST', headers, body: payload },
    DEEPL_BATCH_TIMEOUT_MS,
  );
  let apiUsed: 'free' | 'pro' = 'free';
  if (res.status === 403 || res.status === 404) {
    apiUsed = 'pro';
    res = await fetchWithTimeout(
      `${DEEPL_PRO_API}/translate`,
      { method: 'POST', headers, body: payload },
      DEEPL_BATCH_TIMEOUT_MS,
    );
  }
  if (!res.ok) {
    const err = new Error(httpErrorMessage(res.status)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const raw = await res.text();
  return { texts: parseTranslateJson(raw, texts.length), apiUsed };
}

async function translateOneBatchBackend(
  apiKey: string,
  texts: string[],
  baseUrl: string,
): Promise<{ texts: string[]; apiUsed: 'free' | 'pro' }> {
  const res = await nrmBackendFetch(`${baseUrl}/api/deepl/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apiKey: apiKey.trim(), texts }),
  });
  if (!res.ok) {
    const err = new Error(httpErrorMessage(res.status)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as {
    translations?: Array<{ text?: string }>;
    apiUsed?: string;
  };
  const out = (json.translations ?? []).map((t) => (t.text ?? '').trim());
  while (out.length < texts.length) out.push('');
  return {
    texts: out.slice(0, texts.length),
    apiUsed: json.apiUsed === 'pro' ? 'pro' : 'free',
  };
}

async function canUseBackendDeepLProxy(): Promise<string | null> {
  const base = normalizeApiBaseUrl(await getResolvedApiBaseUrl());
  if (!base) return null;
  if (Platform.OS === 'web') return base;
  if (!usesPcBackendInDev()) return null;
  if (Constants.isDevice && /localhost|127\.0\.0\.1/i.test(base)) return null;
  return base;
}

type BatchTransport = 'native' | 'direct' | 'backend';

async function translateOneBatchWithRetry(
  apiKey: string,
  texts: string[],
  transport: BatchTransport,
  backendBase: string | null,
): Promise<{ texts: string[]; apiUsed: 'free' | 'pro' }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DEEPL_TRANSLATE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleepMs(DEEPL_RETRY_BASE_MS * attempt);
    }
    try {
      if (transport === 'native') {
        return await translateTextsViaNative(apiKey, texts);
      }
      if (transport === 'backend' && backendBase) {
        return await translateOneBatchBackend(apiKey, texts, backendBase);
      }
      return await translateOneBatchDirect(apiKey, texts);
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number }).status;
      if (attempt < DEEPL_TRANSLATE_MAX_RETRIES && (status == null || isRetryableDeepLError(status))) {
        logNrmDev('lyrics.translate', {
          event: 'deepl_batch_retry',
          transport,
          attempt: attempt + 1,
          status: status ?? null,
        });
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function translateAllChunks(
  apiKey: string,
  texts: string[],
  primaryTransport: BatchTransport,
  backendBase: string | null,
): Promise<{ texts: string[]; apiUsed: 'free' | 'pro'; transport: string }> {
  const chunks = chunkLrcLinesForDeepL(texts);
  const merged: string[] = [];
  let apiUsed: 'free' | 'pro' = 'free';
  let transportUsed = primaryTransport;

  for (let ci = 0; ci < chunks.length; ci++) {
    if (ci > 0) {
      await sleepMs(DEEPL_INTER_REQUEST_DELAY_MS);
    }
    const chunk = chunks[ci];
    logNrmDev('lyrics.translate', {
      event: 'deepl_batch_start',
      transport: primaryTransport,
      chunkIndex: ci,
      chunkCount: chunks.length,
      lineCount: chunk.length,
      mode: 'lyric_text_only',
      estBytes: estimateTranslateJsonBytes(chunk),
    });
    const batchT0 = Date.now();
    let batch: { texts: string[]; apiUsed: 'free' | 'pro' };
    try {
      batch = await translateOneBatchWithRetry(apiKey, chunk, primaryTransport, backendBase);
    } catch (primaryErr) {
      if (primaryTransport === 'direct' && backendBase) {
        logNrmDev('lyrics.translate', {
          event: 'deepl_direct_fail_try_backend',
          chunkIndex: ci,
        });
        batch = await translateOneBatchWithRetry(apiKey, chunk, 'backend', backendBase);
        transportUsed = 'backend';
      } else if (primaryTransport === 'native') {
        logNrmDev('lyrics.translate', {
          event: 'deepl_native_fail_try_direct',
          chunkIndex: ci,
        });
        batch = await translateOneBatchWithRetry(apiKey, chunk, 'direct', backendBase);
        transportUsed = 'direct';
      } else {
        throw primaryErr;
      }
    }
    if (batch.texts.length !== chunk.length) {
      throw new Error('DeepL 번역 결과 개수가 요청과 일치하지 않습니다.');
    }
    merged.push(...batch.texts);
    if (batch.apiUsed === 'pro') apiUsed = 'pro';
    logNrmDev('lyrics.translate', {
      event: 'deepl_batch_ok',
      transport: transportUsed,
      chunkIndex: ci,
      elapsedMs: Date.now() - batchT0,
    });
  }

  return { texts: merged, apiUsed, transport: transportUsed };
}

/** LRC 가사 줄 텍스트 배열을 DeepL로 번역 (플랫폼 transport 자동 선택) */
export async function translateTextsWithDeepL(
  apiKey: string,
  texts: string[],
): Promise<DeepLTranslateTextsOutcome> {
  const key = apiKey.trim();
  if (!key) {
    return { ok: false, message: 'API 토큰을 먼저 등록해주세요.' };
  }
  if (texts.length === 0) {
    return { ok: true, texts: [], transport: 'none', apiUsed: 'free' };
  }

  const backendBase = await canUseBackendDeepLProxy();
  let primary: BatchTransport = 'direct';
  if (isNativeDeepLTranslateAvailable()) {
    primary = 'native';
  } else if (Platform.OS === 'web' && backendBase) {
    primary = 'backend';
  }

  const t0 = Date.now();
  logNrmDev('lyrics.translate', {
    event: 'deepl_translate_start',
    primaryTransport: primary,
    textCount: texts.length,
    chunkCount: chunkLrcLinesForDeepL(texts).length,
    mode: 'lyric_text_only',
    hasBackend: !!backendBase,
  });

  try {
    const out = await translateAllChunks(key, texts, primary, backendBase);
    logNrmDev('lyrics.translate', {
      event: 'deepl_translate_ok',
      transport: out.transport,
      apiUsed: out.apiUsed,
      elapsedMs: Date.now() - t0,
      textCount: texts.length,
    });
    return {
      ok: true,
      texts: out.texts,
      transport: out.transport,
      apiUsed: out.apiUsed,
    };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message.includes('시간이 초과')
          ? e.message
          : e.message || 'DeepL 서버와 통신할 수 없습니다.'
        : 'DeepL 서버와 통신할 수 없습니다.';
    logNrmRunError('lyrics.translate', e, {
      event: 'deepl_translate_fail',
      primaryTransport: primary,
      elapsedMs: Date.now() - t0,
      message,
    });
    return { ok: false, message, transport: primary };
  }
}
