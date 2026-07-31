/**
 * Google Gemini Interactions API 어댑터.
 *
 * 공식 문서 기준:
 * - POST https://generativelanguage.googleapis.com/v1beta/interactions
 * - stream: true + ?alt=sse
 * - contents → input
 * - tools: [{ type: "google_search" }] / [{ type: "function", name, ... }]
 * - FC continue: previous_interaction_id + function_result
 * - Headers: x-goog-api-key, Api-Revision: 2026-05-20
 *
 * 다운스트림(앱) NDJSON 계약은 유지. Legacy generateContent는 Feature Flag로 병행.
 */

import {
  buildProviderHttpDiag,
  compactFunctionCallsForLog,
  detectToolsInRequestBody,
  headersToRecord,
  pickProviderRequestId,
  shouldPersistRequestBodyJson,
  snapshotRequestBody,
  type ProviderHttpDiag,
  type QuotaClass,
} from '../ops/providerHttpDiag.ts';
import { toInteractionsFunctionTools } from '../tools/downloadDeclarations.ts';

export const GEMINI_INTERACTIONS_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
export const GEMINI_INTERACTIONS_STREAM_URL = `${GEMINI_INTERACTIONS_URL}?alt=sse`;
/** May 2026 breaking-changes 스키마 (공식 quickstart/streaming 예제) */
export const GEMINI_INTERACTIONS_API_REVISION = '2026-05-20';

const GEMINI_SEARCH_ATTEMPT_MS = 18_000;
const GEMINI_PLAIN_ATTEMPT_MS = 22_000;
const GEMINI_CHAT_MAX_OUTPUT_TOKENS_LEGACY = 8192;
const GEMINI_CHAT_MAX_OUTPUT_TOKENS_MODERN = 65536;
const GEMINI_TITLE_TIMEOUT_MS = 8_000;
const GEMINI_TITLE_MAX_OUTPUT_TOKENS = 40;
const GEMINI_TITLE_MAX_LEN = 24;

const TYPING_REPLAY_CHUNK_CHARS = 24;
const TYPING_REPLAY_DELAY_MS = 12;
const TYPING_REPLAY_FAST_CHARS = 48;
const TYPING_REPLAY_NO_DELAY_MIN_LEN = 600;

/** Interactions: google_search 공식 형식 */
export const GEMINI_INTERACTIONS_GOOGLE_SEARCH_TOOL = { type: 'google_search' };

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type GeminiFunctionCallPart = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

export type GeminiAttemptDiag = {
  attemptIndex: number;
  attemptLabel: string;
  withSearch: boolean;
  maxOutputTokens: number;
  ok: boolean;
  httpStatus: number | null;
  errorKind: string | null;
  errorMessage: string | null;
  finishReason: string | null;
  blockReason: string | null;
  groundedQueryCount: number;
  elapsedMs: number;
  withTools?: boolean;
  providerRequestId?: string | null;
  retryAfterHeader?: string | null;
  responseHeaders?: Record<string, string> | null;
  rateLimitHeaders?: Record<string, string> | null;
  responseBodyText?: string | null;
  requestBodyJson?: Record<string, unknown> | null;
  requestBodySha256?: string | null;
  requestBodyBytes?: number | null;
  requestBodyTruncated?: boolean;
  functionCallsJson?: ReturnType<typeof compactFunctionCallsForLog>;
  toolResultsJson?: unknown;
  quotaClass?: QuotaClass | null;
  quotaId?: string | null;
  quotaMetric?: string | null;
  quotaEvidence?: string | null;
};

export type AdapterSuccess = {
  ok: true;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason?: string;
  thoughtsTokens?: number;
  grounded?: boolean;
  groundedQueryCount?: number;
  attempts: GeminiAttemptDiag[];
  needsWebSearch: boolean;
  functionCalls?: GeminiFunctionCallPart[];
  /** Interactions FC continue용 */
  interactionId?: string | null;
};

export type AdapterFailure = {
  ok: false;
  kind: 'auth' | 'network' | 'rate_limit' | 'other';
  message: string;
  status?: number;
  attempts: GeminiAttemptDiag[];
  needsWebSearch: boolean;
  functionCalls?: GeminiFunctionCallPart[];
  interactionId?: string | null;
};

export type AdapterResult = AdapterSuccess | AdapterFailure;

export type TitleResult = {
  title: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type StreamOptions = {
  adminSystemInstruction?: string;
  enableDownloadTools?: boolean;
  enableWebSearch?: boolean;
  toolContinue?: {
    modelFunctionCalls: GeminiFunctionCallPart[];
    functionResponses: Array<{ name: string; response: Record<string, unknown> }>;
    /** Interactions stateful FC — Turn1 interaction.id */
    previousInteractionId?: string | null;
  };
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
  | 'functionCallsJson'
  | 'toolResultsJson'
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
    functionCallsJson: null,
    toolResultsJson: null,
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
      api: 'interactions',
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
      requestBodyJson: diag.requestBodyJson,
    }),
  );
}

function isAgentAssembledSystemPrompt(text: string): boolean {
  return text.includes('[CURRENT_DATETIME]') && text.includes('[INTENT]');
}

function appendWebSearchEnabledHint(systemText: string, _enabled: boolean): string {
  // 웹 검색 전면 비활성 — 힌트 주입하지 않음
  return systemText;
}

function appendNoToolsGuard(systemText: string): string {
  if (systemText.includes('[TOOLS]')) return systemText;
  return (
    `${systemText.trim()}\n\n` +
    `[TOOLS]\n` +
    `이번 요청에는 호출 가능한 도구(function/tool)가 없다.\n` +
    `google_search 포함 어떤 도구도 호출하지 마라. tool call JSON을 출력하지 말고 텍스트로만 답한다.`
  );
}

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

function buildChatSystemInstruction(dbSystemInstruction?: string): string {
  const live = buildLiveCurrentDatetimeBlock();
  const fromDb = (dbSystemInstruction ?? '').trim();
  return fromDb ? `${live}\n\n${fromDb}` : live;
}

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

/** Interactions 모델명: DB의 models/ 접두 제거 */
export function toInteractionsModelName(modelName: string): string {
  return modelName.replace(/^models\//, '').trim();
}

function supportsModernOutputTokens(modelName: string): boolean {
  const m = modelName.replace(/^models\//, '').toLowerCase();
  const nonThinkingFamily =
    /gemma|tts|image|embed|live|audio|veo|imagen|lyria|robotics|computer-use|deep-research|^aqa$|nano-banana|omni/.test(
      m,
    );
  const legacyVersion = /(^|[^0-9])1\.[05]([^0-9]|$)|(^|[^0-9])2\.0([^0-9]|$)/.test(m);
  return !(nonThinkingFamily || legacyVersion);
}

function getGeminiMaxOutputTokens(modelName: string): number {
  return supportsModernOutputTokens(modelName)
    ? GEMINI_CHAT_MAX_OUTPUT_TOKENS_MODERN
    : GEMINI_CHAT_MAX_OUTPUT_TOKENS_LEGACY;
}

/**
 * Interactions thinking_level.
 * 채팅 체감 지연을 줄이기 위해 기본 minimal (Legacy thinkingBudget:0 대응).
 * Pro는 low (완전히 끌 수 없는 계열 대응).
 * thinking_summaries는 Interactions generation_config에서 사용하지 않음(Unrecognized 방지).
 */
function getInteractionsThinkingLevel(modelName: string): string | undefined {
  if (!supportsModernOutputTokens(modelName)) return undefined;
  const m = modelName.replace(/^models\//, '').toLowerCase();
  const isPro = m.includes('pro') && !m.includes('flash');
  return isPro ? 'low' : 'minimal';
}

function sanitizeAssistantVisibleText(text: string): string {
  let t = text ?? '';
  if (!t) return '';
  t = t.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
  t = t.replace(/<reason(?:ing)?\b[^>]*>[\s\S]*?<\/reason(?:ing)?>/gi, '');
  t = t.replace(/<redacted_reasoning>[\s\S]*?<\/redacted_reasoning>/gi, '');
  t = t.replace(/<think\b[^>]*>[\s\S]*$/gi, '');
  t = t.replace(/^[\s\S]*?<\/think>\s*/i, '');
  t = t.replace(/^(?:Here's a thinking process:|The user is asking[\s\S]*?\n\n)(?=[가-힣A-Z])/i, '');
  t = t.replace(/\u3010\d+\u2020[^\u3011]*\u3011/g, '');
  t = t.replace(/\u3010\d+\u3011/g, '');
  t = t.replace(/【\d+†[^】]*】/g, '');
  t = t.replace(/【\d+】/g, '');
  t = t.replace(/\[\d+\u2020[^\]]*\]/g, '');
  t = t.replace(/\[\d+†[^\]]*\]/g, '');
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
  };
}

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
  t = t.replace(/^["'“”‘’`*#]+|["'“”‘’`*#.]+$/g, '').trim();
  t = t.replace(/^제목\s*[:：]\s*/, '').trim();
  if (!t) return '';
  return t.length > GEMINI_TITLE_MAX_LEN ? `${t.slice(0, GEMINI_TITLE_MAX_LEN)}…` : t;
}

function isGeminiRateLimitStatus(status: number): boolean {
  return status === 429;
}

/** SSE error / 본문 메시지로 쿼타 초과 여부 판별 (HTTP status가 200이어도 메시지가 429일 수 있음) */
function isGeminiQuotaExceededMessage(message: string): boolean {
  const m = String(message ?? '');
  return /exceeded your current quota|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(m);
}

function classifyGeminiFailureKind(
  httpStatus: number | null,
  message: string,
): 'auth' | 'network' | 'rate_limit' | 'other' {
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 429 || isGeminiQuotaExceededMessage(message)) return 'rate_limit';
  return 'other';
}

function interactionsHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    'Api-Revision': GEMINI_INTERACTIONS_API_REVISION,
  };
}

async function fetchInteractionsWithTimeout(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: interactionsHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** SSE: data: JSON (+ optional event: line). Interactions는 event_type을 JSON에도 넣음. */
async function readInteractionsSseEvents(
  res: Response,
  onEvent: (json: Record<string, unknown>) => void,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const eventBlock = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = eventBlock.split(/\r?\n/);
      let dataPayload = '';
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed.startsWith('data:')) {
          const piece = trimmed.slice(5).trim();
          dataPayload = dataPayload ? `${dataPayload}\n${piece}` : piece;
        }
      }
      if (!dataPayload || dataPayload === '[DONE]') continue;
      try {
        const json = JSON.parse(dataPayload) as Record<string, unknown>;
        onEvent(json);
      } catch {
        // ignore malformed
      }
    }
  }
  if (buffer.trim()) {
    let dataPayload = '';
    for (const line of buffer.split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (trimmed.startsWith('data:')) {
        const piece = trimmed.slice(5).trim();
        dataPayload = dataPayload ? `${dataPayload}\n${piece}` : piece;
      }
    }
    if (dataPayload && dataPayload !== '[DONE]') {
      try {
        onEvent(JSON.parse(dataPayload) as Record<string, unknown>);
      } catch {
        // ignore
      }
    }
  }
}

function buildHistoryInputSteps(
  history: ChatTurn[],
  userMessage: string,
): Array<Record<string, unknown>> {
  const steps: Array<Record<string, unknown>> = [];
  for (const turn of history) {
    if (turn.role === 'user') {
      steps.push({
        type: 'user_input',
        content: [{ type: 'text', text: turn.content }],
      });
    } else {
      steps.push({
        type: 'model_output',
        content: [{ type: 'text', text: turn.content }],
      });
    }
  }
  if (userMessage.trim()) {
    steps.push({
      type: 'user_input',
      content: [{ type: 'text', text: userMessage }],
    });
  }
  return steps;
}

function buildFunctionResultInput(
  toolContinue: NonNullable<StreamOptions['toolContinue']>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const n = Math.max(
    toolContinue.modelFunctionCalls.length,
    toolContinue.functionResponses.length,
  );
  for (let i = 0; i < n; i += 1) {
    const fc = toolContinue.modelFunctionCalls[i];
    const fr = toolContinue.functionResponses[i];
    if (!fr) continue;
    const callId = (fc?.callId || '').trim() || `fc_${i}_${fr.name}`;
    const name = (fr.name || fc?.name || '').trim();
    if (!name) continue;
    out.push({
      type: 'function_result',
      name,
      call_id: callId,
      result: [{ type: 'text', text: JSON.stringify(fr.response ?? {}) }],
    });
  }
  return out;
}

function buildStatelessToolContinueInput(
  history: ChatTurn[],
  toolContinue: NonNullable<StreamOptions['toolContinue']>,
): Array<Record<string, unknown>> {
  // previous_interaction_id 없을 때 폴백: history + function_call + function_result
  const steps = buildHistoryInputSteps(history, '');
  for (const fc of toolContinue.modelFunctionCalls) {
    steps.push({
      type: 'function_call',
      id: fc.callId,
      name: fc.name,
      arguments: fc.args ?? {},
    });
  }
  steps.push(...buildFunctionResultInput(toolContinue));
  return steps;
}

type Attempt = {
  label: string;
  withSearch: boolean;
  maxOutputTokens: number;
  timeoutMs: number;
};

function parseArgsJson(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function extractTextFromInteractionSteps(steps: unknown): string {
  if (!Array.isArray(steps)) return '';
  const parts: string[] = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const s = step as { type?: string; content?: unknown };
    if (s.type !== 'model_output') continue;
    if (!Array.isArray(s.content)) continue;
    for (const c of s.content) {
      if (!c || typeof c !== 'object') continue;
      const block = c as { type?: string; text?: string };
      if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    }
  }
  return sanitizeAssistantVisibleText(parts.join(''));
}

function extractFunctionCallsFromSteps(steps: unknown): GeminiFunctionCallPart[] {
  if (!Array.isArray(steps)) return [];
  const out: GeminiFunctionCallPart[] = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const s = step as {
      type?: string;
      id?: string;
      name?: string;
      arguments?: Record<string, unknown> | string;
    };
    if (s.type !== 'function_call') continue;
    if (typeof s.name !== 'string' || !s.name.trim()) continue;
    let args: Record<string, unknown> = {};
    if (typeof s.arguments === 'string') args = parseArgsJson(s.arguments);
    else if (s.arguments && typeof s.arguments === 'object') args = s.arguments;
    out.push({
      callId: typeof s.id === 'string' && s.id ? s.id : `fc_${out.length}_${s.name}`,
      name: s.name.trim(),
      args,
    });
  }
  return out;
}

function extractGroundedQueriesFromSteps(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const queries: string[] = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const s = step as {
      type?: string;
      arguments?: { queries?: unknown };
      queries?: unknown;
    };
    if (s.type !== 'google_search_call') continue;
    const raw = s.arguments?.queries ?? s.queries;
    if (Array.isArray(raw)) {
      for (const q of raw) {
        if (typeof q === 'string' && q.trim()) queries.push(q.trim());
      }
    }
  }
  return queries;
}

function usageFromInteraction(interaction: Record<string, unknown> | null | undefined): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  thoughtsTokens: number;
} {
  const usage = (interaction?.usage ?? {}) as Record<string, unknown>;
  return {
    inputTokens: Number(usage.total_input_tokens ?? usage.prompt_tokens ?? 0),
    outputTokens: Number(usage.total_output_tokens ?? usage.completion_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
    thoughtsTokens: Number(usage.total_thought_tokens ?? 0),
  };
}

async function parseInteractionsUnaryResponse(
  res: Response,
  usedSearch: boolean,
): Promise<
  | {
    ok: true;
    fullText: string;
    interactionId: string | null;
    status: string | null;
    groundedQueries: string[];
    functionCalls: GeminiFunctionCallPart[];
    usage: ReturnType<typeof usageFromInteraction>;
    // deno-lint-ignore no-explicit-any
    json: any;
  }
  | {
    ok: false;
    status: number;
    message: string;
    retryable: boolean;
    httpDiag?: ProviderHttpDiag;
    groundedQueryCount?: number;
  }
> {
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const httpDiag = buildProviderHttpDiag(res, bodyText);
    const retryable = res.status === 400 || res.status === 429 || res.status === 503;
    const keep = res.status === 429 ? 6000 : 800;
    return {
      ok: false,
      status: res.status,
      message: httpDiag.responseBodyText.slice(0, keep) || `gemini_interactions: http_${res.status}`,
      retryable,
      httpDiag,
    };
  }
  // deno-lint-ignore no-explicit-any
  const json: any = await res.json().catch(() => null);
  if (!json) {
    return {
      ok: false,
      status: res.status,
      message: 'gemini_interactions: invalid json response',
      retryable: true,
    };
  }
  const steps = json.steps ?? [];
  const functionCalls = extractFunctionCallsFromSteps(steps);
  const fullText = extractTextFromInteractionSteps(steps);
  const groundedQueries = usedSearch ? extractGroundedQueriesFromSteps(steps) : [];
  const interactionId = typeof json.id === 'string' ? json.id : null;
  const status = typeof json.status === 'string' ? json.status : null;

  if (!fullText && functionCalls.length === 0 && status !== 'requires_action') {
    return {
      ok: false,
      status: res.status,
      message: `gemini_interactions: empty response (status=${status ?? '?'})`,
      retryable: true,
      groundedQueryCount: groundedQueries.length,
    };
  }

  return {
    ok: true,
    fullText,
    interactionId,
    status,
    groundedQueries,
    functionCalls,
    usage: usageFromInteraction(json),
    json,
  };
}

/**
 * Interactions API 스트리밍 채팅.
 * 앱↔Edge NDJSON은 호출측이 유지. 여기서는 onDelta + AdapterResult만.
 */
export async function streamGeminiInteractions(
  apiKey: string,
  modelName: string,
  history: ChatTurn[],
  userMessage: string,
  onDelta: (deltaText: string) => void,
  options?: StreamOptions,
): Promise<AdapterResult> {
  const model = toInteractionsModelName(modelName);
  const enableDownloadTools = options?.enableDownloadTools === true;
  const toolContinue = options?.toolContinue;
  const modernMaxOutputTokens = getGeminiMaxOutputTokens(modelName);
  /** 웹 검색(google_search) 전면 비활성 */
  const needsWebSearch = false;
  const systemInstructionText = resolveAdapterSystemInstruction(options?.adminSystemInstruction, {
    enableWebSearch: needsWebSearch,
    enableTools: !!(enableDownloadTools || toolContinue || needsWebSearch),
  });
  const thinkingLevel = getInteractionsThinkingLevel(modelName);

  const attempts: Attempt[] = enableDownloadTools || toolContinue
    ? [
      {
        label: enableDownloadTools ? 'download_tools' : 'download_tools_continue',
        withSearch: false,
        maxOutputTokens: modernMaxOutputTokens,
        timeoutMs: GEMINI_PLAIN_ATTEMPT_MS,
      },
    ]
    : [
      {
        label: 'plain',
        withSearch: false,
        maxOutputTokens: modernMaxOutputTokens,
        timeoutMs: GEMINI_PLAIN_ATTEMPT_MS,
      },
    ];

  const attemptDiags: GeminiAttemptDiag[] = [];

  const buildBody = (attempt: Attempt, stream: boolean): Record<string, unknown> => {
    // Gemini 3.5-flash-lite / 3.6-flash+: temperature·top_p·top_k Deprecated.
    // Interactions generation_config는 thinking_level만 사용 (thinking_summaries 미사용).
    const generationConfig: Record<string, unknown> = {
      max_output_tokens: attempt.maxOutputTokens,
    };
    if (thinkingLevel) {
      generationConfig.thinking_level = thinkingLevel;
    }

    const body: Record<string, unknown> = {
      model,
      stream,
      system_instruction: systemInstructionText,
      generation_config: generationConfig,
    };

    const prevId = (toolContinue?.previousInteractionId ?? '').trim();
    if (toolContinue && prevId) {
      body.previous_interaction_id = prevId;
      body.input = buildFunctionResultInput(toolContinue);
    } else if (toolContinue) {
      // Stateful ID 없음 → history+FC+result 폴백 (store=false)
      body.store = false;
      body.input = buildStatelessToolContinueInput(history, toolContinue);
    } else {
      const steps = buildHistoryInputSteps(history, userMessage);
      body.input = steps.length === 1 && userMessage.trim() && history.length === 0
        ? userMessage
        : steps;
    }

    if (enableDownloadTools || toolContinue) {
      body.tools = toInteractionsFunctionTools();
    } else if (attempt.withSearch) {
      body.tools = [GEMINI_INTERACTIONS_GOOGLE_SEARCH_TOOL];
    }

    return body;
  };

  let lastFail: AdapterFailure | null = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i]!;
    const attemptStarted = Date.now();
    const requestBody = buildBody(attempt, true);
    let res: Response;
    try {
      res = await fetchInteractionsWithTimeout(
        GEMINI_INTERACTIONS_STREAM_URL,
        apiKey,
        requestBody,
        attempt.timeoutMs,
      );
    } catch (e) {
      const aborted =
        (e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message))) ||
        (typeof e === 'object' && e != null && 'name' in e &&
          (e as { name?: string }).name === 'AbortError');
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
          event: aborted ? 'gemini_interactions_timeout' : 'gemini_interactions_exception',
          attempt: i + 1,
          label: attempt.label,
          withSearch: attempt.withSearch,
          elapsedMs: diag.elapsedMs,
          message: diag.errorMessage,
        }),
      );
      if (i < attempts.length - 1) continue;
      return lastFail;
    }

    if (!res.ok) {
      const parsed = await parseInteractionsUnaryResponse(res, attempt.withSearch);
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
          finishReason: null,
          blockReason: null,
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
            event: 'gemini_interactions_failed',
            attempt: i + 1,
            label: attempt.label,
            status: parsed.status,
            elapsedMs: diag.elapsedMs,
            message: parsed.message.slice(0, 500),
            quotaClass: diag.quotaClass,
          }),
        );
        if (kind === 'auth' || rateLimited) return lastFail;
        if (i < attempts.length - 1) continue;
        break;
      }
    }

    const emitter = createVisibleDeltaEmitter(onDelta);
    let interactionId: string | null = null;
    let interactionStatus: string | null = null;
    let finishReason: string | undefined;
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, thoughtsTokens: 0 };
    const functionCalls: GeminiFunctionCallPart[] = [];
    const groundedQueries: string[] = [];
    let streamError: string | null = null;
    let completedStepsText = '';

    // Streaming FC accumulation
    type FcAccum = { id: string; name: string; argsRaw: string };
    const fcByIndex = new Map<number, FcAccum>();

    try {
      await readInteractionsSseEvents(res, (json) => {
        const eventType = String(json.event_type ?? json.eventType ?? '');

        if (eventType === 'error' || json.error) {
          const err = (json.error ?? {}) as { message?: string; code?: string };
          streamError = String(err.message ?? err.code ?? 'interactions_stream_error');
          return;
        }

        if (eventType === 'interaction.created' || eventType === 'interaction.start') {
          const interaction = (json.interaction ?? {}) as Record<string, unknown>;
          if (typeof interaction.id === 'string') interactionId = interaction.id;
          if (typeof interaction.status === 'string') interactionStatus = interaction.status;
          return;
        }

        if (
          eventType === 'interaction.completed' ||
          eventType === 'interaction.complete' ||
          eventType === 'interaction.requires_action'
        ) {
          const interaction = (json.interaction ?? json) as Record<string, unknown>;
          if (typeof interaction.id === 'string') interactionId = interaction.id;
          if (typeof interaction.status === 'string') {
            interactionStatus = interaction.status;
          } else if (eventType === 'interaction.requires_action') {
            interactionStatus = 'requires_action';
          }
          usage = usageFromInteraction(interaction);
          // completed 페이로드 steps — delta 누락 시 전체 텍스트 보완
          const stepsText = extractTextFromInteractionSteps(interaction.steps);
          if (stepsText) completedStepsText = stepsText;
          if (interactionStatus === 'requires_action' || interactionStatus === 'completed') {
            finishReason = interactionStatus === 'requires_action' ? 'tool_calls' : 'STOP';
          }
          return;
        }

        if (
          eventType === 'interaction.status_update' ||
          eventType === 'interaction.in_progress'
        ) {
          if (typeof json.status === 'string') interactionStatus = json.status;
          else if (eventType === 'interaction.in_progress') interactionStatus = 'in_progress';
          return;
        }

        if (eventType === 'step.start' || eventType === 'content.start') {
          const index = Number(json.index ?? 0);
          const step = (json.step ?? {}) as {
            type?: string;
            id?: string;
            name?: string;
            arguments?: { queries?: unknown } | Record<string, unknown>;
          };
          if (step.type === 'function_call') {
            fcByIndex.set(index, {
              id: typeof step.id === 'string' ? step.id : '',
              name: typeof step.name === 'string' ? step.name : '',
              argsRaw: '',
            });
          } else if (step.type === 'google_search_call') {
            const args = step.arguments;
            const rawQueries = args && typeof args === 'object' && 'queries' in args
              ? (args as { queries?: unknown }).queries
              : undefined;
            if (Array.isArray(rawQueries)) {
              for (const q of rawQueries) {
                if (typeof q === 'string' && q.trim()) groundedQueries.push(q.trim());
              }
            }
          }
          return;
        }

        if (eventType === 'step.delta' || eventType === 'content.delta') {
          const index = Number(json.index ?? 0);
          const delta = (json.delta ?? {}) as {
            type?: string;
            text?: string;
            arguments?: string;
          };
          if (delta.type === 'text' && typeof delta.text === 'string' && delta.text) {
            emitter.push(delta.text);
          } else if (delta.type === 'arguments_delta' && typeof delta.arguments === 'string') {
            const acc = fcByIndex.get(index);
            if (acc) acc.argsRaw += delta.arguments;
          }
          return;
        }

        if (eventType === 'step.stop' || eventType === 'content.stop') {
          const index = Number(json.index ?? 0);
          const acc = fcByIndex.get(index);
          if (acc && acc.name) {
            functionCalls.push({
              callId: acc.id || `fc_${index}_${acc.name}`,
              name: acc.name,
              args: parseArgsJson(acc.argsRaw),
            });
            fcByIndex.delete(index);
          }
          return;
        }
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      attemptDiags.push({
        ...emptyAttemptHttpFields(),
        attemptIndex: i + 1,
        attemptLabel: `${attempt.label}_sse_read`,
        withSearch: attempt.withSearch,
        maxOutputTokens: attempt.maxOutputTokens,
        ok: false,
        httpStatus: res.status,
        errorKind: 'network',
        errorMessage: errorMessage.slice(0, 800),
        finishReason: finishReason ?? null,
        blockReason: null,
        groundedQueryCount: groundedQueries.length,
        elapsedMs: Date.now() - attemptStarted,
      });
      lastFail = {
        ok: false,
        kind: 'network',
        message: errorMessage,
        attempts: attemptDiags,
        needsWebSearch,
        interactionId,
      };
      if (i < attempts.length - 1) continue;
      return lastFail;
    }

    // flush remaining FC accumulators
    for (const [index, acc] of fcByIndex) {
      if (!acc.name) continue;
      functionCalls.push({
        callId: acc.id || `fc_${index}_${acc.name}`,
        name: acc.name,
        args: parseArgsJson(acc.argsRaw),
      });
    }

    let fullText = emitter.finish();
    // completed 이벤트에 더 긴 확정 텍스트가 있으면 우선
    if (completedStepsText && completedStepsText.length >= fullText.length) {
      if (completedStepsText.length > fullText.length) {
        const rest = completedStepsText.slice(fullText.length);
        if (rest) await emitAsTypingDeltas(rest, onDelta);
      }
      fullText = completedStepsText;
    }
    let usedFallback = false;

    /** STOP/tool_calls/completed/requires_action 만 정상 종료. in_progress 등은 조기 종료로 본다. */
    const streamComplete =
      finishReason === 'STOP' ||
      finishReason === 'tool_calls' ||
      interactionStatus === 'completed' ||
      interactionStatus === 'requires_action';

    if (streamError && !fullText && functionCalls.length === 0) {
      const kind = classifyGeminiFailureKind(res.status, streamError);
      const effectiveStatus =
        kind === 'rate_limit' && !isGeminiRateLimitStatus(res.status) ? 429 : res.status;
      const diagStreamErr: GeminiAttemptDiag = {
        ...emptyAttemptHttpFields(),
        attemptIndex: i + 1,
        attemptLabel: `${attempt.label}_interactions_sse_error`,
        withSearch: attempt.withSearch,
        maxOutputTokens: attempt.maxOutputTokens,
        ok: false,
        httpStatus: effectiveStatus,
        errorKind: kind,
        errorMessage: streamError.slice(0, kind === 'rate_limit' ? 6000 : 800),
        finishReason: finishReason ?? interactionStatus ?? null,
        blockReason: null,
        groundedQueryCount: groundedQueries.length,
        elapsedMs: Date.now() - attemptStarted,
        providerRequestId: pickProviderRequestId(headersToRecord(res.headers)) ?? interactionId,
        responseBodyText: streamError.slice(0, kind === 'rate_limit' ? 6000 : 800),
      };
      if (kind === 'rate_limit') {
        diagStreamErr.quotaClass = 'unknown';
      }
      await attachRequestSnapshot(diagStreamErr, requestBody, true);
      if (kind === 'rate_limit') logQuotaDiagEvent(modelName, attempt, diagStreamErr, requestBody);
      attemptDiags.push(diagStreamErr);
      lastFail = {
        ok: false,
        kind,
        status: effectiveStatus,
        message: streamError,
        attempts: attemptDiags,
        needsWebSearch,
        interactionId,
      };
      console.warn(
        JSON.stringify({
          fn: 'llm-chat-send',
          event: 'gemini_interactions_sse_error',
          attempt: i + 1,
          label: attempt.label,
          httpStatus: effectiveStatus,
          kind,
          message: streamError.slice(0, 500),
        }),
      );
      if (kind === 'auth' || kind === 'rate_limit') return lastFail;
      if (i < attempts.length - 1) continue;
      break;
    }

    // 스트림이 비정상 종료(in_progress 등)이거나 본문이 비면 논스트리밍 Interactions로 확정
    if (!streamComplete || (!fullText && functionCalls.length === 0)) {
      try {
        const unaryBody = buildBody(attempt, false);
        const res2 = await fetchInteractionsWithTimeout(
          GEMINI_INTERACTIONS_URL,
          apiKey,
          unaryBody,
          attempt.timeoutMs,
        );
        const parsed = await parseInteractionsUnaryResponse(res2, attempt.withSearch);
        if (parsed.ok) {
          usedFallback = true;
          const authoritative = parsed.fullText;
          if (authoritative.startsWith(fullText)) {
            const rest = authoritative.slice(fullText.length);
            if (rest) await emitAsTypingDeltas(rest, onDelta);
          } else if (!fullText && authoritative) {
            await emitAsTypingDeltas(authoritative, onDelta);
          }
          // prefix 불일치여도 finalize/onFinal이 권위 본문을 쓰도록 fullText만 교체
          if (authoritative) fullText = authoritative;
          if (parsed.functionCalls.length > 0) {
            functionCalls.length = 0;
            functionCalls.push(...parsed.functionCalls);
          }
          if (parsed.groundedQueries.length > 0) {
            groundedQueries.length = 0;
            groundedQueries.push(...parsed.groundedQueries);
          }
          usage = parsed.usage;
          interactionId = parsed.interactionId ?? interactionId;
          interactionStatus = parsed.status ?? interactionStatus;
          finishReason = functionCalls.length > 0
            ? 'tool_calls'
            : 'STOP';
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
            finishReason: null,
            blockReason: null,
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
        // fallback 실패 시 스트림 텍스트라도 사용
      }
    }

    if (!fullText && functionCalls.length === 0) {
      const diagEmpty: GeminiAttemptDiag = {
        ...emptyAttemptHttpFields(),
        attemptIndex: i + 1,
        attemptLabel: `${attempt.label}_interactions_empty`,
        withSearch: attempt.withSearch,
        maxOutputTokens: attempt.maxOutputTokens,
        ok: false,
        httpStatus: res.status,
        errorKind: 'other',
        errorMessage: 'gemini_interactions: empty response after stream',
        finishReason: finishReason ?? interactionStatus ?? null,
        blockReason: null,
        groundedQueryCount: groundedQueries.length,
        elapsedMs: Date.now() - attemptStarted,
        providerRequestId: pickProviderRequestId(headersToRecord(res.headers)) ?? interactionId,
      };
      await attachRequestSnapshot(diagEmpty, requestBody, true);
      attemptDiags.push(diagEmpty);
      lastFail = {
        ok: false,
        kind: 'other',
        message: 'gemini_interactions: empty response after stream',
        attempts: attemptDiags,
        needsWebSearch,
        interactionId,
      };
      if (i < attempts.length - 1) continue;
      break;
    }

    const diagOk: GeminiAttemptDiag = {
      ...emptyAttemptHttpFields(),
      attemptIndex: i + 1,
      attemptLabel: usedFallback
        ? `${attempt.label}_interactions_fallback`
        : `${attempt.label}_interactions_sse`,
      withSearch: attempt.withSearch,
      maxOutputTokens: attempt.maxOutputTokens,
      ok: true,
      httpStatus: res.status,
      errorKind: null,
      errorMessage: usedFallback ? 'sse_early_end_used_interactions_unary' : null,
      finishReason: finishReason ?? interactionStatus ?? null,
      blockReason: null,
      groundedQueryCount: groundedQueries.length,
      elapsedMs: Date.now() - attemptStarted,
      providerRequestId: pickProviderRequestId(headersToRecord(res.headers)) ?? interactionId,
    };
    await attachRequestSnapshot(
      diagOk,
      requestBody,
      shouldPersistRequestBodyJson({
        ok: true,
        withSearch: attempt.withSearch,
        withTools: detectToolsInRequestBody(requestBody).withTools,
        hasFunctionCalls: functionCalls.length > 0,
      }),
    );
    diagOk.functionCallsJson = compactFunctionCallsForLog(functionCalls);
    attemptDiags.push(diagOk);

    console.log(
      JSON.stringify({
        fn: 'llm-chat-send',
        event: 'gemini_interactions_ok',
        attempt: i + 1,
        label: attempt.label,
        withSearch: attempt.withSearch,
        groundedQueryCount: groundedQueries.length,
        elapsedMs: diagOk.elapsedMs,
        textLen: fullText.length,
        functionCallCount: functionCalls.length,
        interactionId,
        interactionStatus,
        usedFallback,
      }),
    );

    return {
      ok: true,
      text: fullText,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      finishReason: finishReason ?? interactionStatus ?? undefined,
      thoughtsTokens: usage.thoughtsTokens,
      grounded: Boolean(attempt.withSearch && groundedQueries.length > 0),
      groundedQueryCount: groundedQueries.length,
      attempts: attemptDiags,
      needsWebSearch,
      functionCalls,
      interactionId,
    };
  }

  return (
    lastFail ?? {
      ok: false,
      kind: 'other',
      message: 'gemini_interactions: all attempts failed',
      attempts: attemptDiags,
      needsWebSearch,
    }
  );
}

export async function generateTitleGeminiInteractions(
  apiKey: string,
  modelName: string,
  userMessage: string,
): Promise<TitleResult | null> {
  const model = toInteractionsModelName(modelName);
  const prompt =
    '다음은 사용자가 채팅에서 처음 보낸 메시지다. 이 대화를 대표하는 아주 짧은 한국어 제목을 만들어라.\n' +
    '규칙: 명사형으로 12자 이내. 설명·따옴표·마침표 없이 제목 한 줄만 출력. 메시지를 그대로 베끼지 말고 핵심 주제만 요약.\n\n' +
    `사용자 메시지:\n${userMessage}`;

  const thinkingLevel = getInteractionsThinkingLevel(modelName);
  const body: Record<string, unknown> = {
    model,
    input: prompt,
    stream: false,
    generation_config: {
      max_output_tokens: GEMINI_TITLE_MAX_OUTPUT_TOKENS + (thinkingLevel === 'low' ? 64 : 0),
      ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
    },
  };

  try {
    const res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: interactionsHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TITLE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // deno-lint-ignore no-explicit-any
    const json: any = await res.json().catch(() => null);
    if (!json) return null;
    const raw = extractTextFromInteractionSteps(json.steps);
    const title = sanitizeGeneratedTitle(raw);
    if (!title) return null;
    const usage = usageFromInteraction(json);
    return {
      title,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    };
  } catch {
    return null;
  }
}

/**
 * Intent Classifier용 Interactions 단발 호출 (JSON response_format).
 * 실패 시 null → 호출측이 Legacy/휴리스틱으로 폴백.
 */
export async function classifyIntentViaInteractions(params: {
  apiKey: string;
  modelName: string;
  systemInstruction: string;
  userMessage: string;
  maxOutputTokens: number;
  timeoutMs: number;
}): Promise<string | null> {
  const model = toInteractionsModelName(params.modelName);
  const body: Record<string, unknown> = {
    model,
    input: params.userMessage,
    stream: false,
    system_instruction: params.systemInstruction,
    generation_config: {
      max_output_tokens: params.maxOutputTokens,
      thinking_level: 'minimal',
    },
    response_format: { type: 'json_object' },
  };
  try {
    const res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: interactionsHeaders(params.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(params.timeoutMs),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(
        JSON.stringify({
          fn: 'llm-chat-send',
          event: 'intent_classifier_interactions_http_error',
          status: res.status,
          bodyPreview: errBody.slice(0, 300),
        }),
      );
      return null;
    }
    // deno-lint-ignore no-explicit-any
    const json: any = await res.json().catch(() => null);
    if (!json) return null;
    const text = extractTextFromInteractionSteps(json.steps);
    return text || null;
  } catch (e) {
    console.warn(
      JSON.stringify({
        fn: 'llm-chat-send',
        event: 'intent_classifier_interactions_exception',
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return null;
  }
}
