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
// 흐름(성능을 위해 DB 왕복을 최소화):
//   1) nrm_rpc_chat_prepare_turn  — 세션 확보/생성 + 사용자 메시지 저장 +
//      provider/permission/quota/history 를 한 번에 조회 (DB 왕복 1회)
//   2) (필요 시) LLM Provider REST API 스트리밍 호출 — DB와 무관한 순수 HTTP.
//      응답은 NDJSON(줄바꿈으로 구분된 JSON) 스트림으로 클라이언트에 그대로
//      릴레이한다 — 앱이 "타이핑 효과"로 보여줄 수 있게.
//   3) nrm_rpc_chat_finalize_turn — 응답(assistant/system) 저장 + 세션 갱신 +
//      (요청을 실제로 시도한 경우만) LLMTokenHistory 기록 (DB 왕복 1회)
//   4) LLMUserQuota 누적 + (새 세션인 경우) LLM 기반 대화 제목 생성은 클라이언트에
//      스트림을 이미 다 보낸 "다음" 백그라운드로 처리한다(EdgeRuntime.waitUntil)
//      — 둘 다 사용자가 보는 응답 속도에 전혀 영향을 주지 않는다.
//
// NDJSON 스트리밍 프로토콜 (한 줄에 JSON 객체 하나, Content-Type: application/x-ndjson):
//   {"type":"meta","requestId":...,"sessionId":...,"isNewSession":...,"title":...,"userMessage":{...}}
//     — prepare_turn 완료 즉시 전송(권한/한도 체크 전). 클라이언트가 세션/사용자
//       메시지를 바로 확정 표시할 수 있게 가장 먼저 보낸다.
//   {"type":"delta","text":"..."}
//     — LLM이 실제로 스트리밍 응답 중일 때만, 조각(delta) 단위로 여러 번 전송.
//   {"type":"final","requestId":...,"sessionId":...,"isNewSession":...,"title":...,"message":{...}}
//     — 이번 턴의 최종 확정 메시지(assistant 또는 system) 저장 완료 후 1회 전송,
//       스트림 종료. delta로 이미 보여준 텍스트와 message.Content가 항상 일치한다.
//   {"type":"error","requestId":...,"message":"..."}
//     — meta 전송 후 처리 중 복구 불가능한 오류(finalize 저장 실패 등). 이 경우
//       final은 오지 않고 스트림이 그대로 끝난다.
// meta 이전(=prepare_turn 자체가 실패한) 경우는 스트리밍하지 않고 기존처럼 평범한
// JSON 에러 응답(4xx/5xx)을 즉시 반환한다.
//
// 멀티 프로바이더 확장: ADAPTERS 맵에 LLMProvider.ProviderName 별 어댑터를 등록한다.
// 지금은 Gemini만 구현. ChatGPT/Claude 등을 추가하려면 새 어댑터를 만들어 맵에
// 등록하기만 하면 된다(아래 나머지 로직은 전혀 건드리지 않아도 됨).
//
// Gemini chat 요청에는 Grounding with Google Search(`tools: [{ google_search: {} }]`)를
// 켠다 — 학습 컷오프 이후 정보(빌보드 차트 등)에 답하기 위함. 제목 생성에는 미적용.
//
// 로깅: 요청마다 requestId(UUID) 하나로 전 구간을 묶는다. Supabase Dashboard →
// Edge Functions → llm-chat-send → Logs (또는 `supabase functions logs
// llm-chat-send`)에서 requestId로 grep 하면 해당 요청의 전체 흐름(각 단계 소요
// 시간·성공/실패·최종 outcome)을 한 번에 재구성할 수 있다. ApiKey·전체 대화
// 본문은 절대 로그에 남기지 않는다(메시지는 길이/미리보기만).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// chat 호출(generateContent, 논스트리밍)의 전체 타임아웃 상한 — 응답이 길거나
// thinking·Google Search grounding을 쓰는 모델은 오래 걸릴 수 있어 넉넉히 잡는다.
const GEMINI_STREAM_MAX_TOTAL_MS = 120_000;
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
const CHAT_HISTORY_LIMIT = 40;
const LOG_PREVIEW_LEN = 60;

const MSG_PERMISSION_DENIED = (modelDisplayName: string) =>
  `${modelDisplayName}의 사용권한이 없습니다. 관리자에게 문의해주세요.`;
const MSG_TOKEN_EXPIRED = '토큰이 만료되었어요. 관리자에게 문의해주세요.';
const MSG_NETWORK_PROBLEM = '네트워크 문제로 요청할 수 없어요. 나중에 다시 시도해 주세요.';

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

type ChatTurn = { role: 'user' | 'assistant'; content: string };

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
  /** 진단용 — groundingMetadata.webSearchQueries 개수 */
  groundedQueryCount?: number;
};
type AdapterFailure = {
  ok: false;
  kind: 'auth' | 'network' | 'other';
  message: string;
  /** 실패 원인 HTTP status (있는 경우) — 로깅용 */
  status?: number;
};
type AdapterResult = AdapterSuccess | AdapterFailure;

type TitleResult = { title: string; inputTokens: number; outputTokens: number; totalTokens: number };

interface LlmAdapter {
  /** 스트리밍 호출. onDelta는 텍스트 조각이 도착할 때마다 호출된다(0회 이상). */
  stream(
    apiKey: string,
    modelName: string,
    history: ChatTurn[],
    userMessage: string,
    onDelta: (deltaText: string) => void,
  ): Promise<AdapterResult>;
  /** 대화 제목 생성(짧은 논스트리밍 호출). 실패 시 null — 호출부가 임시 제목을 유지. */
  generateTitle(apiKey: string, modelName: string, userMessage: string): Promise<TitleResult | null>;
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

// 타이핑 효과 재생 단위(문자 수)·간격 — 실제 네트워크 스트리밍이 아니라, 이미 확정된
// 전체 텍스트를 잘라서 onDelta에 순차 전달하는 방식(아래 "왜 스트리밍 대신 재생?" 참고).
const TYPING_REPLAY_CHUNK_CHARS = 16;
const TYPING_REPLAY_DELAY_MS = 30;

async function emitAsTypingDeltas(
  text: string,
  onDelta: (deltaText: string) => void,
): Promise<void> {
  for (let i = 0; i < text.length; i += TYPING_REPLAY_CHUNK_CHARS) {
    onDelta(text.slice(i, i + TYPING_REPLAY_CHUNK_CHARS));
    if (i + TYPING_REPLAY_CHUNK_CHARS < text.length) {
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
 * Gemini 호출 — chat도 title과 동일하게 논스트리밍 `generateContent`를 쓴다.
 *
 * 왜 스트리밍(`streamGenerateContent?alt=sse`) 대신 재생(replay) 방식인가 (2026-07-22):
 * 실 로그로 확인한 결과, `streamGenerateContent`가 `finishReason` 없이(=완료 신호
 * 없이) SSE 연결을 조기 종료하는 경우가 있었다 — 예: "안녕하세요! 😊"(3 토큰)에서
 * 끊기거나 "파이"(2 토큰)처럼 단어 중간에서 끊김. `maxOutputTokens`(65536까지 올려도
 * 무관), thinking 예산과는 무관하게 실제 사용 토큰이 그 한도에 한참 못 미친 채로
 * 끊겼고, 두 번째 SSE 프레임까지는 정상 수신됐는데 그 다음 프레임(`finishReason`이
 * 담겨야 할)이 아예 오지 않고 연결이 끝났다(readCount 늘어나지 않고 `done:true`) —
 * 즉 우리 파싱 버그가 아니라 외부(Google SSE 게이트웨이 추정) 조기 종료.
 *
 * `generateTitle()`은 애초에 논스트리밍 `generateContent`를 쓰고 있었고 이런 조기
 * 종료 증상이 보고된 적이 없어, chat 응답도 같은 방식으로 바꿨다: 응답을 통째로
 * 받아(불완전하면 HTTP/JSON 파싱 자체가 실패하므로 "일부만 온 것을 완성된 것처럼
 * 오인"할 수가 없다) 확정한 뒤, 타이핑 효과는 서버에서 `onDelta`를 여러 번 호출해
 * 재생한다(`emitAsTypingDeltas`). 네트워크 전송 자체는 이미 fast(1~5초)라 체감
 * 지연은 거의 없고, 클라이언트는 전송 즉시 붙는 "타이핑 중" 표시(typing placeholder)
 * 덕분에 차이를 못 느낀다.
 */
/** Gemini Grounding with Google Search — 학습 컷오프 이후 최신 정보(차트·뉴스 등) 질의용.
 *  제목 생성에는 넣지 않는다(불필요·비용). 모델이 검색이 필요 없다고 판단하면 안 쓸 수도 있다. */
const GEMINI_GOOGLE_SEARCH_TOOL = { google_search: {} };

function extractGeminiVisibleText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => {
      if (!p || typeof p !== 'object') return '';
      const part = p as { text?: string; thought?: boolean };
      // thinking 파트는 UI에 노출하지 않음
      if (part.thought) return '';
      return typeof part.text === 'string' ? part.text : '';
    })
    .join('');
}

const geminiAdapter: LlmAdapter = {
  async stream(apiKey, modelName, history, userMessage, onDelta) {
    const modelPath = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contents = buildGeminiContents(history, userMessage);
    const thinkingConfig = getGeminiThinkingConfig(modelName);
    const modernMaxOutputTokens = getGeminiMaxOutputTokens(modelName);

    const doFetch = (withThinking: boolean, maxOutputTokens: number, withSearch: boolean) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(withSearch ? { tools: [GEMINI_GOOGLE_SEARCH_TOOL] } : {}),
          generationConfig: {
            maxOutputTokens,
            temperature: 0.8,
            ...(withThinking && thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
        signal: AbortSignal.timeout(GEMINI_STREAM_MAX_TOTAL_MS),
      });

    // 모델별로 thinkingConfig / google_search / output token 한도 조합이 바뀌어서
    // (400이면 다음 단계로) 순차 재시도 사다리:
    //   1~N) google_search 켠 채 thinking·한도 조합
    //   마지막) 동일 조합에서 search만 끈 fallback (구형·미지원 모델용 — 답변은 컷오프 제한)
    // thinking 미지원 모델은 thinking 단계를 건너뛴다.
    type GeminiAttempt = { withThinking: boolean; maxOutputTokens: number; withSearch: boolean };
    const baseAttempts: Array<{ withThinking: boolean; maxOutputTokens: number }> = [];
    if (thinkingConfig) baseAttempts.push({ withThinking: true, maxOutputTokens: modernMaxOutputTokens });
    baseAttempts.push({ withThinking: false, maxOutputTokens: modernMaxOutputTokens });
    if (modernMaxOutputTokens !== GEMINI_CHAT_MAX_OUTPUT_TOKENS_LEGACY) {
      baseAttempts.push({ withThinking: false, maxOutputTokens: GEMINI_CHAT_MAX_OUTPUT_TOKENS_LEGACY });
    }
    const attempts: GeminiAttempt[] = [
      ...baseAttempts.map((a) => ({ ...a, withSearch: true })),
      // search 자체가 400을 내는 경우에만 도달 — 마지막 조합만 search 없이 재시도
      { withThinking: false, maxOutputTokens: modernMaxOutputTokens, withSearch: false },
    ];

    let res!: Response;
    let usedSearch = true;
    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]!;
      try {
        res = await doFetch(attempt.withThinking, attempt.maxOutputTokens, attempt.withSearch);
      } catch (e) {
        return {
          ok: false,
          kind: 'network',
          message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        };
      }
      usedSearch = attempt.withSearch;
      if (res.ok || res.status !== 400 || i === attempts.length - 1) break;
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const kind = res.status === 401 || res.status === 403 ? 'auth' : 'other';
      return { ok: false, kind, status: res.status, message: bodyText.slice(0, 500) };
    }

    // deno-lint-ignore no-explicit-any
    const json: any = await res.json().catch(() => null);
    if (!json) {
      return { ok: false, kind: 'other', status: res.status, message: 'gemini: invalid json response' };
    }

    const blockReason: string | undefined = json?.promptFeedback?.blockReason;
    const candidate = json?.candidates?.[0];
    const finishReason: string | undefined = candidate?.finishReason;
    const fullText = extractGeminiVisibleText(candidate?.content?.parts);
    const grounding = candidate?.groundingMetadata;
    const groundedQueries: string[] = Array.isArray(grounding?.webSearchQueries)
      ? grounding.webSearchQueries.filter((q: unknown) => typeof q === 'string')
      : [];

    if (!fullText) {
      return {
        ok: false,
        kind: 'other',
        message: blockReason ? `gemini: blocked (${blockReason})` : 'gemini: empty response',
      };
    }

    await emitAsTypingDeltas(fullText, onDelta);

    const usage = json?.usageMetadata ?? {};
    return {
      ok: true,
      text: fullText,
      inputTokens: Number(usage.promptTokenCount ?? 0),
      outputTokens: Number(usage.candidatesTokenCount ?? 0),
      totalTokens: Number(usage.totalTokenCount ?? 0),
      finishReason,
      thoughtsTokens: Number(usage.thoughtsTokenCount ?? 0),
      grounded: usedSearch && groundedQueries.length > 0,
      groundedQueryCount: groundedQueries.length,
    };
  },

  async generateTitle(apiKey, modelName, userMessage) {
    const modelPath = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const thinkingConfig = getGeminiThinkingConfig(modelName);
    const prompt =
      '다음은 사용자가 채팅에서 처음 보낸 메시지다. 이 대화를 대표하는 아주 짧은 한국어 제목을 만들어라.\n' +
      '규칙: 명사형으로 12자 이내. 설명·따옴표·마침표 없이 제목 한 줄만 출력. 메시지를 그대로 베끼지 말고 핵심 주제만 요약.\n\n' +
      `사용자 메시지:\n${userMessage}`;

    // thinking 토큰도 maxOutputTokens 예산을 함께 쓰므로, thinking을 완전히 끌 수 없는
    // Pro 계열(thinkingBudget=128 고정)에서는 예산을 넉넉히 늘려야 실제 제목 텍스트가
    // 중간에 잘리지 않는다(끌 수 있는 Flash 계열은 기존 예산으로 충분).
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
      let res = await doFetch(!!thinkingConfig);
      if (!res.ok && res.status === 400 && thinkingConfig) {
        res = await doFetch(false);
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

/** LLMProvider.ProviderName → 어댑터. OpenAI/Claude 등 추가 시 여기만 늘리면 된다. */
const ADAPTERS: Record<string, LlmAdapter> = {
  Google: geminiAdapter,
};

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

    if (!serialNo || !Number.isFinite(modelId) || !message) {
      logWarn(requestId, 'invalid_params', {
        hasSerialNo: !!serialNo,
        modelId: payload.modelId,
        hasMessage: !!message,
      });
      return jsonResponse({ error: 'invalid_params', requestId }, 400);
    }

    logInfo(requestId, 'request_received', {
      serialNo,
      modelId,
      sessionId: sessionId ?? 'new',
      messageLength: message.length,
      messagePreview: preview(message),
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
    const prepared = prepareData as PrepareTurnResult;
    const { sessionId: resolvedSessionId, isNewSession, title, userMessage, model, permission, quotaUsed, history } =
      prepared;

    logInfo(requestId, 'prepare_turn_ok', {
      elapsedMs: prepareElapsedMs,
      sessionId: resolvedSessionId,
      isNewSession,
      modelFound: !!model,
      modelActive: model?.isActive ?? null,
      providerId: model?.providerId ?? null,
      providerName: model?.providerName ?? null,
      hasPermission: !!permission,
      isApproved: permission?.isApproved ?? null,
      allocatedToken: permission?.allocatedToken ?? null,
      quotaUsed,
      historyCount: Array.isArray(history) ? history.length : 0,
    });

    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    const runBackground = (task: Promise<unknown>) => {
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
      else void task;
    };

    /** 새 세션의 임시(휴리스틱) 제목을 LLM 기반 제목으로 교체 — 응답 이후 백그라운드, 실패해도 무해(임시 제목 유지). */
    const scheduleTitleGeneration = () => {
      if (!isNewSession || !model) return;
      const adapter = ADAPTERS[model.providerName];
      if (!adapter) return;
      const task = adapter
        .generateTitle(model.apiKey, model.modelName, message)
        .then(async (titleResult) => {
          if (!titleResult) {
            logInfo(requestId, 'title_generate_skipped', { sessionId: resolvedSessionId });
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
          logInfo(requestId, 'title_update_ok', { sessionId: resolvedSessionId, title: titleResult.title });
          // 제목 생성에 쓴 토큰도 제공자 월간 쿼터에 함께 반영(LLMTokenHistory에는 별도
          // 행을 만들지 않음 — 소량이라 무시 가능한 오차).
          if (titleResult.totalTokens > 0 && model) {
            const { error: quotaError } = await supabase.rpc('nrm_rpc_increment_llm_user_quota', {
              p_serial_no: serialNo,
              p_provider_id: model.providerId,
              p_target_month: targetMonth,
              p_input_token: titleResult.inputTokens,
              p_output_token: titleResult.outputTokens,
              p_total_token: titleResult.totalTokens,
            });
            if (quotaError) {
              logErr(requestId, 'title_quota_increment_failed', quotaError, { sessionId: resolvedSessionId });
            }
          }
        })
        .catch((e) => logErr(requestId, 'title_generate_threw', e, { sessionId: resolvedSessionId }));
      runBackground(task);
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
          const finishWithSystem = async (content: string, recordHistory: boolean, outcome: string) => {
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
            send({ type: 'final', requestId, sessionId: resolvedSessionId, isNewSession, title, message: data });
            logInfo(requestId, 'request_done', {
              outcome,
              totalElapsedMs: Date.now() - startedAt,
              sessionId: resolvedSessionId,
              isNewSession,
            });
            closeStream();
            scheduleTitleGeneration();
          };

          if (!model || !model.isActive) {
            logWarn(requestId, 'model_unavailable', {
              modelId,
              modelFound: !!model,
              isActive: model?.isActive ?? null,
            });
            await finishWithSystem(MSG_NETWORK_PROBLEM, false, 'model_unavailable');
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

          const adapter = ADAPTERS[model.providerName];
          if (!adapter) {
            // 아직 구현하지 않은 프로바이더 — 실제 요청을 시도한 것이 아니므로 이력 미기록.
            logErr(requestId, 'adapter_missing', new Error(`no adapter registered for providerName=${model.providerName}`), {
              providerId: model.providerId,
              providerName: model.providerName,
            });
            await finishWithSystem(MSG_NETWORK_PROBLEM, false, 'adapter_missing');
            return;
          }

          const chatHistory: ChatTurn[] = (Array.isArray(history) ? history : []).map((h) => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: String(h.content ?? ''),
          }));

          logInfo(requestId, 'llm_call_start', {
            providerName: model.providerName,
            modelName: model.modelName,
            historyCount: chatHistory.length,
            messageLength: message.length,
          });
          const llmStartedAt = Date.now();
          let deltaCount = 0;
          const result = await adapter.stream(model.apiKey, model.modelName, chatHistory, message, (deltaText) => {
            deltaCount += 1;
            send({ type: 'delta', text: deltaText });
          });
          const llmElapsedMs = Date.now() - llmStartedAt;

          if (!result.ok) {
            logWarn(requestId, 'llm_call_failed', {
              elapsedMs: llmElapsedMs,
              providerName: model.providerName,
              kind: result.kind,
              status: result.status ?? null,
              message: result.message,
              deltaCount,
            });
            const replyText = result.kind === 'auth' ? MSG_TOKEN_EXPIRED : MSG_NETWORK_PROBLEM;
            await finishWithSystem(replyText, true, 'llm_call_failed');
            return;
          }

          logInfo(requestId, 'llm_call_ok', {
            elapsedMs: llmElapsedMs,
            providerName: model.providerName,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            thoughtsTokens: result.thoughtsTokens,
            finishReason: result.finishReason,
            grounded: result.grounded ?? false,
            groundedQueryCount: result.groundedQueryCount ?? 0,
            replyLength: result.text.length,
            replyPreview: preview(result.text),
            deltaCount,
          });

          const finalizeStartedAt = Date.now();
          const { data: finalizeData, error: finalizeError } = await supabase.rpc('nrm_rpc_chat_finalize_turn', {
            p_session_id: resolvedSessionId,
            p_role: 'assistant',
            p_content: result.text,
            p_input_token: result.inputTokens,
            p_output_token: result.outputTokens,
            p_total_token: result.totalTokens,
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
            recordHistory: true,
          });

          send({ type: 'final', requestId, sessionId: resolvedSessionId, isNewSession, title, message: finalizeData });
          logInfo(requestId, 'request_done', {
            outcome: 'success',
            totalElapsedMs: Date.now() - startedAt,
            sessionId: resolvedSessionId,
            isNewSession,
            totalTokens: result.totalTokens,
          });
          closeStream();

          // 3) 사용자 응답 지연 없이 조용히 — Quota 누적 + (새 세션이면) 제목 생성은 응답 이후 백그라운드로.
          scheduleQuotaIncrement(result.inputTokens, result.outputTokens, result.totalTokens);
          scheduleTitleGeneration();
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
