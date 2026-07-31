/**
 * Provider HTTP 진단 — 429 등 실패 시 확인된 사실(헤더/본문)과 쿼타 분류를 분리한다.
 * Grounding 추정 금지: 응답 quotaId/metric/본문에 검색·그라운딩 근거가 있을 때만 grounding.
 */

export type QuotaClass = 'grounding' | 'rpm' | 'tpm' | 'rpd' | 'unknown';

export type QuotaClassification = {
  quotaClass: QuotaClass;
  quotaId: string | null;
  quotaMetric: string | null;
  quotaEvidence: string | null;
  kindLabel: string;
};

export type ProviderHttpDiag = {
  responseHeaders: Record<string, string>;
  rateLimitHeaders: Record<string, string>;
  retryAfterHeader: string | null;
  providerRequestId: string | null;
  responseBodyText: string;
  quota: QuotaClassification;
};

const RESPONSE_BODY_MAX_429 = 32_000;
const RESPONSE_BODY_MAX_OTHER = 8_000;
/** 요청 body JSON 저장 상한(문자). 초과 시 system/contents 텍스트를 잘라 Truncated=true */
const REQUEST_BODY_SOFT_MAX_CHARS = 48_000;
const SYSTEM_TEXT_MAX = 12_000;
const PART_TEXT_MAX = 4_000;

export function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function pickRateLimitHeaders(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    const lk = k.toLowerCase();
    if (
      lk.includes('ratelimit') ||
      lk.includes('rate-limit') ||
      lk === 'retry-after' ||
      lk.startsWith('x-ratelimit') ||
      lk.includes('quota') ||
      lk === 'x-goog-request-id' ||
      lk === 'x-request-id' ||
      lk === 'x-guploader-uploadid' ||
      lk === 'x-groq-id'
    ) {
      out[k] = v;
    }
  }
  return out;
}

export function pickProviderRequestId(headers: Record<string, string>): string | null {
  const keys = [
    'x-goog-request-id',
    'x-request-id',
    'x-groq-id',
    'cf-ray',
  ];
  for (const want of keys) {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === want && v.trim()) return v.trim();
    }
  }
  return null;
}

export function pickRetryAfterHeader(headers: Record<string, string>): string | null {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'retry-after' && v.trim()) return v.trim();
  }
  return null;
}

function extractQuotaId(body: string): string | null {
  return body.match(/"quotaId"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
}

function extractQuotaMetric(body: string): string | null {
  return (
    body.match(/"quotaMetric"\s*:\s*"([^"]+)"/i)?.[1] ??
    body.match(/Quota exceeded for metric:\s*([^\s,]+)/i)?.[1] ??
    null
  );
}

/**
 * 응답 본문(+헤더 보조)만으로 쿼타 종류를 분류한다.
 * google_search 사용 여부만으로 grounding 추론하지 않는다.
 */
export function classifyQuotaFromResponse(
  httpStatus: number | null,
  responseBody: string,
  rateLimitHeaders?: Record<string, string>,
): QuotaClassification {
  if (httpStatus !== 429) {
    return {
      quotaClass: 'unknown',
      quotaId: null,
      quotaMetric: null,
      quotaEvidence: null,
      kindLabel: '이용 한도',
    };
  }

  const body = responseBody ?? '';
  const quotaId = extractQuotaId(body);
  const quotaMetric = extractQuotaMetric(body);
  const headerBlob = rateLimitHeaders
    ? Object.entries(rateLimitHeaders)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ')
    : '';
  const idMetric = `${quotaId ?? ''} ${quotaMetric ?? ''} ${headerBlob}`.toLowerCase();

  // 명시적 grounding/search 근거만 grounding
  if (
    /grounding|google_search|search_queries|websearch|web_search|search.?ground/i.test(idMetric) ||
    /grounding with google search|google.?search.?grounding/i.test(body)
  ) {
    const evidence = [
      quotaId ? `quotaId=${quotaId}` : null,
      quotaMetric ? `quotaMetric=${quotaMetric}` : null,
      /grounding|google_search|search_queries/i.test(body) ? 'body_mentions_search_grounding' : null,
    ]
      .filter(Boolean)
      .join('; ');
    return {
      quotaClass: 'grounding',
      quotaId,
      quotaMetric,
      quotaEvidence: evidence || 'search_grounding_markers',
      kindLabel: '웹 검색(그라운딩)',
    };
  }

  if (/perday|per_day|requestsperday/.test(idMetric)) {
    return {
      quotaClass: 'rpd',
      quotaId,
      quotaMetric,
      quotaEvidence: [quotaId && `quotaId=${quotaId}`, quotaMetric && `quotaMetric=${quotaMetric}`]
        .filter(Boolean)
        .join('; ') || 'id_metric_per_day',
      kindLabel: '하루 요청 횟수',
    };
  }
  if (/token/.test(idMetric) && /perminute|per_minute|tpm/.test(idMetric)) {
    return {
      quotaClass: 'tpm',
      quotaId,
      quotaMetric,
      quotaEvidence: [quotaId && `quotaId=${quotaId}`, quotaMetric && `quotaMetric=${quotaMetric}`]
        .filter(Boolean)
        .join('; ') || 'id_metric_tpm',
      kindLabel: '분당 토큰 사용량',
    };
  }
  if (/token/.test(idMetric)) {
    return {
      quotaClass: 'tpm',
      quotaId,
      quotaMetric,
      quotaEvidence: [quotaId && `quotaId=${quotaId}`, quotaMetric && `quotaMetric=${quotaMetric}`]
        .filter(Boolean)
        .join('; ') || 'id_metric_token',
      kindLabel: '분당 토큰 사용량',
    };
  }
  if (/perminute|per_minute|requestsperminute/.test(idMetric)) {
    return {
      quotaClass: 'rpm',
      quotaId,
      quotaMetric,
      quotaEvidence: [quotaId && `quotaId=${quotaId}`, quotaMetric && `quotaMetric=${quotaMetric}`]
        .filter(Boolean)
        .join('; ') || 'id_metric_rpm',
      kindLabel: '분당 요청 횟수',
    };
  }

  const blob = body.toLowerCase();
  if (/tokens per day|\btpd\b|per day.*token|token.*per day/i.test(blob)) {
    return {
      quotaClass: 'rpd',
      quotaId,
      quotaMetric,
      quotaEvidence: 'body_tokens_per_day',
      kindLabel: '하루 요청 횟수',
    };
  }
  if (/tokens per minute|\btpm\b|request too large/.test(blob)) {
    return {
      quotaClass: 'tpm',
      quotaId,
      quotaMetric,
      quotaEvidence: 'body_tokens_per_minute',
      kindLabel: '분당 토큰 사용량',
    };
  }
  if (/perday|per_day|requestsperday/.test(blob)) {
    return {
      quotaClass: 'rpd',
      quotaId,
      quotaMetric,
      quotaEvidence: 'body_per_day',
      kindLabel: '하루 요청 횟수',
    };
  }
  if (/perminute|per_minute|requestsperminute/.test(blob)) {
    return {
      quotaClass: 'rpm',
      quotaId,
      quotaMetric,
      quotaEvidence: 'body_per_minute',
      kindLabel: '분당 요청 횟수',
    };
  }

  if (/generate_content_free_tier_requests/i.test(body)) {
    const limitRaw =
      body.match(/limit:\s*([0-9]+)/i)?.[1] ?? body.match(/"quotaValue"\s*:\s*"([0-9]+)"/i)?.[1];
    const limit = limitRaw != null ? Number(limitRaw) : null;
    if (limit != null && Number.isFinite(limit) && limit <= 10) {
      return {
        quotaClass: 'rpm',
        quotaId,
        quotaMetric,
        quotaEvidence: `generate_content_free_tier_requests;limit=${limit}`,
        kindLabel: '분당 요청 횟수',
      };
    }
    return {
      quotaClass: 'rpd',
      quotaId,
      quotaMetric,
      quotaEvidence: `generate_content_free_tier_requests;limit=${limit ?? 'n/a'}`,
      kindLabel: '하루 요청 횟수',
    };
  }

  return {
    quotaClass: 'unknown',
    quotaId,
    quotaMetric,
    quotaEvidence: null,
    kindLabel: 'Unknown Quota',
  };
}

export function buildProviderHttpDiag(
  res: Response,
  bodyText: string,
): ProviderHttpDiag {
  const responseHeaders = headersToRecord(res.headers);
  const rateLimitHeaders = pickRateLimitHeaders(responseHeaders);
  const retryAfterHeader = pickRetryAfterHeader(responseHeaders);
  const providerRequestId = pickProviderRequestId(responseHeaders);
  const max = res.status === 429 ? RESPONSE_BODY_MAX_429 : RESPONSE_BODY_MAX_OTHER;
  const responseBodyText = (bodyText ?? '').slice(0, max);
  const quota = classifyQuotaFromResponse(res.status, responseBodyText, rateLimitHeaders);
  return {
    responseHeaders,
    rateLimitHeaders,
    retryAfterHeader,
    providerRequestId,
    responseBodyText,
    quota,
  };
}

function truncateText(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: `${s.slice(0, max)}…[truncated ${s.length - max} chars]`, truncated: true };
}

function truncateRequestBodyForStorage(
  body: Record<string, unknown>,
): { json: Record<string, unknown>; truncated: boolean } {
  let truncated = false;
  // deep-ish clone via JSON (request body is plain JSON-serializable)
  const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;

  const sys = cloned.systemInstruction as
    | { parts?: Array<{ text?: string }> }
    | undefined;
  if (sys?.parts) {
    for (const p of sys.parts) {
      if (typeof p.text === 'string') {
        const t = truncateText(p.text, SYSTEM_TEXT_MAX);
        p.text = t.text;
        if (t.truncated) truncated = true;
      }
    }
  }

  const contents = cloned.contents;
  if (Array.isArray(contents)) {
    for (const turn of contents) {
      if (!turn || typeof turn !== 'object') continue;
      const parts = (turn as { parts?: unknown }).parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue;
        const p = part as { text?: string };
        if (typeof p.text === 'string') {
          const t = truncateText(p.text, PART_TEXT_MAX);
          p.text = t.text;
          if (t.truncated) truncated = true;
        }
      }
    }
  }

  // Groq-style messages[]
  const messages = cloned.messages;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (!m || typeof m !== 'object') continue;
      const msg = m as { content?: unknown };
      if (typeof msg.content === 'string') {
        const t = truncateText(msg.content, PART_TEXT_MAX);
        msg.content = t.text;
        if (t.truncated) truncated = true;
      }
    }
  }

  let jsonStr = JSON.stringify(cloned);
  if (jsonStr.length > REQUEST_BODY_SOFT_MAX_CHARS) {
    truncated = true;
    // 최후: systemInstruction 전체 축소
    if (sys?.parts?.[0] && typeof sys.parts[0].text === 'string') {
      sys.parts[0].text = truncateText(sys.parts[0].text, 4_000).text;
    }
    jsonStr = JSON.stringify(cloned);
    if (jsonStr.length > REQUEST_BODY_SOFT_MAX_CHARS) {
      return {
        json: {
          _truncated: true,
          _note: `request body ${jsonStr.length} chars exceeded soft max; stored generationConfig+tools only`,
          generationConfig: cloned.generationConfig ?? null,
          tools: cloned.tools ?? null,
          model: cloned.model ?? null,
          contentsTurnCount: Array.isArray(cloned.contents) ? cloned.contents.length : null,
          messagesCount: Array.isArray(cloned.messages) ? cloned.messages.length : null,
        },
        truncated: true,
      };
    }
  }

  return { json: cloned, truncated };
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type RequestBodySnapshot = {
  /** 실패·검색 시도에서만 채움 */
  requestBodyJson: Record<string, unknown> | null;
  requestBodySha256: string;
  requestBodyBytes: number;
  requestBodyTruncated: boolean;
};

/**
 * 실무 효율: 전체 원문 해시+바이트는 항상, JSON 본문은 호출자가 shouldPersistJson=true일 때만.
 * (성공 plain 은 JSON 생략 → 테이블 비대 방지)
 */
export async function snapshotRequestBody(
  body: Record<string, unknown>,
  shouldPersistJson: boolean,
): Promise<RequestBodySnapshot> {
  const full = JSON.stringify(body);
  const sha256 = await sha256Hex(full);
  const bytes = full.length;
  if (!shouldPersistJson) {
    return {
      requestBodyJson: null,
      requestBodySha256: sha256,
      requestBodyBytes: bytes,
      requestBodyTruncated: false,
    };
  }
  const { json, truncated } = truncateRequestBodyForStorage(body);
  return {
    requestBodyJson: json,
    requestBodySha256: sha256,
    requestBodyBytes: bytes,
    requestBodyTruncated: truncated,
  };
}

/** 요청에 tools / google_search 포함 여부(사실) */
export function detectToolsInRequestBody(body: Record<string, unknown>): {
  withTools: boolean;
  withGoogleSearch: boolean;
} {
  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    return { withTools: false, withGoogleSearch: false };
  }
  let withGoogleSearch = false;
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    // Legacy generateContent: { google_search: {} }
    if (o.google_search != null) withGoogleSearch = true;
    // Interactions API: { type: "google_search" }
    if (o.type === 'google_search') withGoogleSearch = true;
    if (o.type === 'browser_search') withGoogleSearch = true;
    if (Array.isArray(o.functionDeclarations) || Array.isArray(o.function_declarations)) {
      // download FC 등 (Legacy)
    }
    if (o.type === 'function') {
      // Interactions custom function tool
    }
  }
  return { withTools: true, withGoogleSearch };
}

const TOOL_LOG_SOFT_MAX_CHARS = 32_000;

/**
 * 성공 plain은 JSON 생략. 실패·웹검색·다운로드 tools·응답 FC 가 있으면 RequestBodyJson 보관.
 */
export function shouldPersistRequestBodyJson(opts: {
  ok: boolean;
  withSearch: boolean;
  withTools: boolean;
  hasFunctionCalls: boolean;
}): boolean {
  return !opts.ok || opts.withSearch || opts.withTools || opts.hasFunctionCalls;
}

function softTruncateJsonValue(value: unknown, maxChars: number): unknown {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return value;
  return {
    _truncated: true,
    _note: `json ${raw.length} chars exceeded soft max ${maxChars}`,
    preview: raw.slice(0, Math.min(4_000, maxChars)),
  };
}

/** LLM 응답 function call → DB FunctionCallsJson */
export function compactFunctionCallsForLog(
  calls: Array<{ callId?: string; name: string; args?: Record<string, unknown> }>,
): Array<{ callId: string | null; name: string; args: unknown }> | null {
  if (!Array.isArray(calls) || calls.length === 0) return null;
  const rows = calls.map((c) => ({
    callId: typeof c.callId === 'string' && c.callId.trim() ? c.callId : null,
    name: String(c.name ?? ''),
    args: softTruncateJsonValue(
      c.args && typeof c.args === 'object' && !Array.isArray(c.args) ? c.args : {},
      TOOL_LOG_SOFT_MAX_CHARS,
    ),
  }));
  return rows;
}

/** toolContinue 클라이언트 실행 결과 → DB ToolResultsJson */
export function compactToolResultsForLog(
  results: Array<{
    callId?: string;
    name: string;
    args?: Record<string, unknown>;
    response?: Record<string, unknown>;
  }>,
): Array<{ callId: string | null; name: string; args: unknown; response: unknown }> | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.map((r) => ({
    callId: typeof r.callId === 'string' && r.callId.trim() ? r.callId : null,
    name: String(r.name ?? ''),
    args: softTruncateJsonValue(
      r.args && typeof r.args === 'object' && !Array.isArray(r.args) ? r.args : {},
      TOOL_LOG_SOFT_MAX_CHARS,
    ),
    response: softTruncateJsonValue(
      r.response && typeof r.response === 'object' && !Array.isArray(r.response)
        ? r.response
        : {},
      TOOL_LOG_SOFT_MAX_CHARS,
    ),
  }));
}
