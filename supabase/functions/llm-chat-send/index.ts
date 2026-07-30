// AI Lab 채팅 전송 Edge Function.
//
// APK 클라이언트는 이 함수만 호출한다. LLMProvider.ApiKey는 이 함수(서버사이드,
// service_role) 안에서만 읽고 절대 클라이언트로 내려주지 않는다.
//
// 스키마 정규화(2026-07-22): 예전엔 "LLMProvider" 테이블이 실제로는 "모델" 목록이었고
// (모델마다 ApiKey를 중복 보유) 클라이언트가 고르는 값도 그 테이블의 PK였다. 지금은
// "LLMModel"(모델, ProviderID로 제공자 참조) + "LLMProvider"(제공자, ApiKey 보유)로
// 나뉘어 있다 — 클라이언트는 여전히 "모델"을 고르고 `modelId`로 보내며, 이 함수가
// LLMModel→LLMProvider join으로 apiKey/providerName을 얻는다. 권한(LLMUserPermission)·
// 월간 사용량(LLMUserQuota)은 모델 단위가 아니라 "제공자" 단위로 관리된다(providerId).
//
// 흐름 (Agent 파이프라인, 2026-07-24):
//   1) nrm_rpc_chat_prepare_turn — 세션+유저메시지+provider/permission/quota/history
//   2) Intent Classifier (Gemini Flash Lite) → needSearch / needDownloadTools / needVector / needFaq
//      (실패 시 휴리스틱 폴백). FAQ·VectorDB Context Collector는 스텁(확장 포인트).
//   3) 모듈형 System Prompt 조립 + 메인 LLM 스트리밍 (도구 모드는 Intent가 결정)
//      — 사용자 검색 토글·다운로드 정규식 휴리스틱 제거
//   4) nrm_rpc_chat_finalize_turn + waitUntil quota
//
// NDJSON 스트리밍 프로토콜 (한 줄에 JSON 객체 하나, Content-Type: application/x-ndjson):
//   {"type":"meta",...} / {"type":"delta","text":"..."} / {"type":"tool_request",...}
//   {"type":"tool_turn_end",...} / {"type":"title_updated",...} / {"type":"final",...} / {"type":"error",...}
// meta 이전(=prepare_turn 자체가 실패한) 경우는 스트리밍하지 않고 JSON 에러(4xx/5xx).
//
// 멀티 프로바이더: ADAPTERS + PROVIDER_CAPABILITIES(agent/types.ts).
// 현재: Google(Gemini), Groq. OpenAI/Claude/Grok 등은 어댑터+캐파빌리티만 추가.
//
// 웹검색: 전면 비활성(2026-07-29). 학습 컷오프는 systemInstruction에 주입하지 않음.
// 클라이언트 enableWebSearch 필드는 무시(하위호환).
//
// Gemini API (2026-07): 기본은 Interactions API(`/v1beta/interactions`).
// Legacy generateContent/streamGenerateContent는 Feature Flag·env로 유지(비교 테스트).
//   - FeatureFlags.geminiInteractionsApi (기본 true)
//   - env GEMINI_API_MODE=interactions|legacy 또는 GEMINI_USE_INTERACTIONS_API=0|1
//
// 로깅: 요청마다 requestId(UUID) 하나로 전 구간을 묶는다. Supabase Dashboard →
// Edge Functions → llm-chat-send → Logs (또는 `supabase functions logs
// llm-chat-send`)에서 requestId로 grep 하면 해당 요청의 전체 흐름(각 단계 소요
// 시간·성공/실패·최종 outcome)을 한 번에 재구성할 수 있다. ApiKey·전체 대화
// 본문은 절대 로그에 남기지 않는다(메시지는 길이/미리보기만).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import {
  assignExperiment,
  buildAgentRequest,
  buildAgentResponse,
  cacheKeyForQuestion,
  emptyAgentState,
  executePlanToAdapterOptions,
  getActivePromptVersion,
  getCircuitBreaker,
  getInputGuard,
  getOutputGuard,
  getProviderHealthMonitor,
  getProviderRateLimiter,
  getQuestionCache,
  hasProvider,
  logAgentPlanSummary,
  logAgentPhase,
  logAgentStateSnapshot,
  logAgentTimings,
  metricsFromAgentResponse,
  registerAdapterAsProvider,
  resolveFeatureFlags,
  runEvaluation,
  runExecutionGraph,
  runPlanner,
  buildProviderHttpDiag,
  classifyQuotaFromResponse,
  detectToolsInRequestBody,
  headersToRecord,
  pickProviderRequestId,
  snapshotRequestBody,
  shouldUseGeminiInteractionsApi,
  setGeminiInteractionsApiOverride,
} from './agent/mod.ts';
import type { ProviderHttpDiag, QuotaClass } from './agent/mod.ts';
import {
  generateTitleGeminiInteractions,
  streamGeminiInteractions,
} from './agent/providers/geminiInteractions.ts';
import {
  toLegacyGeminiFunctionDeclarations,
  toOpenAiFunctionTools,
} from './agent/tools/downloadDeclarations.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// chat 호출 시도별 타임아웃 (Edge wall-clock ~60s 여유).
// AbortSignal.timeout()은 Deno Edge에서 불안정한 경우가 있어 AbortController+setTimeout 사용.
const GEMINI_SEARCH_ATTEMPT_MS = 18_000;
const GEMINI_PLAIN_ATTEMPT_MS = 22_000;
// maxOutputTokens를 안 주면 모델 기본값을 쓰는데, thinking이 강제로 켜져 있는 모델은
// 내부 추론 토큰이 이 예산을 먼저 소비해버려 실제 답변이 몇 단어 만에 뚝 끊기는
// 문제가 있었다(요청/응답 로그로 확인: totalTokens>>outputTokens). 넉넉하게 잡아서
// thinking을 쓰든 안 쓰든 답변이 중간에 잘리지 않게 한다.
//
// Gemini 2.0 계열은 output token 한도가 8192로 고정이라 이 값을 넘기면 400
// INVALID_ARGUMENT가 난다. 반면 2.5/3.x(및 -latest 계열 alias)는 공식 한도가
// 65536이라, thinking이 예산을 먹어도 실제 답변이 잘리지 않으려면 훨씬 큰 값이
// 필요하다 — getGeminiMaxOutputTokens()가 모델별로 이 둘을 구분해서 고른다.
const GEMINI_CHAT_MAX_OUTPUT_TOKENS_LEGACY = 8192;
const GEMINI_CHAT_MAX_OUTPUT_TOKENS_MODERN = 65536;
// 제목 생성은 사용자 응답과 무관한 백그라운드 호출이라 짧게 끊어도 무방(실패 시
// 임시 제목이 그대로 유지되므로 안전).
const GEMINI_TITLE_TIMEOUT_MS = 8_000;
const GEMINI_TITLE_MAX_OUTPUT_TOKENS = 40;
const GEMINI_TITLE_MAX_LEN = 24;
/** 최근 턴만 전달. 향후 Session Summary 메모리와 합칠 예정(지금은 요약 없음). */
const CHAT_HISTORY_LIMIT = 15;
const LOG_PREVIEW_LEN = 60;

const MSG_PERMISSION_DENIED = (modelDisplayName: string) =>
  `${modelDisplayName} 쓸 권한이 없어요 🔒 관리자에게 문의해 주세요.`;
/** 개인 할당 토큰(AllocatedToken) 소진 — Gemini 429와 혼동되지 않게 명시 */
const MSG_TOKEN_EXPIRED = '할당된 AI 토큰을 다 썼어요 🪙 관리자에게 문의해 주세요.';
const MSG_NETWORK_PROBLEM = '네트워크가 불안정해요 📡 나중에 다시 시도해 주세요.';
/** Gemini API 거부·빈 응답 등 — 실제 네트워크/쿼터 장애가 아닐 때 */
const MSG_LLM_UNAVAILABLE = '지금 AI 응답을 못 받았어요 😵 잠시 후 다시 시도해 주세요.';
/** Gemini 429 폴백(세부 파싱 실패 시) */
const MSG_LLM_RATE_LIMIT_FALLBACK = 'AI 요청이 너무 많아요 🔥 잠시 후 다시 시도해 주세요.';

type GeminiRateLimitKind = 'grounding' | 'rpm' | 'tpm' | 'rpd' | 'unknown';

type GeminiRateLimitInfo = {
  kind: GeminiRateLimitKind;
  /** 사용자용 한도 이름 */
  kindLabel: string;
  retryAfterMs: number | null;
  unlockAt: Date;
  modelHint: string | null;
  limit: number | null;
  quotaId: string | null;
  quotaMetric: string | null;
  quotaEvidence: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Asia/Seoul 기준 `YYYY년 M월 D일 HH:MM` */
function formatDateTimeKst(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const g = (t: string) => {
    const v = Number(parts.find((p) => p.type === t)?.value);
    return t === 'hour' && v === 24 ? 0 : v;
  };
  return `${g('year')}년 ${g('month')}월 ${g('day')}일 ${pad2(g('hour'))}:${pad2(g('minute'))}`;
}

function zonedYmd(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: g('year'), m: g('month'), d: g('day') };
}

/** timeZone 벽시계 y-m-d hh:mm:ss 에 해당하는 UTC instant */
function utcMsForZonedWallTime(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  timeZone: string,
): number {
  let t = Date.UTC(y, m - 1, d, hh + 10, mm, ss);
  for (let i = 0; i < 48; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(t));
    const g = (type: string) => {
      const v = Number(parts.find((p) => p.type === type)?.value);
      return type === 'hour' && v === 24 ? 0 : v;
    };
    const got = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    const want = Date.UTC(y, m - 1, d, hh, mm, ss);
    const delta = want - got;
    if (Math.abs(delta) < 500) return t;
    t += delta;
  }
  return t;
}

/** Google RPD 리셋: America/Los_Angeles 다음 자정 */
function nextMidnightPacific(from = new Date()): Date {
  const { y, m, d } = zonedYmd(from, 'America/Los_Angeles');
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return new Date(
    utcMsForZonedWallTime(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      0,
      0,
      0,
      'America/Los_Angeles',
    ),
  );
}

function parseGeminiRetryAfterMs(errorBody: string): number | null {
  const retryIn = errorBody.match(/Please retry in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
  if (retryIn) {
    const sec = Number(retryIn[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  const tryAgain = errorBody.match(/Please try again in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
  if (tryAgain) {
    const sec = Number(tryAgain[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  const retryInfo = errorBody.match(/"retryDelay"\s*:\s*"([0-9]+(?:\.[0-9]+)?)s"/i);
  if (retryInfo) {
    const sec = Number(retryInfo[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  return null;
}

function rateLimitKindLabel(kind: GeminiRateLimitKind): string {
  switch (kind) {
    case 'grounding':
      return '웹 검색(그라운딩)';
    case 'rpm':
      return '분당 요청 횟수';
    case 'tpm':
      return '분당 토큰 사용량';
    case 'rpd':
      return '하루 요청 횟수';
    default:
      return '이용 한도';
  }
}

function parseGeminiRateLimitInfo(errorBody: string, now = new Date()): GeminiRateLimitInfo {
  const classified = classifyQuotaFromResponse(429, errorBody);
  const kind = classified.quotaClass;
  const retryAfterMs = parseGeminiRetryAfterMs(errorBody);
  const modelHint =
    errorBody.match(/model:\s*([a-z0-9._-]+)/i)?.[1]
    ?? errorBody.match(/"model"\s*:\s*"([^"]+)"/i)?.[1]
    ?? null;
  const limitRaw = errorBody.match(/limit:\s*([0-9]+)/i)?.[1]
    ?? errorBody.match(/"quotaValue"\s*:\s*"([0-9]+)"/i)?.[1]
    ?? null;
  const limit = limitRaw != null ? Number(limitRaw) : null;

  let unlockAt: Date;
  if (kind === 'rpd') {
    unlockAt = nextMidnightPacific(now);
  } else if (retryAfterMs != null) {
    unlockAt = new Date(now.getTime() + retryAfterMs);
  } else if (kind === 'rpm' || kind === 'tpm') {
    unlockAt = new Date(now.getTime() + 60_000);
  } else {
    unlockAt = new Date(now.getTime() + (retryAfterMs ?? 60_000));
  }

  return {
    kind,
    kindLabel: rateLimitKindLabel(kind),
    retryAfterMs,
    unlockAt,
    modelHint,
    limit: Number.isFinite(limit) ? limit : null,
    quotaId: classified.quotaId,
    quotaMetric: classified.quotaMetric,
    quotaEvidence: classified.quotaEvidence,
  };
}

/** 앱 UI용 짧은 안내. 상세 진단(QuotaClass/헤더/본문)은 LLMCallAttemptLog 전용. */
function buildMsgLlmRateLimit(
  errorBody: string,
  modelDisplayName: string,
  options?: {
    quotaClass?: QuotaClass | null;
  },
): string {
  const body = (errorBody ?? '').trim();
  if (!body && options?.quotaClass == null) return MSG_LLM_RATE_LIMIT_FALLBACK;
  const info = parseGeminiRateLimitInfo(body || '{}');
  const kind = (options?.quotaClass ?? info.kind) as GeminiRateLimitKind;
  const kindLabel = rateLimitKindLabel(kind);
  const modelLabel = (modelDisplayName || info.modelHint || '선택한 모델').trim();
  const unlockLabel = formatDateTimeKst(info.unlockAt);
  const limitHint =
    info.limit != null && Number.isFinite(info.limit) && kind !== 'unknown'
      ? ` (한도 ${info.limit.toLocaleString('ko-KR')})`
      : '';

  return (
    `「${modelLabel}」모델의 이용 한도를 넘었어요 🔥\n\n` +
    `초과한 한도: ${kindLabel}${limitHint}\n` +
    `다시 사용 가능해지는 시각: ${unlockLabel} (한국 시간)\n\n` +
    `이 시각 이후에 다시 시도하거나, 다른 모델을 골라 주세요.`
  );
}

// ── 로깅 ──────────────────────────────────────────────────────────────────
// event: 단계 식별자(스캔·grep 용). data: 그 단계에서만 의미 있는 값만 담는다
// (상위 단계에서 이미 찍은 값은 반복하지 않음 — 중복 로그 방지).

function preview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > LOG_PREVIEW_LEN ? `${t.slice(0, LOG_PREVIEW_LEN)}…` : t;
}

function logLine(
  level: 'info' | 'warn' | 'error',
  requestId: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  const payload = { fn: 'llm-chat-send', requestId, event, ts: new Date().toISOString(), ...data };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logInfo = (requestId: string, event: string, data?: Record<string, unknown>) =>
  logLine('info', requestId, event, data);
const logWarn = (requestId: string, event: string, data?: Record<string, unknown>) =>
  logLine('warn', requestId, event, data);
const logErr = (requestId: string, event: string, err: unknown, data?: Record<string, unknown>) =>
  logLine('error', requestId, event, {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...data,
  });

/** Gemini 시도 결과를 DB에 남겨 Dashboard Edge Logs 없이도 원인을 조회할 수 있게 한다. */
async function persistLlmCallAttemptLogs(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: {
    requestId: string;
    serialNo: string;
    sessionId: number;
    modelId: number;
    modelName: string;
    userMessage: string;
    needsWebSearch: boolean;
    attempts: GeminiAttemptDiag[];
  },
): Promise<void> {
  if (!params.attempts.length) return;
  const rows = params.attempts.map((a) => ({
    RequestID: params.requestId,
    SerialNo: params.serialNo,
    SessionID: params.sessionId,
    ModelID: params.modelId,
    ModelName: params.modelName,
    AttemptIndex: a.attemptIndex,
    AttemptLabel: a.attemptLabel,
    WithSearch: a.withSearch,
    WithTools: a.withTools === true,
    HttpStatus: a.httpStatus,
    Ok: a.ok,
    ErrorKind: a.errorKind,
    ErrorMessage: a.errorMessage,
    FinishReason: a.finishReason,
    BlockReason: a.blockReason,
    GroundedQueryCount: a.groundedQueryCount,
    ElapsedMs: a.elapsedMs,
    MaxOutputTokens: a.maxOutputTokens,
    UserMessagePreview: preview(params.userMessage),
    NeedsWebSearch: params.needsWebSearch,
    ProviderRequestID: a.providerRequestId ?? null,
    RetryAfterHeader: a.retryAfterHeader ?? null,
    ResponseHeadersJson: a.responseHeaders ?? null,
    RateLimitHeadersJson: a.rateLimitHeaders ?? null,
    ResponseBodyText: a.responseBodyText ?? null,
    RequestBodyJson: a.requestBodyJson ?? null,
    RequestBodySha256: a.requestBodySha256 ?? null,
    RequestBodyBytes: a.requestBodyBytes ?? null,
    RequestBodyTruncated: a.requestBodyTruncated === true,
    QuotaClass: a.quotaClass ?? null,
    QuotaId: a.quotaId ?? null,
    QuotaMetric: a.quotaMetric ?? null,
    QuotaEvidence: a.quotaEvidence ?? null,
  }));
  const { error } = await supabase.from('LLMCallAttemptLog').insert(rows);
  if (error) {
    logWarn(params.requestId, 'attempt_log_insert_failed', { message: error.message });
  } else {
    logInfo(params.requestId, 'attempt_log_insert_ok', { rowCount: rows.length });
  }
}

type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Gemini/Groq 1회 시도 진단 — Edge console + LLMCallAttemptLog + 앱 final.diag 에 동일 구조로 남긴다. */
type GeminiAttemptDiag = {
  attemptIndex: number;
  attemptLabel: string;
  withSearch: boolean;
  withTools?: boolean;
  maxOutputTokens: number;
  ok: boolean;
  httpStatus: number | null;
  errorKind: string | null;
  errorMessage: string | null;
  finishReason: string | null;
  blockReason: string | null;
  groundedQueryCount: number;
  elapsedMs: number;
  providerRequestId?: string | null;
  retryAfterHeader?: string | null;
  responseHeaders?: Record<string, string> | null;
  rateLimitHeaders?: Record<string, string> | null;
  responseBodyText?: string | null;
  requestBodyJson?: Record<string, unknown> | null;
  requestBodySha256?: string | null;
  requestBodyBytes?: number | null;
  requestBodyTruncated?: boolean;
  quotaClass?: QuotaClass | null;
  quotaId?: string | null;
  quotaMetric?: string | null;
  quotaEvidence?: string | null;
};

function emptyAttemptHttpFields(): Pick<
  GeminiAttemptDiag,
  | 'withTools'
  | 'providerRequestId'
  | 'retryAfterHeader'
  | 'responseHeaders'
  | 'rateLimitHeaders'
  | 'responseBodyText'
  | 'requestBodyJson'
  | 'requestBodySha256'
  | 'requestBodyBytes'
  | 'requestBodyTruncated'
  | 'quotaClass'
  | 'quotaId'
  | 'quotaMetric'
  | 'quotaEvidence'
> {
  return {
    withTools: false,
    providerRequestId: null,
    retryAfterHeader: null,
    responseHeaders: null,
    rateLimitHeaders: null,
    responseBodyText: null,
    requestBodyJson: null,
    requestBodySha256: null,
    requestBodyBytes: null,
    requestBodyTruncated: false,
    quotaClass: null,
    quotaId: null,
    quotaMetric: null,
    quotaEvidence: null,
  };
}

async function attachRequestSnapshot(
  diag: GeminiAttemptDiag,
  body: Record<string, unknown>,
  persistJson: boolean,
): Promise<void> {
  const tools = detectToolsInRequestBody(body);
  diag.withTools = tools.withTools;
  const snap = await snapshotRequestBody(body, persistJson);
  diag.requestBodyJson = snap.requestBodyJson;
  diag.requestBodySha256 = snap.requestBodySha256;
  diag.requestBodyBytes = snap.requestBodyBytes;
  diag.requestBodyTruncated = snap.requestBodyTruncated;
}

function attachHttpDiag(diag: GeminiAttemptDiag, http: ProviderHttpDiag, httpStatus: number): void {
  diag.responseHeaders = http.responseHeaders;
  diag.rateLimitHeaders = http.rateLimitHeaders;
  diag.retryAfterHeader = http.retryAfterHeader;
  diag.providerRequestId = http.providerRequestId;
  diag.responseBodyText = http.responseBodyText;
  if (httpStatus === 429) {
    diag.quotaClass = http.quota.quotaClass;
    diag.quotaId = http.quota.quotaId;
    diag.quotaMetric = http.quota.quotaMetric;
    diag.quotaEvidence = http.quota.quotaEvidence;
  }
}

function logQuotaDiagEvent(
  modelName: string,
  attempt: { label: string; withSearch: boolean },
  diag: GeminiAttemptDiag,
  requestBody: Record<string, unknown>,
): void {
  const tools = detectToolsInRequestBody(requestBody);
  console.warn(
    JSON.stringify({
      fn: 'llm-chat-send',
      event: 'provider_http_quota_diag',
      ts: new Date().toISOString(),
      modelName,
      attemptLabel: attempt.label,
      httpStatus: diag.httpStatus,
      latencyMs: diag.elapsedMs,
      withTools: tools.withTools,
      withGoogleSearch: tools.withGoogleSearch,
      withSearch: attempt.withSearch,
      providerRequestId: diag.providerRequestId,
      retryAfterHeader: diag.retryAfterHeader,
      rateLimitHeaders: diag.rateLimitHeaders,
      responseHeaders: diag.responseHeaders,
      responseBodyText: diag.responseBodyText,
      quotaClass: diag.quotaClass,
      quotaId: diag.quotaId,
      quotaMetric: diag.quotaMetric,
      quotaEvidence: diag.quotaEvidence,
      requestBodySha256: diag.requestBodySha256,
      requestBodyBytes: diag.requestBodyBytes,
      requestBodyTruncated: diag.requestBodyTruncated,
      // Edge Logs용 — DB RequestBodyJson과 동일 정책(실패 시 스냅샷)
      requestBodyJson: diag.requestBodyJson,
    }),
  );
}

type AdapterSuccess = {
  ok: true;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** 진단용(로깅 전용) — Gemini candidates[0].finishReason (STOP/MAX_TOKENS/SAFETY 등) */
  finishReason?: string;
  /** 진단용(로깅 전용) — 내부 추론(thinking)에 쓴 토큰 수 */
  thoughtsTokens?: number;
  /** 진단용 — google_search grounding 사용 여부 */
  grounded?: boolean;
  /** 진단용 — groundingMetadata.webSearchQueries / google_search_call queries 개수 */
  groundedQueryCount?: number;
  attempts: GeminiAttemptDiag[];
  needsWebSearch: boolean;
  /** 앱이 실행할 function call (다운로드 도구 등) */
  functionCalls?: Array<{ callId: string; name: string; args: Record<string, unknown> }>;
  /** Gemini Interactions: toolContinue용 interaction.id */
  interactionId?: string | null;
};
type AdapterFailure = {
  ok: false;
  kind: 'auth' | 'network' | 'rate_limit' | 'other';
  message: string;
  /** 실패 원인 HTTP status (있는 경우) — 로깅용 */
  status?: number;
  attempts: GeminiAttemptDiag[];
  needsWebSearch: boolean;
  functionCalls?: Array<{ callId: string; name: string; args: Record<string, unknown> }>;
  interactionId?: string | null;
};
type AdapterResult = AdapterSuccess | AdapterFailure;

type TitleResult = { title: string; inputTokens: number; outputTokens: number; totalTokens: number };

type GeminiFunctionCallPart = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

type StreamOptions = {
  /**
   * 메인 LLM 시스템 프롬프트.
   * Agent 파이프라인이 `[CURRENT_DATETIME]`/`[INTENT]`까지 조립해 넘기면
   * 어댑터는 datetime·검색 힌트를 중복 부착하지 않는다.
   */
  adminSystemInstruction?: string;
  /** Intent needDownloadTools / toolContinue — 검색과 배타 */
  enableDownloadTools?: boolean;
  /** Intent needSearch — Gemini=google_search, Groq=browser_search */
  enableWebSearch?: boolean;
  /** tool 결과 이어가기 — Gemini contents/Interactions function_result */
  toolContinue?: {
    modelFunctionCalls: GeminiFunctionCallPart[];
    functionResponses: Array<{ name: string; response: Record<string, unknown> }>;
    /** Interactions API: previous_interaction_id */
    previousInteractionId?: string | null;
  };
};

/**
 * Provider 공통 인터페이스.
 * 새 제공자(OpenAI/Claude/xAI Grok/DeepSeek 등)는 이 계약 + PROVIDER_CAPABILITIES만 맞추면 된다.
 */
interface LlmAdapter {
  stream(
    apiKey: string,
    modelName: string,
    history: ChatTurn[],
    userMessage: string,
    onDelta: (deltaText: string) => void,
    options?: StreamOptions,
  ): Promise<AdapterResult>;
  generateTitle(apiKey: string, modelName: string, userMessage: string): Promise<TitleResult | null>;
}

function isAgentAssembledSystemPrompt(text: string): boolean {
  return text.includes('[CURRENT_DATETIME]') && text.includes('[INTENT]');
}

// Gemini 2.5+/3.x 계열은 기본적으로 "thinking"(응답 전 내부 추론)이 활성화되어 있고,
// 이 추론 토큰은 사용자에게 스트리밍되지 않는다 — 그래서 답변이 아주 짧아도 첫 delta가
// 오기까지 몇 초씩 걸리고(체감상 "뚝뚝 끊김"), generateTitle처럼 maxOutputTokens를 작게
// 준 호출은 추론 토큰이 예산을 다 먹어버려 제목이 중간에 잘린 이상한 문자열로 나온다.
// 그래서 채팅 응답 속도가 가장 중요한 이 함수에서는 thinking을 꺼서(비-Pro) 또는 최소
// 예산으로(Pro, 0으로는 끌 수 없음) 지연을 없앤다. thinking을 지원하지 않는 구형/비-텍스트
// 모델(1.x, 2.0, TTS/이미지/임베딩/라이브 등)에는 이 필드를 아예 보내지 않는다(400 오류 방지).
function getGeminiThinkingConfig(modelName: string): Record<string, unknown> | undefined {
  const m = modelName.replace(/^models\//, '').toLowerCase();
  const nonThinkingFamily =
    /gemma|tts|image|embed|live|audio|veo|imagen|lyria|robotics|computer-use|deep-research|^aqa$|nano-banana|omni/.test(
      m,
    );
  const legacyVersion = /(^|[^0-9])1\.[05]([^0-9]|$)|(^|[^0-9])2\.0([^0-9]|$)/.test(m);
  if (nonThinkingFamily || legacyVersion) return undefined;
  const isPro = m.includes('pro') && !m.includes('flash');
  // Gemini 2.5 Pro는 thinkingBudget=0을 허용하지 않아(최소 128) 완전히 끌 수는 없다.
  return { thinkingBudget: isPro ? 128 : 0 };
}

/**
 * thinking을 지원하는(getGeminiThinkingConfig가 값을 주는) 모델은 대부분 2.5/3.x나
 * -latest alias라 output token 한도가 65536이다 — thinking이 예산을 함께 쓰는 만큼
 * 상한도 넉넉히 잡아야 실제 답변이 끝까지 나온다. thinking 미지원(gemma/구형/비텍스트)
 * 모델은 8192 한도인 2.0 계열이 대부분이라 기존 값을 유지한다.
 */
function getGeminiMaxOutputTokens(modelName: string): number {
  return getGeminiThinkingConfig(modelName) !== undefined
    ? GEMINI_CHAT_MAX_OUTPUT_TOKENS_MODERN
    : GEMINI_CHAT_MAX_OUTPUT_TOKENS_LEGACY;
}

function buildGeminiContents(history: ChatTurn[], userMessage: string) {
  return [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];
}

// SSE 조기 종료 등으로 논스트리밍 fallback 했을 때만 쓰는 재생 타이핑.
// 정상 경로는 제공자 SSE를 그대로 onDelta로 릴레이한다.
const TYPING_REPLAY_CHUNK_CHARS = 24;
const TYPING_REPLAY_DELAY_MS = 12;
const TYPING_REPLAY_FAST_CHARS = 48;
const TYPING_REPLAY_NO_DELAY_MIN_LEN = 600;

async function emitAsTypingDeltas(
  text: string,
  onDelta: (deltaText: string) => void,
): Promise<void> {
  const noDelay = text.length >= TYPING_REPLAY_NO_DELAY_MIN_LEN;
  const chunk = noDelay ? TYPING_REPLAY_FAST_CHARS : TYPING_REPLAY_CHUNK_CHARS;
  for (let i = 0; i < text.length; i += chunk) {
    onDelta(text.slice(i, i + chunk));
    if (!noDelay && i + chunk < text.length) {
      await new Promise((resolve) => setTimeout(resolve, TYPING_REPLAY_DELAY_MS));
    }
  }
}

function sanitizeGeneratedTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  // 모델이 종종 덧붙이는 따옴표·"제목:" 접두사 등을 제거 — 순수 제목만 남긴다.
  t = t.replace(/^["'“”‘’`*#]+|["'“”‘’`*#.]+$/g, '').trim();
  t = t.replace(/^제목\s*[:：]\s*/, '').trim();
  if (!t) return '';
  return t.length > GEMINI_TITLE_MAX_LEN ? `${t.slice(0, GEMINI_TITLE_MAX_LEN)}…` : t;
}

/**
 * Gemini/Groq 채팅은 가능하면 제공자 SSE를 실시간 릴레이한다.
 * - Gemini 기본: Interactions API (`/v1beta/interactions?alt=sse`)
 * - Gemini Legacy(Feature Flag off): `streamGenerateContent?alt=sse`.
 *   finishReason 없이 조기 종료되면 같은 요청을 논스트리밍 `generateContent`로 확정.
 */
/** Gemini Grounding with Google Search — Legacy generateContent REST. */
const GEMINI_GOOGLE_SEARCH_TOOL_LEGACY = { google_search: {} };
/** @deprecated 이름 호환 — Legacy 전용 */
const GEMINI_GOOGLE_SEARCH_TOOL = GEMINI_GOOGLE_SEARCH_TOOL_LEGACY;
void GEMINI_GOOGLE_SEARCH_TOOL;

/** AI Lab 앱 다운로드 tools — 클라이언트가 실행하고 functionResponse로 되돌린다. */
const DOWNLOAD_FUNCTION_DECLARATIONS = toLegacyGeminiFunctionDeclarations();

/** @deprecated 이름 호환 — DOWNLOAD_FUNCTION_DECLARATIONS 와 동일 */
const GEMINI_DOWNLOAD_FUNCTION_DECLARATIONS = DOWNLOAD_FUNCTION_DECLARATIONS;

/** 웹 검색 전면 비활성 — 레거시 힌트 주입하지 않음 */
function appendWebSearchEnabledHint(systemText: string, _enabled: boolean): string {
  return systemText;
}

/** Groq: gpt-oss 계열만 서버사이드 browser_search 지원 */
function groqModelSupportsBrowserSearch(modelName: string): boolean {
  const n = modelName.toLowerCase();
  return n.includes('gpt-oss-120b') || n.includes('gpt-oss-20b');
}

/**
 * 인터넷 검색 ON + Groq: browser_search 가능한 모델로 실행.
 * llama/qwen 등은 gpt-oss-120b로 바꿔 서버사이드 검색(Edge 크롤 없음).
 */
const GROQ_BROWSER_SEARCH_MODEL = 'openai/gpt-oss-120b';

/**
 * 매 요청 시점의 한국 시각만 코드가 주입한다(하드코딩 날짜 아님).
 * 나머지 행동 규칙은 DB LLMSystemPrompt(활성 행)에서 온다.
 */
function buildLiveCurrentDatetimeBlock(): string {
  const now = new Date();
  const dateLongKo = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now);
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  const [ymd, hms = '00:00:00'] = stamp.split(/\s+/);

  return (
    `[CURRENT_DATETIME]\n` +
    `timezone: Asia/Seoul (KST, UTC+9)\n` +
    `today_ko: ${dateLongKo}\n` +
    `date_ymd: ${ymd}\n` +
    `time_hms: ${hms}`
  );
}

/** [CURRENT_DATETIME] + DB 활성 시스템 프롬프트.
 * Provider/모델과 무관하게 동일 문자열을 모든 어댑터에 넣는다(Google systemInstruction / Groq system message). */
function buildChatSystemInstruction(dbSystemInstruction?: string): string {
  const live = buildLiveCurrentDatetimeBlock();
  const fromDb = (dbSystemInstruction ?? '').trim();
  return fromDb ? `${live}\n\n${fromDb}` : live;
}

/** Groq 등: tools 없을 때 가짜 tool call 방지. Agent가 이미 [TOOLS]를 넣었으면 스킵. */
function appendNoToolsGuard(systemText: string): string {
  if (systemText.includes('[TOOLS]')) return systemText;
  return (
    `${systemText.trim()}\n\n` +
    `[TOOLS]\n` +
    `이번 요청에는 호출 가능한 도구(function/tool)가 없다.\n` +
    `google_search 포함 어떤 도구도 호출하지 마라. tool call JSON을 출력하지 말고 텍스트로만 답한다.`
  );
}

/** @deprecated buildChatSystemInstruction 별칭 */
function buildGeminiChatSystemInstruction(dbSystemInstruction?: string): string {
  return buildChatSystemInstruction(dbSystemInstruction);
}

/** Agent 조립본이면 그대로, 아니면 datetime+DB 래핑 */
function resolveAdapterSystemInstruction(
  adminSystemInstruction: string | undefined,
  opts: { enableWebSearch: boolean; enableTools: boolean },
): string {
  const raw = (adminSystemInstruction ?? '').trim();
  let text = isAgentAssembledSystemPrompt(raw)
    ? raw
    : buildChatSystemInstruction(adminSystemInstruction);
  text = appendWebSearchEnabledHint(text, opts.enableWebSearch);
  if (!opts.enableTools && !opts.enableWebSearch) {
    text = appendNoToolsGuard(text);
  }
  return text;
}

function extractGeminiVisibleText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  const visible: string[] = [];
  const thoughts: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    const part = p as { text?: string; thought?: boolean };
    if (typeof part.text !== 'string' || !part.text) continue;
    if (part.thought === true) thoughts.push(part.text);
    else visible.push(part.text);
  }
  const visibleJoined = visible.join('').trim();
  if (visibleJoined) return visibleJoined;
  return thoughts.join('').trim();
}

function isTrivialGeminiText(text: string): boolean {
  return text.replace(/[`\s]/g, '').length === 0;
}

type GeminiAttempt = {
  label: string;
  withSearch: boolean;
  /** thinkingConfig를 붙일지 — Gemini 3 Flash는 thinkingBudget:0이 400인 경우가 있어 기본은 false */
  useThinking: boolean;
  maxOutputTokens: number;
  timeoutMs: number;
};

async function fetchGeminiWithTimeout(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Gemini 429 본문의 "Please retry in NNs" / RetryInfo 초 → 대기 ms (없으면 null). */
function isGeminiRateLimitStatus(status: number): boolean {
  return status === 429;
}

function extractGeminiFunctionCalls(parts: unknown): GeminiFunctionCallPart[] {
  if (!Array.isArray(parts)) return [];
  const out: GeminiFunctionCallPart[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (!p || typeof p !== 'object') continue;
    const fc = (p as { functionCall?: { name?: string; args?: Record<string, unknown> } }).functionCall;
    if (!fc || typeof fc.name !== 'string' || !fc.name.trim()) continue;
    out.push({
      callId: `fc_${i}_${fc.name}`,
      name: fc.name.trim(),
      args: fc.args && typeof fc.args === 'object' ? fc.args : {},
    });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
type GeminiParsedOk = {
  ok: true;
  fullText: string;
  json: any;
  finishReason?: string;
  blockReason?: string;
  groundedQueries: string[];
  usedSearch: boolean;
  functionCalls: GeminiFunctionCallPart[];
};

type GeminiParsedFail = {
  ok: false;
  status: number;
  message: string;
  retryable: boolean;
  finishReason?: string;
  blockReason?: string;
  groundedQueryCount?: number;
  httpDiag?: ProviderHttpDiag;
};

async function parseGeminiGenerateContentResponse(
  res: Response,
  usedSearch: boolean,
): Promise<GeminiParsedOk | GeminiParsedFail> {
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const httpDiag = buildProviderHttpDiag(res, bodyText);
    const retryable = res.status === 400 || res.status === 429 || res.status === 503;
    // ErrorMessage 호환: 429는 길게, 그 외는 짧게. 전문은 httpDiag.responseBodyText
    const keep = res.status === 429 ? 6000 : 800;
    return {
      ok: false,
      status: res.status,
      message: httpDiag.responseBodyText.slice(0, keep) || `gemini: http_${res.status}`,
      retryable,
      httpDiag,
    };
  }

  // deno-lint-ignore no-explicit-any
  const json: any = await res.json().catch(() => null);
  if (!json) {
    return { ok: false, status: res.status, message: 'gemini: invalid json response', retryable: true };
  }

  const blockReason: string | undefined = json?.promptFeedback?.blockReason;
  const candidate = json?.candidates?.[0];
  const finishReason: string | undefined = candidate?.finishReason;
  const parts = candidate?.content?.parts;
  const functionCalls = extractGeminiFunctionCalls(parts);
  const extracted = extractGeminiVisibleText(parts).trim();
  const fullText = stripModelPrivateReasoning(isTrivialGeminiText(extracted) ? '' : extracted);
  const grounding = candidate?.groundingMetadata;
  const groundedQueries: string[] = Array.isArray(grounding?.webSearchQueries)
    ? grounding.webSearchQueries.filter((q: unknown) => typeof q === 'string')
    : [];

  // functionCall만 있고 텍스트가 없어도 성공으로 본다(앱 tool 턴).
  if (!fullText && functionCalls.length === 0) {
    const usage = json?.usageMetadata ?? {};
    const detail = blockReason
      ? `blocked (${blockReason})`
      : finishReason
        ? `finish=${finishReason}`
        : groundedQueries.length > 0
          ? `empty_after_search(q=${groundedQueries.length})`
          : 'empty';
    const usageHint =
      ` prompt=${usage.promptTokenCount ?? '?'} cand=${usage.candidatesTokenCount ?? '?'}` +
      ` thought=${usage.thoughtsTokenCount ?? '?'} total=${usage.totalTokenCount ?? '?'}`;
    return {
      ok: false,
      status: res.status,
      message: `gemini: empty response (${detail};${usageHint})`,
      retryable: true,
      finishReason,
      blockReason,
      groundedQueryCount: groundedQueries.length,
    };
  }

  return {
    ok: true,
    fullText,
    json,
    finishReason,
    blockReason,
    groundedQueries,
    usedSearch,
    functionCalls,
  };
}

const geminiLegacyGenerateContentAdapter: LlmAdapter = {
  async stream(apiKey, modelName, history, userMessage, onDelta, options) {
    const modelPath = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
    const nonStreamUrl =
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const streamUrl =
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const enableDownloadTools = options?.enableDownloadTools === true;
    const toolContinue = options?.toolContinue;
    const contents = toolContinue
      ? [
          ...history.map((turn) => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.content }],
          })),
          {
            role: 'model',
            parts: toolContinue.modelFunctionCalls.map((fc) => ({
              functionCall: { name: fc.name, args: fc.args },
            })),
          },
          {
            role: 'user',
            parts: toolContinue.functionResponses.map((fr) => ({
              functionResponse: { name: fr.name, response: fr.response },
            })),
          },
        ]
      : buildGeminiContents(history, userMessage);
    const thinkingConfig = getGeminiThinkingConfig(modelName);
    const modernMaxOutputTokens = getGeminiMaxOutputTokens(modelName);
    /** 웹 검색(google_search) 전면 비활성 */
    const needsWebSearch = false;
    const systemInstructionText = resolveAdapterSystemInstruction(options?.adminSystemInstruction, {
      enableWebSearch: needsWebSearch,
      enableTools: !!(enableDownloadTools || toolContinue || needsWebSearch),
    });
    // 다운로드 FC만. google_search는 전면 비활성.
    const attempts = enableDownloadTools || toolContinue
      ? [
          {
            label: enableDownloadTools ? 'download_tools' : 'download_tools_continue',
            withSearch: false,
            useThinking: false,
            maxOutputTokens: modernMaxOutputTokens,
            timeoutMs: GEMINI_PLAIN_ATTEMPT_MS,
          } satisfies GeminiAttempt,
        ]
      : [
          {
            label: 'plain',
            withSearch: false,
            useThinking: false,
            maxOutputTokens: modernMaxOutputTokens,
            timeoutMs: GEMINI_PLAIN_ATTEMPT_MS,
          } satisfies GeminiAttempt,
        ];
    const attemptDiags: GeminiAttemptDiag[] = [];

    const buildBody = (attempt: GeminiAttempt) => {
      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: attempt.maxOutputTokens,
        temperature: 0.8,
      };
      if (attempt.useThinking && thinkingConfig) {
        generationConfig.thinkingConfig = thinkingConfig;
      }
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: systemInstructionText }] },
        contents,
        generationConfig,
      };
      if (enableDownloadTools || toolContinue) {
        body.tools = [{ functionDeclarations: GEMINI_DOWNLOAD_FUNCTION_DECLARATIONS }];
      } else if (attempt.withSearch) {
        body.tools = [GEMINI_GOOGLE_SEARCH_TOOL_LEGACY];
      }
      return body;
    };

    const doFetch = async (attempt: GeminiAttempt, mode: 'sse' | 'json') =>
      fetchGeminiWithTimeout(
        mode === 'sse' ? streamUrl : nonStreamUrl,
        buildBody(attempt),
        attempt.timeoutMs,
      );

    let lastFail: AdapterFailure | null = null;

    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]!;
      const attemptStarted = Date.now();
      const requestBody = buildBody(attempt);
      let res: Response;
      try {
        res = await fetchGeminiWithTimeout(
          streamUrl,
          requestBody,
          attempt.timeoutMs,
        );
      } catch (e) {
        const aborted =
          (e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message))) ||
          (typeof e === 'object' && e != null && 'name' in e && (e as { name?: string }).name === 'AbortError');
        const errorMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        const diag: GeminiAttemptDiag = {
          ...emptyAttemptHttpFields(),
          attemptIndex: i + 1,
          attemptLabel: attempt.label,
          withSearch: attempt.withSearch,
          maxOutputTokens: attempt.maxOutputTokens,
          ok: false,
          httpStatus: null,
          errorKind: aborted ? 'timeout' : 'network',
          errorMessage: errorMessage.slice(0, 800),
          finishReason: null,
          blockReason: null,
          groundedQueryCount: 0,
          elapsedMs: Date.now() - attemptStarted,
        };
        await attachRequestSnapshot(diag, requestBody, true);
        attemptDiags.push(diag);
        lastFail = {
          ok: false,
          kind: 'network',
          message: errorMessage,
          attempts: attemptDiags,
          needsWebSearch,
        };
        console.warn(
          JSON.stringify({
            fn: 'llm-chat-send',
            event: aborted ? 'gemini_attempt_timeout' : 'gemini_attempt_exception',
            attempt: i + 1,
            label: attempt.label,
            withSearch: attempt.withSearch,
            elapsedMs: diag.elapsedMs,
            message: diag.errorMessage,
            requestBodySha256: diag.requestBodySha256,
          }),
        );
        if (i < attempts.length - 1) continue;
        return lastFail;
      }

      if (!res.ok) {
        const parsed = await parseGeminiGenerateContentResponse(res, attempt.withSearch);
        if (!parsed.ok) {
          const rateLimited = isGeminiRateLimitStatus(parsed.status);
          const kind = parsed.status === 401 || parsed.status === 403
            ? 'auth'
            : rateLimited
              ? 'rate_limit'
              : 'other';
          const diag: GeminiAttemptDiag = {
            ...emptyAttemptHttpFields(),
            attemptIndex: i + 1,
            attemptLabel: attempt.label,
            withSearch: attempt.withSearch,
            maxOutputTokens: attempt.maxOutputTokens,
            ok: false,
            httpStatus: parsed.status,
            errorKind: kind,
            errorMessage: parsed.message.slice(0, rateLimited ? 6000 : 800),
            finishReason: parsed.finishReason ?? null,
            blockReason: parsed.blockReason ?? null,
            groundedQueryCount: parsed.groundedQueryCount ?? 0,
            elapsedMs: Date.now() - attemptStarted,
          };
          if (parsed.httpDiag) attachHttpDiag(diag, parsed.httpDiag, parsed.status);
          await attachRequestSnapshot(diag, requestBody, true);
          if (rateLimited) logQuotaDiagEvent(modelName, attempt, diag, requestBody);
          attemptDiags.push(diag);
          lastFail = {
            ok: false,
            kind,
            status: parsed.status,
            message: parsed.message,
            attempts: attemptDiags,
            needsWebSearch,
          };
          console.warn(
            JSON.stringify({
              fn: 'llm-chat-send',
              event: 'gemini_attempt_failed',
              attempt: i + 1,
              label: attempt.label,
              withSearch: attempt.withSearch,
              status: parsed.status,
              elapsedMs: diag.elapsedMs,
              message: parsed.message.slice(0, 500),
              finishReason: diag.finishReason,
              blockReason: diag.blockReason,
              rateLimited,
              quotaClass: diag.quotaClass,
              quotaEvidence: diag.quotaEvidence,
              providerRequestId: diag.providerRequestId,
            }),
          );
          if (lastFail.kind === 'auth') return lastFail;
          if (rateLimited) return lastFail;
          if (i < attempts.length - 1) continue;
          break;
        }
      }

      const emitter = createVisibleDeltaEmitter(onDelta);
      let finishReason: string | undefined;
      let blockReason: string | undefined;
      let grounding: unknown;
      // deno-lint-ignore no-explicit-any
      let usage: any = {};
      const functionCalls: GeminiFunctionCallPart[] = [];
      const fcSeen = new Set<string>();
      let groundedQueries: string[] = [];

      try {
        await readSseDataLines(res, (json) => {
          // deno-lint-ignore no-explicit-any
          const j = json as any;
          if (j?.promptFeedback?.blockReason) {
            blockReason = String(j.promptFeedback.blockReason);
          }
          if (j?.usageMetadata) usage = j.usageMetadata;
          const candidate = j?.candidates?.[0];
          if (!candidate) return;
          if (typeof candidate.finishReason === 'string' && candidate.finishReason) {
            finishReason = candidate.finishReason;
          }
          if (candidate.groundingMetadata) {
            grounding = candidate.groundingMetadata;
            if (Array.isArray(candidate.groundingMetadata.webSearchQueries)) {
              groundedQueries = candidate.groundingMetadata.webSearchQueries.filter(
                (q: unknown) => typeof q === 'string',
              );
            }
          }
          const parts = candidate?.content?.parts;
          const piece = extractGeminiVisibleText(parts);
          if (piece && !isTrivialGeminiText(piece)) {
            const rawSoFar = emitter.getRaw();
            if (piece.startsWith(rawSoFar) && piece.length > rawSoFar.length) {
              emitter.push(piece.slice(rawSoFar.length));
            } else if (!rawSoFar.endsWith(piece)) {
              emitter.push(piece);
            }
          }
          for (const fc of extractGeminiFunctionCalls(parts)) {
            const key = `${fc.name}:${JSON.stringify(fc.args)}`;
            if (fcSeen.has(key)) continue;
            fcSeen.add(key);
            functionCalls.push(fc);
          }
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        attemptDiags.push({
          attemptIndex: i + 1,
          attemptLabel: `${attempt.label}_sse_read`,
          withSearch: attempt.withSearch,
          maxOutputTokens: attempt.maxOutputTokens,
          ok: false,
          httpStatus: res.status,
          errorKind: 'network',
          errorMessage: errorMessage.slice(0, 800),
          finishReason: finishReason ?? null,
          blockReason: blockReason ?? null,
          groundedQueryCount: groundedQueries.length,
          elapsedMs: Date.now() - attemptStarted,
        });
        lastFail = {
          ok: false,
          kind: 'network',
          message: errorMessage,
          attempts: attemptDiags,
          needsWebSearch,
        };
        if (i < attempts.length - 1) continue;
        return lastFail;
      }

      let fullText = emitter.finish();
      let usedFallback = false;

      // finishReason 없이 끊기면 논스트리밍으로 확정(과거 Google SSE 조기 종료 대응)
      if (!finishReason || (!fullText && functionCalls.length === 0)) {
        try {
          const res2 = await doFetch(attempt, 'json');
          const parsed = await parseGeminiGenerateContentResponse(res2, attempt.withSearch);
          if (parsed.ok) {
            usedFallback = true;
            const authoritative = parsed.fullText;
            if (authoritative.startsWith(fullText)) {
              const rest = authoritative.slice(fullText.length);
              if (rest) await emitAsTypingDeltas(rest, onDelta);
            } else if (!fullText) {
              if (authoritative) await emitAsTypingDeltas(authoritative, onDelta);
            }
            fullText = authoritative;
            finishReason = parsed.finishReason ?? finishReason;
            blockReason = parsed.blockReason ?? blockReason;
            groundedQueries = parsed.groundedQueries;
            usage = parsed.json?.usageMetadata ?? usage;
            if (parsed.functionCalls.length > 0) {
              functionCalls.length = 0;
              functionCalls.push(...parsed.functionCalls);
            }
          } else if (!fullText && functionCalls.length === 0) {
            const rateLimited = isGeminiRateLimitStatus(parsed.status);
            const kind = parsed.status === 401 || parsed.status === 403
              ? 'auth'
              : rateLimited
                ? 'rate_limit'
                : 'other';
            const diagFb: GeminiAttemptDiag = {
              ...emptyAttemptHttpFields(),
              attemptIndex: i + 1,
              attemptLabel: `${attempt.label}_fallback`,
              withSearch: attempt.withSearch,
              maxOutputTokens: attempt.maxOutputTokens,
              ok: false,
              httpStatus: parsed.status,
              errorKind: kind,
              errorMessage: parsed.message.slice(0, rateLimited ? 6000 : 800),
              finishReason: parsed.finishReason ?? null,
              blockReason: parsed.blockReason ?? null,
              groundedQueryCount: parsed.groundedQueryCount ?? 0,
              elapsedMs: Date.now() - attemptStarted,
            };
            if (parsed.httpDiag) attachHttpDiag(diagFb, parsed.httpDiag, parsed.status);
            await attachRequestSnapshot(diagFb, requestBody, true);
            if (rateLimited) logQuotaDiagEvent(modelName, attempt, diagFb, requestBody);
            attemptDiags.push(diagFb);
            lastFail = {
              ok: false,
              kind,
              status: parsed.status,
              message: parsed.message,
              attempts: attemptDiags,
              needsWebSearch,
            };
            if (kind === 'auth' || rateLimited) return lastFail;
            if (i < attempts.length - 1) continue;
            break;
          }
        } catch {
          // fallback 실패 시 스트림에서 모은 텍스트라도 있으면 사용
        }
      }

      if (!fullText && functionCalls.length === 0) {
        lastFail = {
          ok: false,
          kind: 'other',
          message: 'gemini: empty response after stream',
          attempts: attemptDiags,
          needsWebSearch,
        };
        if (i < attempts.length - 1) continue;
        break;
      }

      const diagOk: GeminiAttemptDiag = {
        ...emptyAttemptHttpFields(),
        attemptIndex: i + 1,
        attemptLabel: usedFallback ? `${attempt.label}_sse_fallback` : `${attempt.label}_sse`,
        withSearch: attempt.withSearch,
        maxOutputTokens: attempt.maxOutputTokens,
        ok: true,
        httpStatus: res.status,
        errorKind: null,
        errorMessage: usedFallback ? 'sse_early_end_used_generateContent' : null,
        finishReason: finishReason ?? null,
        blockReason: blockReason ?? null,
        groundedQueryCount: groundedQueries.length,
        elapsedMs: Date.now() - attemptStarted,
        providerRequestId: pickProviderRequestId(headersToRecord(res.headers)),
      };
      // 성공: 검색 시도는 body 스냅샷 보관, plain 성공은 해시만(용량 절약)
      await attachRequestSnapshot(diagOk, requestBody, attempt.withSearch === true);
      attemptDiags.push(diagOk);

      console.log(
        JSON.stringify({
          fn: 'llm-chat-send',
          event: 'gemini_attempt_ok',
          attempt: i + 1,
          label: attempt.label,
          withSearch: attempt.withSearch,
          groundedQueryCount: groundedQueries.length,
          elapsedMs: diagOk.elapsedMs,
          textLen: fullText.length,
          finishReason: diagOk.finishReason,
          usedFallback,
        }),
      );

      return {
        ok: true,
        text: fullText,
        inputTokens: Number(usage.promptTokenCount ?? 0),
        outputTokens: Number(usage.candidatesTokenCount ?? 0),
        totalTokens: Number(usage.totalTokenCount ?? 0),
        finishReason,
        thoughtsTokens: Number(usage.thoughtsTokenCount ?? 0),
        grounded: Boolean(attempt.withSearch && groundedQueries.length > 0),
        groundedQueryCount: groundedQueries.length,
        attempts: attemptDiags,
        needsWebSearch,
        functionCalls,
      };
    }

    return (
      lastFail ?? {
        ok: false,
        kind: 'other',
        message: 'gemini: all attempts failed',
        attempts: attemptDiags,
        needsWebSearch,
      }
    );
  },

  async generateTitle(apiKey, modelName, userMessage) {
    const modelPath = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const thinkingConfig = getGeminiThinkingConfig(modelName);
    const prompt =
      '다음은 사용자가 채팅에서 처음 보낸 메시지다. 이 대화를 대표하는 아주 짧은 한국어 제목을 만들어라.\n' +
      '규칙: 명사형으로 12자 이내. 설명·따옴표·마침표 없이 제목 한 줄만 출력. 메시지를 그대로 베끼지 말고 핵심 주제만 요약.\n\n' +
      `사용자 메시지:\n${userMessage}`;

    const maxOutputTokens =
      thinkingConfig && (thinkingConfig.thinkingBudget as number) > 0
        ? (thinkingConfig.thinkingBudget as number) + GEMINI_TITLE_MAX_OUTPUT_TOKENS
        : GEMINI_TITLE_MAX_OUTPUT_TOKENS;

    const doFetch = (withThinking: boolean) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: withThinking ? maxOutputTokens : GEMINI_TITLE_MAX_OUTPUT_TOKENS,
            temperature: 0.2,
            ...(withThinking && thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TITLE_TIMEOUT_MS),
      });

    try {
      let res = await doFetch(false);
      if (!res.ok && res.status === 400 && thinkingConfig) {
        res = await doFetch(true);
      }
      if (!res.ok) return null;
      // deno-lint-ignore no-explicit-any
      const json: any = await res.json().catch(() => null);
      if (!json) return null;
      const parts = json?.candidates?.[0]?.content?.parts;
      const raw = extractGeminiVisibleText(parts);
      const title = sanitizeGeneratedTitle(raw);
      if (!title) return null;
      const usage = json?.usageMetadata ?? {};
      return {
        title,
        inputTokens: Number(usage.promptTokenCount ?? 0),
        outputTokens: Number(usage.candidatesTokenCount ?? 0),
        totalTokens: Number(usage.totalTokenCount ?? 0),
      };
    } catch {
      return null;
    }
  },
};

/**
 * Google Gemini 어댑터 디스패치.
 * 기본: Interactions API. Feature Flag/env로 Legacy generateContent 유지.
 */
const geminiAdapter: LlmAdapter = {
  async stream(apiKey, modelName, history, userMessage, onDelta, options) {
    if (shouldUseGeminiInteractionsApi()) {
      return await streamGeminiInteractions(
        apiKey,
        modelName,
        history,
        userMessage,
        onDelta,
        options,
      );
    }
    return await geminiLegacyGenerateContentAdapter.stream(
      apiKey,
      modelName,
      history,
      userMessage,
      onDelta,
      options,
    );
  },
  async generateTitle(apiKey, modelName, userMessage) {
    if (shouldUseGeminiInteractionsApi()) {
      return await generateTitleGeminiInteractions(apiKey, modelName, userMessage);
    }
    return await geminiLegacyGenerateContentAdapter.generateTitle(apiKey, modelName, userMessage);
  },
};

// ── Groq (OpenAI-compatible chat/completions) ───────────────────────────────

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_CHAT_TIMEOUT_MS = 90_000;
/** 한 요청에서 답변이 중간에 끊기지 않도록 확보하려는 최소 완료 토큰 */
const GROQ_MIN_COMPLETION_TOKENS = 1024;
/**
 * 채팅 1턴에 예약할 완료 토큰 상한.
 * TPM(예: 8000) 거의 전부를 max_tokens로 잡으면 첫 질문은 되지만,
 * 같은 분 안 두 번째 질문이 Used+Requested 로 바로 429가 난다.
 * 3072면 긴 답도 충분히 나오고, 다음 질문 여유를 남긴다.
 */
const GROQ_PREFERRED_COMPLETION_TOKENS = 3072;
/** TPM 계산 여유(추정 오차·툴 스키마 등) */
const GROQ_TPM_MARGIN_TOKENS = 256;
/** 도구 선언 JSON 대략 토큰 */
const GROQ_TOOLS_OVERHEAD_TOKENS = 700;

/**
 * Groq on_demand TPM 상한(요청 1건의 prompt+max_tokens 합이 이 값을 넘으면 413).
 * 남은 분당 잔량이 아니라 "한 요청 크기" 게이트에 가깝다.
 * 실제 잔여 TPM 초과(분당 사용량)는 429로 오며, 그때는 다음 질문부터 정책 안내.
 */
function getGroqTpmRequestCeiling(modelName: string): number {
  const m = modelName.toLowerCase();
  if (m.includes('compound')) return 8000;
  if (m.includes('gpt-oss-120b')) return 8000;
  if (m.includes('gpt-oss-20b') || m.includes('gpt-oss-safeguard')) return 8000;
  if (m.includes('qwen')) return 8000;
  if (m.includes('llama-3.3-70b')) return 12000;
  if (m.includes('llama-3.1-8b')) return 30000;
  return 8000;
}

function getGroqModelMaxCompletion(modelName: string): number {
  const m = modelName.toLowerCase();
  if (m.includes('compound')) return 8192;
  if (m.includes('gpt-oss')) return 65536;
  if (m.includes('qwen')) return 16384;
  if (m.includes('llama-3.3-70b')) return 32768;
  if (m.includes('llama-3.1-8b')) return 8192;
  return 8192;
}

/** 한국어 비중 높은 채팅용 보수적 추정(문자/2). 과소평가하면 413이 나므로 여유 있게. */
function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 2));
}

function estimateGroqMessagesTokens(messages: Array<Record<string, unknown>>): number {
  let n = 0;
  for (const m of messages) {
    n += 6;
    const content = m.content;
    if (typeof content === 'string') n += estimateTextTokens(content);
    else if (content == null) n += 1;
    else n += estimateTextTokens(JSON.stringify(content));
    const toolCalls = m.tool_calls;
    if (Array.isArray(toolCalls)) {
      n += estimateTextTokens(JSON.stringify(toolCalls));
    }
  }
  return n;
}

function isGroqTokenOrRateLimit(status: number, errorBody: string): boolean {
  if (status === 429) return true;
  if (status === 413) return true;
  return /rate_limit_exceeded|tokens per minute|\bTPM\b|Request too large/i.test(errorBody);
}

/** 413 "한 요청이 너무 큼"(설정/예약) vs 429 "분당 한도 소진"(정책) */
function isGroqRequestTooLargeForBudget(status: number, errorBody: string): boolean {
  if (status === 413) return true;
  return /Request too large|please reduce your message size/i.test(errorBody);
}

function isGroqSpuriousToolCallError(status: number, errorBody: string): boolean {
  if (status !== 400) return false;
  return /Tool choice is none, but model called a tool|tool_use_failed/i.test(errorBody);
}

/** Groq 429 본문: Limit/Used/Requested — 남은 TPM으로 max_tokens 줄여 즉시 재시도 가능한지 판별 */
function parseGroqTpmUsage(errorBody: string): {
  limit: number;
  used: number;
  requested: number;
  remaining: number;
} | null {
  const m = errorBody.match(
    /Limit\s+([0-9]+)\s*,\s*Used\s+([0-9]+)\s*,\s*Requested\s+([0-9]+)/i,
  );
  if (!m) return null;
  const limit = Number(m[1]);
  const used = Number(m[2]);
  const requested = Number(m[3]);
  if (![limit, used, requested].every((n) => Number.isFinite(n))) return null;
  return { limit, used, requested, remaining: Math.max(0, limit - used) };
}

/**
 * Qwen/GPT-OSS 등이 content에 넣는 내부 추론(<think>…)·지시문 인용·
 * Groq browser_search 인라인 인용(【2†L6-L10】)을 사용자 답에서 제거.
 */
function stripModelPrivateReasoning(text: string): string {
  return sanitizeAssistantVisibleText(text);
}

function sanitizeAssistantVisibleText(text: string): string {
  let t = text ?? '';
  if (!t) return '';
  t = t.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
  t = t.replace(/<reason(?:ing)?\b[^>]*>[\s\S]*?<\/reason(?:ing)?>/gi, '');
  t = t.replace(/<redacted_reasoning>[\s\S]*?<\/redacted_reasoning>/gi, '');
  // 닫히지 않은 think 블록(앞부분만 추론)
  t = t.replace(/<think\b[^>]*>[\s\S]*$/gi, '');
  // think 닫힘만 남은 경우
  t = t.replace(/^[\s\S]*?<\/think>\s*/i, '');
  // 흔한 내부 독백 헤더
  t = t.replace(/^(?:Here's a thinking process:|The user is asking[\s\S]*?\n\n)(?=[가-힣A-Z])/i, '');
  // Groq browser_search / OpenAI 계열 인라인 인용 — 예: 【2†L6-L10】, 【3】, [1†L1-L4]
  t = t.replace(/\u3010\d+\u2020[^\u3011]*\u3011/g, '');
  t = t.replace(/\u3010\d+\u3011/g, '');
  t = t.replace(/【\d+†[^】]*】/g, '');
  t = t.replace(/【\d+】/g, '');
  t = t.replace(/\[\d+\u2020[^\]]*\]/g, '');
  t = t.replace(/\[\d+†[^\]]*\]/g, '');
  // 시스템 지시 블록이 그대로 새어 나온 경우
  t = t.replace(/\[WEB_SEARCH_ENABLED\][^\n]*(?:\n(?!\[[A-Z_]+)[^\n]*)*/g, '');
  t = t.replace(/\[CURRENT_DATETIME\][^\n]*(?:\n(?!\[[A-Z_]+)[^\n]*)*/g, '');
  t = t.replace(/\[TOOLS\][^\n]*(?:\n(?!\[[A-Z_]+)[^\n]*)*/g, '');
  t = t.replace(/\[DOWNLOAD_RULES\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[TOOL_USAGE_RULES\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[INTERNAL_CLIENT_STATE\][\s\S]*$/g, '');
  t = t.replace(/\[INTERNAL\][\s\S]*$/g, '');
  t = t.replace(/\[AI_LAB_[A-Z0-9_]+\][\s\S]*$/g, '');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/ ?\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.replace(/^\s+|\s+$/g, '').trim();
}

/** DB에 잘못 저장된 내부 마커·칩 API 전문 → 사용자 표시/히스토리용으로 정리 */
function sanitizeStoredChatContent(raw: string): string {
  let t = stripLegacySourcesMarker(raw ?? '');
  if (!t.trim()) return '';
  if (/\[AI_LAB_TRACK_SELECT\]/.test(t)) {
    const labelLine = t.match(/사용자가 곡을 선택했다:\s*(.+)/);
    const label = labelLine?.[1]?.trim().split(/\r?\n/)[0]?.trim();
    if (label) return label;
    const jsonMatch = t.match(/\[AI_LAB_TRACK_SELECT\](\{[\s\S]*?\})/);
    if (jsonMatch?.[1]) {
      try {
        const obj = JSON.parse(jsonMatch[1]) as {
          artist?: string;
          title?: string;
          album?: string;
        };
        const artist = String(obj.artist ?? '').trim();
        const title = String(obj.title ?? '').trim();
        const album = String(obj.album ?? '').trim();
        if (artist && title) {
          return album ? `${artist} - ${title} (${album})` : `${artist} - ${title}`;
        }
        if (title) return title;
      } catch {
        // ignore
      }
    }
    return '선택한 곡';
  }
  if (/\[AI_LAB_DOWNLOAD_STARTED\]/.test(t)) {
    const artist = t.match(/\bartist=([^\n]+)/)?.[1]?.trim();
    const title = t.match(/\btitle=([^\n]+?)(?:\s+artist=|$)/)?.[1]?.trim();
    if (artist && title) return `${artist} - ${title}`;
    if (title) return title;
    return '선택한 곡';
  }
  return sanitizeAssistantVisibleText(t);
}

function parseTrackSelectHitPayload(raw: unknown): {
  ref: string;
  platform: string;
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  externalUrl: string;
  releaseDate: string;
  genre: string;
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ref = String(o.ref ?? '').trim();
  const title = String(o.title ?? '').trim();
  const artist = String(o.artist ?? '').trim();
  if (!ref || !title || !artist) return null;
  return {
    ref,
    platform: String(o.platform ?? 'melon').trim() || 'melon',
    title,
    artist,
    album: String(o.album ?? ''),
    imageUrl: String(o.imageUrl ?? ''),
    externalUrl: String(o.externalUrl ?? ''),
    releaseDate: String(o.releaseDate ?? ''),
    genre: String(o.genre ?? ''),
  };
}

function buildUserTextForLlmFromClientHints(params: {
  displayMessage: string;
  trackSelectHit: ReturnType<typeof parseTrackSelectHitPayload>;
  downloadAlreadyStarted: boolean;
}): string {
  const display = params.displayMessage.trim();
  const hit = params.trackSelectHit;
  if (!hit) return display;
  const hitJson = JSON.stringify({
    ref: hit.ref,
    platform: hit.platform,
    title: hit.title,
    artist: hit.artist,
    album: hit.album,
    imageUrl: hit.imageUrl,
    externalUrl: hit.externalUrl,
    releaseDate: hit.releaseDate,
    genre: hit.genre,
  });
  if (params.downloadAlreadyStarted) {
    return (
      `${display}\n\n` +
      `[INTERNAL_CLIENT_STATE]\n` +
      `오디오 다운로드는 앱이 이미 시작했다. search_music/start_music_download 호출 금지.\n` +
      `가사 생성이 가능하면 「가사도 생성을 할까요?」만 덧붙인다.\n` +
      `hit=${hitJson}`
    );
  }
  return (
    `${display}\n\n` +
    `[INTERNAL_CLIENT_STATE]\n` +
    `사용자가 곡을 선택했다. search_* 금지.\n` +
    `start_music_download(hit, lyricsOption=none) function call 필수.\n` +
    `hit=${hitJson}`
  );
}

/** 과거에 Content에 붙였던 출처 마커만 제거(더 이상 저장하지 않음). */
const NRM_SOURCES_WRAP_START = '\n\n\u001eNRM_SOURCES:';
const NRM_SOURCES_WRAP_END = '\u001e';

function stripLegacySourcesMarker(raw: string): string {
  const text = raw ?? '';
  const start = text.lastIndexOf(NRM_SOURCES_WRAP_START);
  if (start < 0) return text;
  const payloadStart = start + NRM_SOURCES_WRAP_START.length;
  const end = text.indexOf(NRM_SOURCES_WRAP_END, payloadStart);
  if (end < 0) return text;
  return text.slice(0, start).replace(/\s+$/g, '');
}

/**
 * 스트리밍 중 【…】 인라인 인용은 닫히기 전까지 보류하고, sanitize 후 증가분만 onDelta.
 */
function createVisibleDeltaEmitter(onDelta: (deltaText: string) => void) {
  let emitted = '';
  let raw = '';

  const emitFromRaw = (includeIncompleteCitation: boolean) => {
    let work = raw;
    if (!includeIncompleteCitation) {
      const incomplete = work.match(/(?:【|\u3010)[^】\u3011]*$/);
      if (incomplete && incomplete.index != null) {
        work = work.slice(0, incomplete.index);
      }
    }
    const clean = sanitizeAssistantVisibleText(work);
    if (clean.startsWith(emitted)) {
      const add = clean.slice(emitted.length);
      if (add) {
        emitted = clean;
        onDelta(add);
      }
      return;
    }
    emitted = clean;
  };

  return {
    push(chunk: string) {
      if (!chunk) return;
      raw += chunk;
      emitFromRaw(false);
    },
    finish(): string {
      emitFromRaw(true);
      const clean = sanitizeAssistantVisibleText(raw);
      if (clean.startsWith(emitted)) {
        const add = clean.slice(emitted.length);
        if (add) onDelta(add);
      }
      emitted = clean;
      return clean;
    },
    getRaw(): string {
      return raw;
    },
  };
}

async function readSseDataLines(
  res: Response,
  onDataJson: (json: Record<string, unknown>) => void,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 이벤트는 빈 줄로 구분
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const eventBlock = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = eventBlock.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as Record<string, unknown>;
          onDataJson(json);
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }
  // trailing data: without blank line
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        onDataJson(JSON.parse(payload) as Record<string, unknown>);
      } catch {
        // ignore
      }
    }
  }
}

function groqToolsOpenAi(_mode: 'download' | 'web_search' = 'download'): Array<Record<string, unknown>> {
  return toOpenAiFunctionTools();
}

/** @deprecated */
function groqDownloadToolsOpenAi(): Array<Record<string, unknown>> {
  return groqToolsOpenAi('download');
}

function buildGroqChatMessages(
  history: ChatTurn[],
  userMessage: string,
  systemText: string,
  toolContinue?: StreamOptions['toolContinue'],
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemText },
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.content,
    })),
  ];

  if (toolContinue) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolContinue.modelFunctionCalls.map((fc) => ({
        id: fc.callId,
        type: 'function',
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args ?? {}),
        },
      })),
    });
    for (let i = 0; i < toolContinue.functionResponses.length; i += 1) {
      const fr = toolContinue.functionResponses[i]!;
      const fc = toolContinue.modelFunctionCalls[i];
      messages.push({
        role: 'tool',
        tool_call_id: fc?.callId ?? `tool_${i}`,
        content: JSON.stringify(fr.response ?? {}),
      });
    }
    return messages;
  }

  if (userMessage.trim()) {
    messages.push({ role: 'user', content: userMessage });
  }
  return messages;
}

/**
 * 질문 거절 없이 보내기: 과거 대화만 줄이고, max_tokens는 TPM 한도 안에서 최대로.
 * (짧은 질문에 max_tokens=8192 고정 → 413 나던 문제 / 너무 작게 잡아 답변 잘리던 문제 동시 해결)
 */
function prepareGroqMessagesAndMaxTokens(params: {
  modelName: string;
  history: ChatTurn[];
  userMessage: string;
  systemText: string;
  toolContinue?: StreamOptions['toolContinue'];
  withTools: boolean;
}): {
  messages: Array<Record<string, unknown>>;
  maxTokens: number;
  inputTokenEst: number;
  droppedHistoryTurns: number;
} {
  const tpmCeiling = getGroqTpmRequestCeiling(params.modelName);
  const modelMaxOut = getGroqModelMaxCompletion(params.modelName);
  const toolsOverhead = params.withTools ? GROQ_TOOLS_OVERHEAD_TOKENS : 0;

  let history = [...params.history];
  let droppedHistoryTurns = 0;

  const build = () =>
    buildGroqChatMessages(history, params.userMessage, params.systemText, params.toolContinue);

  let messages = build();
  let inputEst = estimateGroqMessagesTokens(messages) + toolsOverhead;

  // 과거 턴을 앞에서부터 제거해, 최소 완료 토큰 + 현재 질문(+시스템)이 TPM 안에 들어가게 한다.
  while (
    history.length > 0 &&
    inputEst + GROQ_MIN_COMPLETION_TOKENS + GROQ_TPM_MARGIN_TOKENS > tpmCeiling
  ) {
    history = history.slice(1);
    droppedHistoryTurns += 1;
    messages = build();
    inputEst = estimateGroqMessagesTokens(messages) + toolsOverhead;
  }

  // tool continue 시 history만으로 부족하면 tool payload를 줄일 여지는 적음 — max_tokens만 축소.
  // TPM 전부를 예약하지 않는다(다음 질문이 같은 분에 바로 429 나는 것 방지).
  let maxTokens = Math.min(
    modelMaxOut,
    GROQ_PREFERRED_COMPLETION_TOKENS,
    Math.max(256, tpmCeiling - inputEst - GROQ_TPM_MARGIN_TOKENS),
  );
  // 가능하면 최소 완료 보장
  if (maxTokens < GROQ_MIN_COMPLETION_TOKENS && inputEst + GROQ_MIN_COMPLETION_TOKENS + GROQ_TPM_MARGIN_TOKENS <= tpmCeiling) {
    maxTokens = GROQ_MIN_COMPLETION_TOKENS;
  }

  return {
    messages,
    maxTokens,
    inputTokenEst: inputEst,
    droppedHistoryTurns,
  };
}

function parseGroqChatCompletion(json: Record<string, unknown> | null): {
  text: string;
  functionCalls: Array<{ callId: string; name: string; args: Record<string, unknown> }>;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason: string | null;
} {
  // deno-lint-ignore no-explicit-any
  const choice: any = Array.isArray(json?.choices) ? (json as any).choices[0] : null;
  const message = choice?.message ?? {};
  let text = '';
  if (typeof message.content === 'string') {
    text = message.content.trim();
  } else if (Array.isArray(message.content)) {
    // 일부 모델은 content 를 parts 배열로 반환
    text = message.content
      .map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('')
      .trim();
  }
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const functionCalls: Array<{ callId: string; name: string; args: Record<string, unknown> }> = [];
  for (const tc of toolCalls) {
    const name = String(tc?.function?.name ?? '').trim();
    if (!name) continue;
    let args: Record<string, unknown> = {};
    const rawArgs = tc?.function?.arguments;
    if (typeof rawArgs === 'string' && rawArgs.trim()) {
      try {
        const parsed = JSON.parse(rawArgs);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    } else if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
      args = rawArgs as Record<string, unknown>;
    }
    functionCalls.push({
      callId: String(tc?.id ?? `${name}_${functionCalls.length}`),
      name,
      args,
    });
  }
  // deno-lint-ignore no-explicit-any
  const usage: any = (json as any)?.usage ?? {};
  const inputTokens = Number(usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);
  return {
    text,
    functionCalls,
    inputTokens,
    outputTokens,
    totalTokens,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
  };
}

const groqAdapter: LlmAdapter = {
  async stream(apiKey, modelName, history, userMessage, onDelta, options) {
    const enableDownloadTools = options?.enableDownloadTools === true;
    /** 웹 검색(browser_search) 전면 비활성 */
    const enableWebSearch = false;
    const toolContinue = options?.toolContinue;
    const needsWebSearch = false;
    const toolMode: 'download' | 'web_search' | 'none' = enableDownloadTools || toolContinue
      ? 'download'
      : 'none';

    const useBrowserSearch = false;
    const effectiveModelName = modelName;

    let systemText = resolveAdapterSystemInstruction(options?.adminSystemInstruction, {
      enableWebSearch: useBrowserSearch,
      enableTools: toolMode !== 'none',
    });

    const attemptLabel =
      toolMode === 'download'
        ? toolContinue
          ? 'download_tools_continue'
          : 'download_tools'
        : 'plain';
    const attemptStarted = Date.now();
    const attemptDiags: GeminiAttemptDiag[] = [];

    let workingHistory = [...history];
    // 네이티브 웹검색은 Groq 서버가 실행 — OpenAI function tools 아님(다운로드만 FC).
    let sendTools = toolMode === 'download';
    let prepared = prepareGroqMessagesAndMaxTokens({
      modelName: effectiveModelName,
      history: workingHistory,
      userMessage,
      systemText,
      toolContinue,
      withTools: sendTools,
    });

    const doFetch = async (
      messages: Array<Record<string, unknown>>,
      maxTokens: number,
      asStream = false,
      opts?: { forcePlain?: boolean },
    ) => {
      const forcePlain = opts?.forcePlain === true;
      const body: Record<string, unknown> = {
        model: forcePlain ? modelName : effectiveModelName,
        messages,
        temperature: 0.8,
        max_tokens: maxTokens,
        stream: asStream,
      };
      // 출처/인라인 인용을 아예 요청하지 않음(본문 【n†…】·annotation 비용 회피).
      if (useBrowserSearch && !forcePlain) {
        body.citation_options = 'disabled';
      }
      if (!forcePlain && sendTools && toolMode === 'download') {
        body.tools = groqToolsOpenAi('download');
        body.tool_choice = 'auto';
      } else if (!forcePlain && useBrowserSearch) {
        body.tools = [{ type: 'browser_search' }];
        body.tool_choice = 'required';
      }
      return fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GROQ_CHAT_TIMEOUT_MS),
      });
    };

    const consumeGroqStream = async (
      streamRes: Response,
      onTextDelta: (t: string) => void,
    ): Promise<{
      text: string;
      functionCalls: Array<{ callId: string; name: string; args: Record<string, unknown> }>;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      finishReason: string | null;
      // deno-lint-ignore no-explicit-any
      rawMessage: any;
    }> => {
      const emitter = createVisibleDeltaEmitter(onTextDelta);
      let finishReason: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      const toolAcc = new Map<number, { id: string; name: string; args: string }>();
      // deno-lint-ignore no-explicit-any
      let lastMessage: any = {};

      await readSseDataLines(streamRes, (json) => {
        // deno-lint-ignore no-explicit-any
        const j = json as any;
        if (j?.usage) {
          inputTokens = Number(j.usage.prompt_tokens ?? inputTokens);
          outputTokens = Number(j.usage.completion_tokens ?? outputTokens);
          totalTokens = Number(j.usage.total_tokens ?? inputTokens + outputTokens);
        }
        const choice = Array.isArray(j?.choices) ? j.choices[0] : null;
        if (!choice) return;
        if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content) {
          emitter.push(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = Number(tc.index ?? 0);
            const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
            if (typeof tc.id === 'string' && tc.id) cur.id = tc.id;
            if (typeof tc.function?.name === 'string' && tc.function.name) {
              cur.name += tc.function.name;
            }
            if (typeof tc.function?.arguments === 'string') {
              cur.args += tc.function.arguments;
            }
            toolAcc.set(idx, cur);
          }
        }
        if (choice.message) lastMessage = { ...lastMessage, ...choice.message };
      });

      const text = emitter.finish();
      const functionCalls: Array<{ callId: string; name: string; args: Record<string, unknown> }> = [];
      for (const [, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
        const name = tc.name.trim();
        if (!name) continue;
        let args: Record<string, unknown> = {};
        if (tc.args.trim()) {
          try {
            const parsedArgs = JSON.parse(tc.args);
            if (parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)) {
              args = parsedArgs as Record<string, unknown>;
            }
          } catch {
            args = {};
          }
        }
        functionCalls.push({
          callId: tc.id || `${name}_${functionCalls.length}`,
          name,
          args,
        });
      }
      return {
        text,
        functionCalls,
        inputTokens,
        outputTokens,
        totalTokens,
        finishReason,
        rawMessage: lastMessage,
      };
    };

    // 최대 4회: 예산 축소 / 잔여 TPM(최소 완료 토큰 이상일 때만) / 가짜 tool call 재시도
    let res: Response | null = null;
    let lastErrBody = '';
    let usedMaxTokens = prepared.maxTokens;
    let forcedNoToolsRetry = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        const tooLarge = isGroqRequestTooLargeForBudget(res?.status ?? 0, lastErrBody);
        const tpmUsage = parseGroqTpmUsage(lastErrBody);
        const fitForMin =
          tpmUsage != null
            ? tpmUsage.remaining - prepared.inputTokenEst - GROQ_TPM_MARGIN_TOKENS
            : 0;
        // 잔여 TPM으로 MIN 완료를 못 채우면 축소 재시도 금지(661토큰→think만 쓰고 빈 답 버그)
        const canShrinkForRemainingTpm =
          res?.status === 429 && tpmUsage != null && fitForMin >= GROQ_MIN_COMPLETION_TOKENS;
        const spuriousTool = isGroqSpuriousToolCallError(res?.status ?? 0, lastErrBody);

        if (spuriousTool && !forcedNoToolsRetry && toolMode !== 'web_search') {
          forcedNoToolsRetry = true;
          sendTools = false;
          systemText = appendNoToolsGuard(
            buildChatSystemInstruction(options?.adminSystemInstruction) +
              '\n\n이전 시도에서 도구를 호출해 실패했다. 이번엔 절대 tool call 없이 한국어 텍스트만 답한다.',
          );
          prepared = prepareGroqMessagesAndMaxTokens({
            modelName: effectiveModelName,
            history: workingHistory,
            userMessage,
            systemText,
            toolContinue,
            withTools: false,
          });
          usedMaxTokens = prepared.maxTokens;
        } else if (tooLarge || canShrinkForRemainingTpm) {
          if (canShrinkForRemainingTpm && tpmUsage) {
            usedMaxTokens = Math.max(
              GROQ_MIN_COMPLETION_TOKENS,
              Math.min(usedMaxTokens, fitForMin),
            );
          } else {
            usedMaxTokens = Math.max(
              GROQ_MIN_COMPLETION_TOKENS,
              Math.floor(usedMaxTokens * 0.55),
            );
          }
          if (workingHistory.length > 0) {
            const drop = Math.max(1, Math.ceil(workingHistory.length / 2));
            workingHistory = workingHistory.slice(drop);
            prepared = prepareGroqMessagesAndMaxTokens({
              modelName: effectiveModelName,
              history: workingHistory,
              userMessage,
              systemText,
              toolContinue,
              withTools: sendTools,
            });
            usedMaxTokens = Math.min(usedMaxTokens, prepared.maxTokens);
            if (canShrinkForRemainingTpm && tpmUsage) {
              const fit =
                tpmUsage.remaining - prepared.inputTokenEst - GROQ_TPM_MARGIN_TOKENS;
              if (fit < GROQ_MIN_COMPLETION_TOKENS) break;
              usedMaxTokens = Math.max(GROQ_MIN_COMPLETION_TOKENS, Math.min(usedMaxTokens, fit));
            }
          }
        } else {
          break;
        }
      }

      try {
        res = await doFetch(prepared.messages, usedMaxTokens, false);
      } catch (e) {
        const aborted =
          (e instanceof Error && (e.name === 'AbortError' || /aborted|timeout/i.test(e.message))) ||
          (typeof e === 'object' && e != null && 'name' in e && (e as { name?: string }).name === 'AbortError');
        const errorMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        attemptDiags.push({
          attemptIndex: attempt + 1,
          attemptLabel,
          withSearch: false,
          maxOutputTokens: usedMaxTokens,
          ok: false,
          httpStatus: null,
          errorKind: aborted ? 'timeout' : 'network',
          errorMessage: errorMessage.slice(0, 800),
          finishReason: null,
          blockReason: null,
          groundedQueryCount: 0,
          elapsedMs: Date.now() - attemptStarted,
        });
        return {
          ok: false,
          kind: 'network',
          message: errorMessage,
          attempts: attemptDiags,
          needsWebSearch,
        };
      }

      if (res.ok) break;

      lastErrBody = await res.text().catch(() => '');
      const tpmUsage = parseGroqTpmUsage(lastErrBody);
      const fitForMin =
        tpmUsage != null
          ? tpmUsage.remaining - prepared.inputTokenEst - GROQ_TPM_MARGIN_TOKENS
          : 0;
      const retryableSize = isGroqRequestTooLargeForBudget(res.status, lastErrBody);
      const retryableRemainingTpm =
        res.status === 429 && tpmUsage != null && fitForMin >= GROQ_MIN_COMPLETION_TOKENS;
      const retryableTool =
        isGroqSpuriousToolCallError(res.status, lastErrBody) && !forcedNoToolsRetry;
      const retryable = retryableSize || retryableRemainingTpm || retryableTool;
      attemptDiags.push({
        attemptIndex: attempt + 1,
        attemptLabel: retryable ? `${attemptLabel}_retry` : attemptLabel,
        withSearch: false,
        maxOutputTokens: usedMaxTokens,
        ok: false,
        httpStatus: res.status,
        errorKind: isGroqTokenOrRateLimit(res.status, lastErrBody) ? 'rate_limit' : 'other',
        errorMessage: lastErrBody.slice(0, 800),
        finishReason: null,
        blockReason: null,
        groundedQueryCount: 0,
        elapsedMs: Date.now() - attemptStarted,
      });

      if (!retryable || attempt === 3) {
        const rateLimited = isGroqTokenOrRateLimit(res.status, lastErrBody);
        const kind =
          res.status === 401 || res.status === 403
            ? 'auth'
            : rateLimited
              ? 'rate_limit'
              : 'other';
        return {
          ok: false,
          kind,
          status: res.status,
          message: lastErrBody.slice(0, rateLimited ? 6000 : 800) || `groq: http_${res.status}`,
          attempts: attemptDiags,
          needsWebSearch,
        };
      }
    }

    if (!res || !res.ok) {
      return {
        ok: false,
        kind: 'other',
        message: lastErrBody.slice(0, 800) || 'groq: request failed',
        attempts: attemptDiags,
        needsWebSearch,
      };
    }

    // browser_search + stream 조합에서 delta.content 가 비는 경우가 있어
    // 검증된 non-stream JSON 경로를 쓰고, UI 타이핑은 emitAsTypingDeltas 로 전달한다.
    // deno-lint-ignore no-explicit-any
    const json: any = await res.json().catch(() => null);
    if (!json) {
      attemptDiags.push({
        attemptIndex: attemptDiags.length + 1,
        attemptLabel,
        withSearch: needsWebSearch,
        maxOutputTokens: usedMaxTokens,
        ok: false,
        httpStatus: res.status,
        errorKind: 'other',
        errorMessage: 'groq: invalid json response',
        finishReason: null,
        blockReason: null,
        groundedQueryCount: 0,
        elapsedMs: Date.now() - attemptStarted,
      });
      return {
        ok: false,
        kind: 'other',
        status: res.status,
        message: 'groq: invalid json response',
        attempts: attemptDiags,
        needsWebSearch,
      };
    }

    let parsed = parseGroqChatCompletion(json);
    if (toolMode !== 'download') {
      parsed = { ...parsed, functionCalls: [] };
    }

    parsed = { ...parsed, text: stripModelPrivateReasoning(parsed.text) };

    // 빈 답(think만 / stop+empty / length) → 검색·툴 없이 최종 답만 1회 재요청
    if (!parsed.text && parsed.functionCalls.length === 0) {
      const finalOnlyMessages = [
        ...prepared.messages,
        {
          role: 'user',
          content:
            '내부 생각·지시문 인용·<think> 출력 없이, 위 질문에 대한 최종 답변만 한국어로 짧게 작성해 줘.',
        },
      ];
      const contInputEst = estimateGroqMessagesTokens(finalOnlyMessages);
      const tpmCeiling = getGroqTpmRequestCeiling(modelName);
      const contMax = Math.min(
        GROQ_PREFERRED_COMPLETION_TOKENS,
        getGroqModelMaxCompletion(modelName),
        Math.max(GROQ_MIN_COMPLETION_TOKENS, tpmCeiling - contInputEst - GROQ_TPM_MARGIN_TOKENS),
      );
      try {
        const contRes = await doFetch(finalOnlyMessages, contMax, false, { forcePlain: true });
        if (contRes.ok) {
          // deno-lint-ignore no-explicit-any
          const contJson: any = await contRes.json().catch(() => null);
          const contParsed = parseGroqChatCompletion(contJson);
          const contText = stripModelPrivateReasoning(contParsed.text);
          if (contText) {
            parsed = { ...contParsed, text: contText, functionCalls: [] };
            usedMaxTokens = contMax;
          }
        }
      } catch {
        // ignore
      }
    }

    // finish_reason=length 로 답이 잘리면 이어서 1회 더 요청
    if (
      parsed.finishReason === 'length' &&
      parsed.text &&
      parsed.functionCalls.length === 0 &&
      usedMaxTokens >= 512
    ) {
      const contMessages = [
        ...prepared.messages,
        { role: 'assistant', content: parsed.text },
        {
          role: 'user',
          content:
            '이어서 답변을 끝까지 완성해 줘. 앞에서 이미 말한 내용은 반복하지 말고, 끊긴 부분부터 자연스럽게 이어 써. <think>는 쓰지 마.',
        },
      ];
      const contInputEst = estimateGroqMessagesTokens(contMessages) + (sendTools ? GROQ_TOOLS_OVERHEAD_TOKENS : 0);
      const tpmCeiling = getGroqTpmRequestCeiling(effectiveModelName);
      const contMax = Math.min(
        GROQ_PREFERRED_COMPLETION_TOKENS,
        getGroqModelMaxCompletion(effectiveModelName),
        Math.max(256, tpmCeiling - contInputEst - GROQ_TPM_MARGIN_TOKENS),
      );
      try {
        const contRes = await doFetch(contMessages, contMax, false);
        if (contRes.ok) {
          // deno-lint-ignore no-explicit-any
          const contJson: any = await contRes.json().catch(() => null);
          const contParsed = parseGroqChatCompletion(contJson);
          const contText = stripModelPrivateReasoning(contParsed.text);
          if (contText) {
            parsed = {
              ...parsed,
              text: `${parsed.text}${contText}`.trim(),
              outputTokens: parsed.outputTokens + contParsed.outputTokens,
              totalTokens: parsed.totalTokens + contParsed.totalTokens,
              finishReason: contParsed.finishReason,
            };
          }
        }
      } catch {
        // 이어쓰기 실패해도 앞부분 답은 전달
      }
    }

    parsed = { ...parsed, text: stripModelPrivateReasoning(parsed.text) };

    if (!parsed.text && parsed.functionCalls.length === 0) {
      attemptDiags.push({
        attemptIndex: attemptDiags.length + 1,
        attemptLabel,
        withSearch: needsWebSearch,
        maxOutputTokens: usedMaxTokens,
        ok: false,
        httpStatus: res.status,
        errorKind: 'other',
        errorMessage: `groq: empty response (finish=${parsed.finishReason ?? '?'})`,
        finishReason: parsed.finishReason,
        blockReason: null,
        groundedQueryCount: 0,
        elapsedMs: Date.now() - attemptStarted,
      });
      return {
        ok: false,
        kind: 'other',
        status: res.status,
        message: `groq: empty response (finish=${parsed.finishReason ?? '?'})`,
        attempts: attemptDiags,
        needsWebSearch,
      };
    }

    attemptDiags.push({
      attemptIndex: attemptDiags.length + 1,
      attemptLabel,
      withSearch: needsWebSearch,
      maxOutputTokens: usedMaxTokens,
      ok: true,
      httpStatus: res.status,
      errorKind: null,
      errorMessage:
        prepared.droppedHistoryTurns > 0
          ? `dropped_history_turns=${prepared.droppedHistoryTurns}; inputEst=${prepared.inputTokenEst}`
          : useBrowserSearch && effectiveModelName !== modelName
            ? `effectiveModel=${effectiveModelName}`
            : null,
      finishReason: parsed.finishReason,
      blockReason: null,
      groundedQueryCount: needsWebSearch ? 1 : 0,
      elapsedMs: Date.now() - attemptStarted,
    });

    if (parsed.text) {
      await emitAsTypingDeltas(parsed.text, onDelta);
    }

    return {
      ok: true,
      text: parsed.text,
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      totalTokens: parsed.totalTokens,
      finishReason: parsed.finishReason ?? undefined,
      grounded: needsWebSearch,
      groundedQueryCount: needsWebSearch ? 1 : 0,
      attempts: attemptDiags,
      needsWebSearch,
      functionCalls: toolMode === 'download' ? parsed.functionCalls : [],
    };
  },

  async generateTitle(apiKey, modelName, userMessage) {
    const prompt =
      '다음은 사용자가 채팅에서 처음 보낸 메시지다. 이 대화를 대표하는 아주 짧은 한국어 제목을 만들어라.\n' +
      '규칙: 명사형으로 12자 이내. 설명·따옴표·마침표 없이 제목 한 줄만 출력. 메시지를 그대로 베끼지 말고 핵심 주제만 요약.\n\n' +
      `사용자 메시지:\n${userMessage}`;
    try {
      const res = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 40,
          stream: false,
        }),
        signal: AbortSignal.timeout(GEMINI_TITLE_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      // deno-lint-ignore no-explicit-any
      const json: any = await res.json().catch(() => null);
      if (!json) return null;
      const raw = String(json?.choices?.[0]?.message?.content ?? '');
      const title = sanitizeGeneratedTitle(raw);
      if (!title) return null;
      const usage = json?.usage ?? {};
      return {
        title,
        inputTokens: Number(usage.prompt_tokens ?? 0),
        outputTokens: Number(usage.completion_tokens ?? 0),
        totalTokens: Number(usage.total_tokens ?? 0),
      };
    } catch {
      return null;
    }
  },
};

/** Provider Registry 등록 — 새 Provider는 registerAdapterAsProvider / registerProvider 만 추가 */
registerAdapterAsProvider({
  id: 'Google',
  displayName: 'Google Gemini',
  stream: (apiKey, modelName, history, userMessage, onDelta, options) =>
    geminiAdapter.stream(apiKey, modelName, history, userMessage, onDelta, options),
  generateTitle: (apiKey, modelName, userMessage) =>
    geminiAdapter.generateTitle(apiKey, modelName, userMessage),
});
registerAdapterAsProvider({
  id: 'Groq',
  displayName: 'Groq',
  stream: (apiKey, modelName, history, userMessage, onDelta, options) =>
    groqAdapter.stream(apiKey, modelName, history, userMessage, onDelta, options),
  generateTitle: (apiKey, modelName, userMessage) =>
    groqAdapter.generateTitle(apiKey, modelName, userMessage),
});

/** @deprecated Registry 사용 — 호환용 맵 */
const ADAPTERS: Record<string, LlmAdapter> = {
  Google: geminiAdapter,
  Groq: groqAdapter,
};
void ADAPTERS;

async function fetchGoogleProviderApiKey(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('LLMProvider')
    .select('ApiKey')
    .eq('ProviderName', 'Google')
    .eq('IsActive', true)
    .limit(1)
    .maybeSingle();
  if (error || !data?.ApiKey) return null;
  return String(data.ApiKey);
}

function currentTargetMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

type PrepareTurnResult = {
  sessionId: number;
  isNewSession: boolean;
  title: string;
  userMessage: Record<string, unknown>;
  model: {
    modelId: number;
    providerId: number;
    providerName: string;
    modelName: string;
    modelDisplayName: string;
    apiKey: string;
    isActive: boolean;
  } | null;
  permission: { isApproved: boolean; allocatedToken: number } | null;
  quotaUsed: number;
  history: Array<{ role: string; content: string }>;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    if (req.method !== 'POST') {
      logWarn(requestId, 'method_not_allowed', { method: req.method });
      return jsonResponse({ error: 'method_not_allowed', requestId }, 405);
    }

    let payload: {
      serialNo?: string;
      modelId?: number;
      sessionId?: number | null;
      message?: string;
      enableWebSearch?: boolean;
      toolContinue?: boolean;
      toolResults?: Array<{
        callId?: string;
        name?: string;
        args?: Record<string, unknown>;
        response?: Record<string, unknown>;
      }>;
      /** Gemini Interactions FC continue: previous_interaction_id */
      previousInteractionId?: string | null;
      musicPlatformId?: string | null;
      musicPlatformLabel?: string | null;
      musicPlatformBlocked?: boolean;
      musicPlatformExplicit?: boolean;
    };
    try {
      payload = await req.json();
    } catch (e) {
      logErr(requestId, 'invalid_json', e);
      return jsonResponse({ error: 'invalid_json', requestId }, 400);
    }

    const serialNo = String(payload.serialNo ?? '').trim();
    const modelId = Number(payload.modelId);
    const sessionId = payload.sessionId != null ? Number(payload.sessionId) : null;
    const message = String(payload.message ?? '').trim();
    const isToolContinue = payload.toolContinue === true;
    const musicPlatformId = String(payload.musicPlatformId ?? 'melon').trim() || 'melon';
    const musicPlatformLabel =
      String(payload.musicPlatformLabel ?? '').trim() || musicPlatformId;
    const musicPlatformBlocked = payload.musicPlatformBlocked === true;
    const musicPlatformExplicit = payload.musicPlatformExplicit === true;
    const trackSelectHit = parseTrackSelectHitPayload(payload.trackSelectHit);
    const downloadAlreadyStarted = payload.downloadAlreadyStarted === true;
    const toolResultsRaw = Array.isArray(payload.toolResults) ? payload.toolResults : [];
    const toolResults = toolResultsRaw
      .map((r) => {
        const name = String(r?.name ?? '').trim();
        if (!name) return null;
        return {
          callId: String(r?.callId ?? ''),
          name,
          args: r?.args && typeof r.args === 'object' && !Array.isArray(r.args) ? r.args : {},
          response:
            r?.response && typeof r.response === 'object' && !Array.isArray(r.response)
              ? r.response
              : { ok: false, error: 'missing_response' },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    const previousInteractionId = String(payload.previousInteractionId ?? '').trim() || null;

    if (!serialNo || !Number.isFinite(modelId)) {
      logWarn(requestId, 'invalid_params', {
        hasSerialNo: !!serialNo,
        modelId: payload.modelId,
        hasMessage: !!message,
        toolContinue: isToolContinue,
      });
      return jsonResponse({ error: 'invalid_params', requestId }, 400);
    }
    if (isToolContinue) {
      if (sessionId == null || !Number.isFinite(sessionId) || toolResults.length === 0) {
        logWarn(requestId, 'invalid_tool_continue', {
          sessionId: sessionId ?? null,
          toolResultCount: toolResults.length,
        });
        return jsonResponse({ error: 'invalid_tool_continue', requestId }, 400);
      }
    } else if (!message) {
      logWarn(requestId, 'invalid_params', {
        hasSerialNo: !!serialNo,
        modelId: payload.modelId,
        hasMessage: false,
      });
      return jsonResponse({ error: 'invalid_params', requestId }, 400);
    }

    logInfo(requestId, 'request_received', {
      serialNo,
      modelId,
      sessionId: sessionId ?? 'new',
      messageLength: message.length,
      messagePreview: preview(message),
      // 레거시 필드 — Agent Intent가 검색을 결정하므로 무시한다(로그만 남김).
      legacyEnableWebSearchIgnored: payload.enableWebSearch === true,
      toolContinue: isToolContinue,
      toolResultCount: toolResults.length,
      previousInteractionId: previousInteractionId ? 'set' : null,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      logErr(requestId, 'server_misconfigured', new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing'));
      return jsonResponse({ error: 'server_misconfigured', requestId }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const targetMonth = currentTargetMonth();

    let prepared: PrepareTurnResult;

    if (isToolContinue) {
      // tool 이어가기: 새 사용자 메시지 INSERT 없이 세션/모델/권한/히스토리만 로드.
      const prepareStartedAt = Date.now();
      const { data: sessionRow, error: sessionError } = await supabase
        .from('ChatSession')
        .select('SessionID, Title, ProviderID, ModelID')
        .eq('SessionID', sessionId)
        .eq('SerialNo', serialNo)
        .eq('IsDeleted', false)
        .maybeSingle();
      if (sessionError || !sessionRow) {
        logErr(requestId, 'tool_continue_session_failed', sessionError ?? new Error('session_not_found'), {
          sessionId,
        });
        return jsonResponse({ error: 'prepare_failed', requestId, message: 'session_not_found' }, 500);
      }
      const effectiveModelId = Number(sessionRow.ModelID ?? modelId);
      const { data: modelRow, error: modelError } = await supabase
        .from('LLMModel')
        .select('ModelID, ProviderID, ModelName, ModelDisplayName, IsActive')
        .eq('ModelID', effectiveModelId)
        .maybeSingle();
      if (modelError) {
        logErr(requestId, 'tool_continue_model_failed', modelError, { modelId: effectiveModelId });
        return jsonResponse({ error: 'prepare_failed', requestId, message: modelError.message }, 500);
      }
      const providerId = Number(modelRow?.ProviderID ?? sessionRow.ProviderID ?? 0);
      const { data: providerRow } = await supabase
        .from('LLMProvider')
        .select('ProviderName, ApiKey')
        .eq('ProviderID', providerId)
        .maybeSingle();
      const { data: permRow } = await supabase
        .from('LLMUserPermission')
        .select('IsApproved, AllocatedToken')
        .eq('SerialNo', serialNo)
        .eq('ProviderID', providerId)
        .maybeSingle();
      const { data: quotaRow } = await supabase
        .from('LLMUserQuota')
        .select('TotalToken')
        .eq('SerialNo', serialNo)
        .eq('ProviderID', providerId)
        .eq('TargetMonth', targetMonth)
        .maybeSingle();
      const { data: historyRows } = await supabase
        .from('ChatMessage')
        .select('Role, Content, MessageID')
        .eq('SessionID', sessionId)
        .neq('Role', 'system')
        .order('MessageID', { ascending: false })
        .limit(CHAT_HISTORY_LIMIT);
      const historyAsc = (Array.isArray(historyRows) ? historyRows : [])
        .slice()
        .reverse()
        .map((h: { Role?: string; Content?: string }) => ({
          role: String(h.Role ?? ''),
          content: sanitizeStoredChatContent(String(h.Content ?? '')),
        }));
      prepared = {
        sessionId: Number(sessionRow.SessionID),
        isNewSession: false,
        title: String(sessionRow.Title ?? '대화'),
        userMessage: {
          MessageID: 0,
          SessionID: Number(sessionRow.SessionID),
          Role: serialNo,
          Content: '',
        },
        model: modelRow
          ? {
              modelId: Number(modelRow.ModelID),
              providerId,
              providerName: String(providerRow?.ProviderName ?? ''),
              modelName: String(modelRow.ModelName ?? ''),
              modelDisplayName: String(modelRow.ModelDisplayName ?? ''),
              apiKey: String(providerRow?.ApiKey ?? ''),
              isActive: modelRow.IsActive === true,
            }
          : null,
        permission: permRow
          ? {
              isApproved: permRow.IsApproved === true,
              allocatedToken: Number(permRow.AllocatedToken ?? 0),
            }
          : null,
        quotaUsed: Number(quotaRow?.TotalToken ?? 0),
        history: historyAsc,
      };
      logInfo(requestId, 'prepare_tool_continue_ok', {
        elapsedMs: Date.now() - prepareStartedAt,
        sessionId: prepared.sessionId,
        historyCount: historyAsc.length,
        toolResultCount: toolResults.length,
      });
    } else {
      const prepareStartedAt = Date.now();
      const { data: prepareData, error: prepareError } = await supabase.rpc('nrm_rpc_chat_prepare_turn', {
        p_serial_no: serialNo,
        p_model_id: modelId,
        p_session_id: sessionId,
        p_content: message,
        p_target_month: targetMonth,
        p_history_limit: CHAT_HISTORY_LIMIT,
      });
      const prepareElapsedMs = Date.now() - prepareStartedAt;
      if (prepareError || !prepareData) {
        logErr(requestId, 'prepare_turn_failed', prepareError ?? new Error('prepare_turn returned no data'), {
          elapsedMs: prepareElapsedMs,
          serialNo,
          modelId,
          sessionId: sessionId ?? 'new',
        });
        return jsonResponse({ error: 'prepare_failed', requestId, message: prepareError?.message }, 500);
      }
      prepared = prepareData as PrepareTurnResult;
      logInfo(requestId, 'prepare_turn_ok', {
        elapsedMs: prepareElapsedMs,
        sessionId: prepared.sessionId,
        isNewSession: prepared.isNewSession,
        modelFound: !!prepared.model,
        modelActive: prepared.model?.isActive ?? null,
        providerId: prepared.model?.providerId ?? null,
        providerName: prepared.model?.providerName ?? null,
        hasPermission: !!prepared.permission,
        isApproved: prepared.permission?.isApproved ?? null,
        allocatedToken: prepared.permission?.allocatedToken ?? null,
        quotaUsed: prepared.quotaUsed,
        historyCount: Array.isArray(prepared.history) ? prepared.history.length : 0,
      });
    }

    const { sessionId: resolvedSessionId, isNewSession, title, userMessage, model, permission, quotaUsed, history } =
      prepared;

    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    const runBackground = (task: Promise<unknown>) => {
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
      else void task;
    };

    /** 새 세션: 본문 LLM과 병렬로 짧은 요약 제목 생성. 성공 시 DB 갱신 + title_updated 이벤트. */
    const titleGenerationPromise: Promise<TitleResult | null> =
      isNewSession && model
        ? (() => {
            const adapter = ADAPTERS[model.providerName];
            if (!adapter?.generateTitle) return Promise.resolve(null);
            return adapter
              .generateTitle(model.apiKey, model.modelName, message)
              .catch((e) => {
                logErr(requestId, 'title_generate_threw', e, { sessionId: resolvedSessionId });
                return null;
              });
          })()
        : Promise.resolve(null);

    const applyGeneratedTitle = async (
      sendFn: (obj: Record<string, unknown>) => void,
    ): Promise<void> => {
      if (!isNewSession || !model) return;
      const titleResult = await titleGenerationPromise;
      if (!titleResult?.title) {
        logInfo(requestId, 'title_generate_skipped', {
          sessionId: resolvedSessionId,
          reason: 'empty_or_failed',
        });
        return;
      }
      const { error } = await supabase.rpc('nrm_rpc_chat_update_session_title', {
        p_session_id: resolvedSessionId,
        p_serial_no: serialNo,
        p_title: titleResult.title,
      });
      if (error) {
        logErr(requestId, 'title_update_failed', error, { sessionId: resolvedSessionId });
        return;
      }
      logInfo(requestId, 'title_update_ok', {
        sessionId: resolvedSessionId,
        title: titleResult.title,
      });
      sendFn({
        type: 'title_updated',
        requestId,
        sessionId: resolvedSessionId,
        title: titleResult.title,
      });
      if (titleResult.totalTokens > 0) {
        const { error: quotaError } = await supabase.rpc('nrm_rpc_increment_llm_user_quota', {
          p_serial_no: serialNo,
          p_provider_id: model.providerId,
          p_target_month: targetMonth,
          p_input_token: titleResult.inputTokens,
          p_output_token: titleResult.outputTokens,
          p_total_token: titleResult.totalTokens,
        });
        if (quotaError) {
          logErr(requestId, 'title_quota_increment_failed', quotaError, {
            sessionId: resolvedSessionId,
          });
        }
      }
    };

    const scheduleQuotaIncrement = (inputTokens: number, outputTokens: number, totalTokens: number) => {
      if (!model) return;
      const providerId = model.providerId;
      const task = supabase
        .rpc('nrm_rpc_increment_llm_user_quota', {
          p_serial_no: serialNo,
          p_provider_id: providerId,
          p_target_month: targetMonth,
          p_input_token: inputTokens,
          p_output_token: outputTokens,
          p_total_token: totalTokens,
        })
        .then(({ error }) => {
          if (error) {
            logErr(requestId, 'quota_increment_failed', error, { serialNo, providerId, targetMonth });
          } else {
            logInfo(requestId, 'quota_increment_ok', { serialNo, providerId, targetMonth, totalTokens });
          }
        })
        .catch((e) => logErr(requestId, 'quota_increment_threw', e, { serialNo, providerId, targetMonth }));
      runBackground(task);
    };

    // ── 여기부터 NDJSON 스트리밍 응답 — meta를 가장 먼저 보내 클라이언트가 세션/
    // 사용자 메시지를 즉시 확정 표시할 수 있게 한다.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
          } catch {
            // 클라이언트가 이미 연결을 끊은 경우 — 무시하고 나머지 로직(finalize 등)은 계속.
          }
        };
        const closeStream = () => {
          setGeminiInteractionsApiOverride(null);
          try {
            controller.close();
          } catch {
            // 이미 닫힌 경우 무시
          }
        };

        send({
          type: 'meta',
          requestId,
          sessionId: resolvedSessionId,
          isNewSession,
          title,
          userMessage,
        });

        try {
          /** 사전 체크 실패·adapter_missing 등 — LLM을 호출하지 않고 바로 system 메시지로 종료. */
          const finishWithSystem = async (
            content: string,
            recordHistory: boolean,
            outcome: string,
            diag?: Record<string, unknown>,
          ) => {
            const finalizeStartedAt = Date.now();
            const { data, error } = await supabase.rpc('nrm_rpc_chat_finalize_turn', {
              p_session_id: resolvedSessionId,
              p_role: 'system',
              p_content: content,
              p_input_token: 0,
              p_output_token: 0,
              p_total_token: 0,
              p_serial_no: serialNo,
              p_provider_id: model?.providerId ?? null,
              p_model_id: model?.modelId ?? modelId,
              p_record_history: recordHistory,
              p_is_success: false,
            });
            const finalizeElapsedMs = Date.now() - finalizeStartedAt;
            if (error) {
              logErr(requestId, 'finalize_turn_failed', error, {
                elapsedMs: finalizeElapsedMs,
                sessionId: resolvedSessionId,
                role: 'system',
                outcome,
              });
              send({ type: 'error', requestId, message: error.message });
              logInfo(requestId, 'request_done', {
                outcome: 'finalize_failed',
                totalElapsedMs: Date.now() - startedAt,
                sessionId: resolvedSessionId,
              });
              closeStream();
              return;
            }
            logInfo(requestId, 'finalize_turn_ok', {
              elapsedMs: finalizeElapsedMs,
              sessionId: resolvedSessionId,
              role: 'system',
              recordHistory,
            });
            send({
              type: 'final',
              requestId,
              sessionId: resolvedSessionId,
              isNewSession,
              title,
              message: data,
              ...(diag ? { diag } : {}),
            });
            logInfo(requestId, 'request_done', {
              outcome,
              totalElapsedMs: Date.now() - startedAt,
              sessionId: resolvedSessionId,
              isNewSession,
              ...(diag ? { diagSummary: { outcome, attemptCount: Array.isArray(diag.attempts) ? (diag.attempts as unknown[]).length : 0, lastError: diag.lastError ?? null } } : {}),
            });
            await applyGeneratedTitle(send);
            closeStream();
          };

          if (!model || !model.isActive) {
            logWarn(requestId, 'model_unavailable', {
              modelId,
              modelFound: !!model,
              isActive: model?.isActive ?? null,
            });
            await finishWithSystem(MSG_LLM_UNAVAILABLE, false, 'model_unavailable');
            return;
          }

          // 1) 권한 확인(제공자 단위) — AI 요청 전. 실패 시 LLMTokenHistory에는 기록하지 않는다.
          if (!permission || permission.isApproved !== true) {
            logInfo(requestId, 'permission_denied', {
              sessionId: resolvedSessionId,
              providerId: model.providerId,
              hasPermissionRow: !!permission,
            });
            await finishWithSystem(MSG_PERMISSION_DENIED(model.modelDisplayName), false, 'permission_denied');
            return;
          }

          // 2) 쿼터(할당 토큰, 제공자 단위) 확인 — AllocatedToken=0 은 무제한. AI 요청 전.
          if (permission.allocatedToken > 0 && quotaUsed >= permission.allocatedToken) {
            logInfo(requestId, 'quota_exceeded', {
              sessionId: resolvedSessionId,
              providerId: model.providerId,
              quotaUsed,
              allocatedToken: permission.allocatedToken,
            });
            await finishWithSystem(MSG_TOKEN_EXPIRED, false, 'quota_exceeded');
            return;
          }

          if (!hasProvider(model.providerName)) {
            logErr(requestId, 'adapter_missing', new Error(`no provider registered for providerName=${model.providerName}`), {
              providerId: model.providerId,
              providerName: model.providerName,
            });
            await finishWithSystem(MSG_LLM_UNAVAILABLE, false, 'adapter_missing');
            return;
          }

          const chatHistory: ChatTurn[] = (Array.isArray(history) ? history : []).map((h) => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: sanitizeStoredChatContent(String(h.content ?? '')),
          }));

          // 관리자 DB 시스템 프롬프트 — Agent 조립의 ADMIN_SYSTEM_PROMPT 섹션으로 편입
          let adminDbPrompt = '';
          let adminPromptCount = 0;
          try {
            const { data: promptRows, error: promptError } = await supabase
              .from('LLMSystemPrompt')
              .select('Title, Content')
              .eq('IsActive', true)
              .order('SortOrder', { ascending: true })
              .order('PromptID', { ascending: true });
            if (promptError) {
              logWarn(requestId, 'system_prompt_fetch_failed', { message: promptError.message });
            } else if (Array.isArray(promptRows)) {
              const texts = promptRows
                .filter((r: { Title?: string }) => {
                  const title = String(r?.Title ?? '').trim();
                  // 학습/최신정보 범위 규칙은 systemInstruction에 넣지 않음(DB IsActive=false와 이중 방어)
                  return title !== '학습 범위 규칙' && title !== '학습 컷오프 규칙';
                })
                .map((r: { Content?: string }) => String(r?.Content ?? '').trim())
                .filter((t: string) => t.length > 0);
              adminPromptCount = texts.length;
              adminDbPrompt = texts.join('\n\n');
            }
          } catch (e) {
            logErr(requestId, 'system_prompt_fetch_threw', e);
          }

          // ── Production: FeatureFlag / Experiment / Guard / Cache / AgentRequest
          const featureFlags = await resolveFeatureFlags(serialNo);
          setGeminiInteractionsApiOverride(featureFlags.geminiInteractionsApi);
          const experiment = await assignExperiment(serialNo);
          const promptVersion =
            experiment?.overrides?.promptVersion ?? getActivePromptVersion();

          let userTextForLlm = isToolContinue
            ? ''
            : buildUserTextForLlmFromClientHints({
                displayMessage: message,
                trackSelectHit,
                downloadAlreadyStarted,
              });
          if (!isToolContinue && featureFlags.inputGuard) {
            const guarded = await getInputGuard().check(userTextForLlm);
            if (!guarded.allowed) {
              await finishWithSystem(
                guarded.reasons[0] || '요청을 처리할 수 없어요.',
                false,
                'input_guard_blocked',
              );
              return;
            }
            userTextForLlm = guarded.text;
          }

          const agentRequest = buildAgentRequest({
            traceId: requestId,
            requestId,
            serialNo,
            userMessage: userTextForLlm,
            sessionId: resolvedSessionId,
            modelId: model.modelId,
            isToolContinue,
            promptVersion,
            experimentId: experiment?.experimentId ?? null,
            featureFlags,
          });

          if (!isToolContinue && featureFlags.questionCache) {
            const qKey = cacheKeyForQuestion(serialNo, model.modelId, userTextForLlm);
            const cached = await getQuestionCache().get(qKey);
            // 구현체가 hit을 주면 향후 short-circuit. 기본 noop은 항상 miss.
            if (cached.hit && cached.answer) {
              logAgentPhase(requestId, 'question_cache_hit', { traceId: requestId, key: qKey });
            }
          }

          // Intent → Planner(Graph) → Executor(Provider Registry)
          const googleApiKeyForIntent =
            model.providerName === 'Google'
              ? model.apiKey
              : await fetchGoogleProviderApiKey(supabase);

          const agentState = emptyAgentState(
            requestId,
            serialNo,
            userTextForLlm,
            isToolContinue,
            requestId,
          );

          const { plan: agentPlan, state: plannedState } = await runPlanner({
            state: agentState,
            userMessage: userTextForLlm,
            isToolContinue,
            googleApiKey: googleApiKeyForIntent,
            adminDbPrompt,
            provider: {
              providerId: model.providerId,
              providerName: model.providerName,
              modelId: model.modelId,
              modelName: model.modelName,
              modelDisplayName: model.modelDisplayName,
            },
            history: chatHistory,
            supabase,
            musicPlatform: {
              id: musicPlatformId,
              label: musicPlatformLabel,
              blocked: musicPlatformBlocked,
              explicit: musicPlatformExplicit,
            },
          });

          const bridge = executePlanToAdapterOptions(agentPlan);
          const enableDownloadTools = bridge.enableDownloadTools;
          const enableWebSearch = false;
          const adminSystemInstruction = bridge.systemInstruction;

          logAgentStateSnapshot(requestId, plannedState);
          logAgentPlanSummary(requestId, agentPlan);

          logInfo(requestId, 'llm_call_start', {
            traceId: agentPlan.traceId,
            providerName: model.providerName,
            modelName: model.modelName,
            historyCount: chatHistory.length,
            historyBudgetTurns: agentPlan.historyBudgetTurns,
            messageLength: message.length,
            adminPromptCount,
            adminPromptChars: adminSystemInstruction.length,
            toolContinue: isToolContinue,
            enableDownloadTools,
            enableWebSearch,
            musicPlatformId,
            musicPlatformLabel,
            musicPlatformBlocked,
            musicPlatformExplicit,
            intent: agentPlan.intent.intent,
            toolNames: bridge.toolNames,
            contextProviders: bridge.contextProvidersUsed,
            graph: bridge.graphNodeIds,
            retry: bridge.retry,
            timeoutMs: bridge.timeoutMs,
            planTimings: plannedState.timings,
          });
          const llmStartedAt = Date.now();
          let deltaCount = 0;
          const toolContinuePayload = isToolContinue
            ? {
                modelFunctionCalls: toolResults.map((t) => ({
                  callId: t.callId,
                  name: t.name,
                  args: t.args,
                })),
                functionResponses: toolResults.map((t) => ({
                  name: t.name,
                  response: t.response,
                })),
                previousInteractionId,
              }
            : undefined;

          const resultRaw = await runExecutionGraph({
            plan: agentPlan,
            state: plannedState,
            apiKey: model.apiKey,
            history: chatHistory,
            userMessage: isToolContinue ? '' : userTextForLlm,
            onDelta: (deltaText) => {
              deltaCount += 1;
              send({ type: 'delta', text: deltaText });
            },
            toolContinue: toolContinuePayload,
          });
          logAgentTimings(agentPlan.traceId, plannedState.timings, {
            tokenUsage: plannedState.tokenUsage ?? null,
            promptVersion: agentRequest.promptVersion,
            experimentId: agentRequest.experimentId,
          });
          const llmElapsedMs = Date.now() - llmStartedAt;

          // runExecutionGraph 는 Normalized → legacy shape
          const result = resultRaw as {
            ok: boolean;
            kind?: 'auth' | 'network' | 'rate_limit' | 'other';
            status?: number;
            message?: string;
            text?: string;
            inputTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
            thoughtsTokens?: number;
            finishReason?: string | null;
            grounded?: boolean;
            groundedQueryCount?: number;
            functionCalls?: Array<{ callId: string; name: string; args: Record<string, unknown> }>;
            needsWebSearch: boolean;
            interactionId?: string | null;
            // deno-lint-ignore no-explicit-any
            attempts: any[];
          };

          await persistLlmCallAttemptLogs(supabase, {
            requestId,
            serialNo,
            sessionId: resolvedSessionId,
            modelId: model.modelId,
            modelName: model.modelName,
            userMessage: isToolContinue ? `[tool_continue x${toolResults.length}]` : message,
            needsWebSearch: result.needsWebSearch,
            attempts: result.attempts,
          });

          if (!result.ok) {
            const diag = {
              outcome: 'llm_call_failed',
              kind: result.kind,
              status: result.status ?? null,
              lastError: String(result.message ?? '').slice(0, 500),
              needsWebSearch: result.needsWebSearch,
              attemptCount: Array.isArray(result.attempts) ? result.attempts.length : 0,
              attempts: result.attempts ?? [],
              llmElapsedMs,
            };
            logWarn(requestId, 'llm_call_failed', {
              elapsedMs: llmElapsedMs,
              providerName: model.providerName,
              kind: result.kind,
              status: result.status ?? null,
              message: String(result.message ?? '').slice(0, 500),
              deltaCount,
              needsWebSearch: result.needsWebSearch,
              attemptCount: Array.isArray(result.attempts) ? result.attempts.length : 0,
              attempts: result.attempts ?? [],
            });
            getProviderHealthMonitor().recordFailure(
              model.providerName,
              String(result.kind ?? 'other'),
            );
            getCircuitBreaker().onFailure(model.providerName);
            const lastAttempt = Array.isArray(result.attempts)
              ? result.attempts[result.attempts.length - 1]
              : null;
            const replyText =
              result.kind === 'auth'
                ? MSG_TOKEN_EXPIRED
                : result.kind === 'network'
                  ? MSG_NETWORK_PROBLEM
                  : result.kind === 'rate_limit'
                    ? buildMsgLlmRateLimit(String(result.message ?? ''), model.modelDisplayName, {
                        quotaClass: lastAttempt?.quotaClass ?? null,
                      })
                    : MSG_LLM_UNAVAILABLE;
            await finishWithSystem(replyText, true, 'llm_call_failed', diag);
            return;
          }

          const functionCalls = Array.isArray(result.functionCalls) ? result.functionCalls : [];
          if (functionCalls.length > 0) {
            logInfo(requestId, 'llm_tool_request', {
              elapsedMs: llmElapsedMs,
              providerName: model.providerName,
              functionCallCount: functionCalls.length,
              names: functionCalls.map((f) => f.name),
              replyLength: result.text.length,
              deltaCount,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              totalTokens: result.totalTokens,
            });
            for (const fc of functionCalls) {
              send({
                type: 'tool_request',
                requestId,
                callId: fc.callId,
                name: fc.name,
                args: fc.args,
              });
            }
            send({
              type: 'tool_turn_end',
              requestId,
              sessionId: resolvedSessionId,
              isNewSession,
              title,
              partialText: result.text || '',
              /** Gemini Interactions: 클라이언트가 toolContinue 시 previousInteractionId로 반환 */
              previousInteractionId: result.interactionId ?? null,
            });
            // 새 세션 첫 턴이 tool_turn으로 끝나도 요약 제목을 적용한다.
            // (미적용 시 toolContinue는 isNewSession=false라 제목이 휴리스틱에 영구 고정됨)
            await applyGeneratedTitle(send);
            logInfo(requestId, 'request_done', {
              outcome: 'tool_turn',
              totalElapsedMs: Date.now() - startedAt,
              sessionId: resolvedSessionId,
              functionCallCount: functionCalls.length,
              previousInteractionId: result.interactionId ? 'set' : null,
            });
            closeStream();
            scheduleQuotaIncrement(result.inputTokens, result.outputTokens, result.totalTokens);
            return;
          }

          logInfo(requestId, 'llm_call_ok', {
            elapsedMs: llmElapsedMs,
            providerName: model.providerName,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            thoughtsTokens: result.thoughtsTokens ?? 0,
            finishReason: result.finishReason ?? null,
            grounded: result.grounded ?? false,
            groundedQueryCount: result.groundedQueryCount ?? 0,
            replyLength: result.text.length,
            replyPreview: preview(result.text),
            deltaCount,
            needsWebSearch: result.needsWebSearch,
            attemptCount: result.attempts.length,
            attempts: result.attempts,
          });

          // tool continue 후 텍스트만 왔는데 비어 있으면 시스템 안내.
          if (!String(result.text ?? '').trim()) {
            await finishWithSystem(MSG_LLM_UNAVAILABLE, true, 'empty_after_tools');
            return;
          }

          let finalAnswer = String(result.text ?? '');
          if (featureFlags.outputGuard) {
            const out = await getOutputGuard().check(finalAnswer);
            finalAnswer = out.text;
          }

          plannedState.tokenUsage = {
            inputTokens: Number(result.inputTokens ?? 0),
            outputTokens: Number(result.outputTokens ?? 0),
            totalTokens: Number(result.totalTokens ?? 0),
          };
          plannedState.timings = {
            ...plannedState.timings,
            llmMs: llmElapsedMs,
          };

          const finalizeStartedAt = Date.now();
          const { data: finalizeData, error: finalizeError } = await supabase.rpc('nrm_rpc_chat_finalize_turn', {
            p_session_id: resolvedSessionId,
            p_role: 'assistant',
            p_content: finalAnswer,
            p_input_token: Number(result.inputTokens ?? 0),
            p_output_token: Number(result.outputTokens ?? 0),
            p_total_token: Number(result.totalTokens ?? 0),
            p_serial_no: serialNo,
            p_provider_id: model.providerId,
            p_model_id: model.modelId,
            p_record_history: true,
            p_is_success: true,
          });
          const finalizeElapsedMs = Date.now() - finalizeStartedAt;
          if (finalizeError) {
            logErr(requestId, 'finalize_turn_failed', finalizeError, {
              elapsedMs: finalizeElapsedMs,
              sessionId: resolvedSessionId,
              role: 'assistant',
            });
            send({ type: 'error', requestId, message: finalizeError.message });
            logInfo(requestId, 'request_done', {
              outcome: 'finalize_failed',
              totalElapsedMs: Date.now() - startedAt,
              sessionId: resolvedSessionId,
            });
            closeStream();
            return;
          }
          logInfo(requestId, 'finalize_turn_ok', {
            elapsedMs: finalizeElapsedMs,
            sessionId: resolvedSessionId,
            role: 'assistant',
          });

          getProviderHealthMonitor().recordSuccess(model.providerName, llmElapsedMs);
          getCircuitBreaker().onSuccess(model.providerName);

          let agentResponse = buildAgentResponse({
            request: agentRequest,
            plan: agentPlan,
            state: plannedState,
            answer: finalAnswer,
            ok: true,
            role: 'assistant',
            toolCalls: [],
            citations:
              result.grounded === true && Number(result.groundedQueryCount ?? 0) > 0
                ? [
                    {
                      title: `웹 검색 ${Number(result.groundedQueryCount)}건`,
                      snippet: 'google_search grounding',
                    },
                  ]
                : [],
            searchUsed: enableWebSearch || result.needsWebSearch === true,
            musicSearchUsed:
              agentPlan.intent.needsMusicSearch ||
              agentPlan.intent.needsDownloadTool ||
              agentPlan.intent.intent === 'download',
            latencyMs: llmElapsedMs,
            raw: { attempts: result.attempts },
          });
          if (featureFlags.evaluation) {
            const evaluation = await runEvaluation(agentResponse);
            agentResponse = { ...agentResponse, evaluation };
          }
          const metrics = metricsFromAgentResponse(agentResponse);
          logAgentPhase(requestId, 'agent_response', {
            traceId: agentResponse.traceId,
            promptVersion: agentResponse.promptVersion,
            experimentId: agentResponse.experimentId,
            ui: agentResponse.ui,
            evaluation: agentResponse.evaluation,
            promptDiagnostics: agentResponse.promptDiagnostics,
            contextDiagnostics: agentResponse.contextDiagnostics,
            metrics,
          });

          if (featureFlags.questionCache) {
            const qKey = cacheKeyForQuestion(serialNo, model.modelId, userTextForLlm);
            void getQuestionCache().set(qKey, finalAnswer);
          }

          const successDiag = {
            outcome: 'success',
            needsWebSearch: result.needsWebSearch,
            grounded: result.grounded ?? false,
            groundedQueryCount: result.groundedQueryCount ?? 0,
            finishReason: result.finishReason ?? null,
            thoughtsTokens: result.thoughtsTokens ?? 0,
            attemptCount: Array.isArray(result.attempts) ? result.attempts.length : 0,
            attempts: result.attempts ?? [],
            llmElapsedMs,
            agentResponse: {
              promptVersion: agentResponse.promptVersion,
              experimentId: agentResponse.experimentId,
              evaluation: agentResponse.evaluation,
              ui: agentResponse.ui,
              promptDiagnostics: agentResponse.promptDiagnostics,
              contextDiagnostics: agentResponse.contextDiagnostics,
              metrics,
              tokenUsage: agentResponse.tokenUsage,
              contextUsed: agentResponse.contextUsed,
              searchUsed: agentResponse.searchUsed,
              musicSearchUsed: agentResponse.musicSearchUsed,
              ragUsed: agentResponse.ragUsed,
              recommendationUsed: agentResponse.recommendationUsed,
              citations: agentResponse.citations,
            },
          };
          send({
            type: 'final',
            requestId,
            sessionId: resolvedSessionId,
            isNewSession,
            title,
            message: finalizeData,
            diag: successDiag,
          });
          logInfo(requestId, 'request_done', {
            outcome: 'success',
            totalElapsedMs: Date.now() - startedAt,
            sessionId: resolvedSessionId,
            isNewSession,
          });
          await applyGeneratedTitle(send);
          closeStream();
          scheduleQuotaIncrement(result.inputTokens, result.outputTokens, result.totalTokens);
          return;
        } catch (e) {
          logErr(requestId, 'stream_unhandled_error', e, { totalElapsedMs: Date.now() - startedAt });
          send({ type: 'error', requestId, message: e instanceof Error ? e.message : String(e) });
          closeStream();
        }
      },
      cancel(reason) {
        logWarn(requestId, 'stream_cancelled_by_client', { reason: String(reason) });
      },
    });

    return new Response(body, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'X-Request-Id': requestId,
      },
    });
  } catch (e) {
    logErr(requestId, 'unhandled_error', e, { totalElapsedMs: Date.now() - startedAt });
    return jsonResponse({ error: 'internal', requestId }, 500);
  }
});
