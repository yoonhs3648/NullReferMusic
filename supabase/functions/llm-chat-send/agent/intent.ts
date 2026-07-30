/**
 * Intent Classifier — IntentResult 구조체.
 *
 * 1) Gemini Intent Classifier LLM
 * 2) 사용자 문구 기반 deterministic guard (다운로드/검색 누락 방지)
 * 3) Classifier 실패 시에도 다운로드·검색 키워드가 있으면 Melon 도구 ON
 *
 * Google 호출: Interactions API 우선, 실패 시 Legacy generateContent.
 */

import { shouldUseGeminiInteractionsApi } from './ops/geminiApiMode.ts';
import { classifyIntentViaInteractions } from './providers/geminiInteractions.ts';
import type { AiLabIntentKind, IntentResult, IntentSource } from './types.ts';

/** 분류 전용 — 메인 채팅 모델과 분리 */
export const INTENT_CLASSIFIER_MODEL = 'models/gemini-2.0-flash';
const INTENT_TIMEOUT_MS = 10_000;
const INTENT_MAX_OUTPUT_TOKENS = 400;

const VALID: readonly AiLabIntentKind[] = [
  'general',
  'music',
  'latest',
  'recommendation',
  'download',
  'faq',
] as const;

const CLASSIFIER_SYSTEM = `너는 NullRefer Music AI Lab Intent Classifier다.
JSON만 출력. 설명·마크다운·코드펜스 금지.

스키마:
{"intent":"general|music|latest|recommendation|download|faq","confidence":0.0~1.0,"needsWebSearch":bool,"needsVectorSearch":bool,"needsFaqSearch":bool,"needsDownloadTool":bool,"needsHistory":bool,"needsUserProfile":bool,"needsMusicSearch":bool,"reasoning":"짧은한글"}

## 최우선 규칙 (반드시)
- 문장에 다운로드/받아줘/넣어줘/저장/download/mp3/flac 이 있으면 → intent=download, needsDownloadTool=true, needsMusicSearch=true, needsWebSearch=false
  예: "이센스 독을 다운로드해줘", "아이유 blooming 다운로드", "좋은날 받아줘"
- 곡·가수·앨범을 찾아/검색/알려줘 → needsMusicSearch=true
  · 다운로드도 같이면 download + 위 플래그
  · 찾기만이면 intent는 download 또는 music, needsMusicSearch=true (Melon 검색 도구 필요)
- 「멜론에서」라고 안 해도 Melon 검색 도구가 필요하면 needsMusicSearch=true

## 기타
- latest(차트/오늘/이번주/최신/뉴스/순위) → needsWebSearch=true (단, 다운로드 문장이면 download 우선)
- recommendation(취향 추천) → needsVectorSearch/needsUserProfile/needsHistory=true
- faq(앱 사용/로그인/결제/오류) → needsFaqSearch=true
- music(아티스트 설명만, 검색·다운로드 없음) → 플래그 대부분 false
- needsDownloadTool과 needsWebSearch 동시 true 금지(다운로드 우선)

## 예시
- "이센스 독을 다운로드해줘" → download, needsDownloadTool=true, needsMusicSearch=true
- "아이유 노래 넣어줘" → download, needsDownloadTool=true, needsMusicSearch=true
- "아이유 좋은날 찾아줘" → download 또는 music, needsMusicSearch=true
- "blooming 알려줘" → music, needsMusicSearch=true
- "아이유 가수 정보" → music, needsMusicSearch=true
- "Love poem 앨범 알려줘" → music, needsMusicSearch=true
- "비틀즈가 누구야" → music, needsMusicSearch=false
- "이번주 멜론 차트" → latest, needsWebSearch=true`;

/** 다운로드·저장 요청 */
const RE_DOWNLOAD =
  /다운로드|다운\s*받|다운받|받아\s*줘|받아줘|넣어\s*줘|넣어줘|저장해|저장\s*해|받아\s*볼|mp3|flac|\bdownload\b/i;

/** Melon 트랙/메타 검색이 필요한 요청 */
const RE_MUSIC_SEARCH =
  /찾아\s*줘|찾아줘|검색해|검색\s*해|search|알려\s*줘|알려줘|정보\s*알려|곡\s*정보|노래\s*정보|스포티파이에서|spotify에서|멜론에서|유튜브에서/i;

/** 가수/앨범 쪽 힌트 (프롬프트·가드용, intent 강제에는 보조) */
const RE_ARTIST_HINT = /가수|아티스트|artist|누구야|멤버/i;
const RE_ALBUM_HINT = /앨범|album|lp\b|ep\b/i;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeIntent(raw: unknown): AiLabIntentKind {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'app') return 'faq';
  return (VALID as readonly string[]).includes(s) ? (s as AiLabIntentKind) : 'general';
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === '1') return true;
    if (t === 'false' || t === '0') return false;
  }
  return fallback;
}

function logIntent(event: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      fn: 'llm-chat-send',
      event,
      ts: new Date().toISOString(),
      ...data,
    }),
  );
}

export function messageLooksLikeDownload(userMessage: string): boolean {
  return RE_DOWNLOAD.test(userMessage.trim());
}

export function messageLooksLikeMusicSearch(userMessage: string): boolean {
  const t = userMessage.trim();
  if (RE_MUSIC_SEARCH.test(t)) return true;
  // 「이센스 독」처럼 짧은 곡명만 있어도 다운로드 가드와 결합될 때 검색 필요
  return false;
}

function normalizeFlags(r: IntentResult): IntentResult {
  let {
    needsWebSearch,
    needsDownloadTool,
    needsVectorSearch,
    needsFaqSearch,
    needsHistory,
    needsUserProfile,
    needsMusicSearch,
  } = r;

  if (r.intent === 'latest') needsWebSearch = true;
  if (r.intent === 'download') {
    needsDownloadTool = true;
    needsWebSearch = false;
    // 다운로드면 Melon 검색부터 이어져야 함
    needsMusicSearch = true;
  }
  if (r.intent === 'recommendation') {
    needsVectorSearch = true;
    needsUserProfile = true;
    needsHistory = true;
  }
  if (r.intent === 'faq') needsFaqSearch = true;
  if (needsDownloadTool) {
    needsWebSearch = false;
    needsMusicSearch = true;
  }
  if (needsMusicSearch && !needsDownloadTool && r.intent === 'download') {
    needsDownloadTool = true;
  }

  return {
    ...r,
    needsWebSearch,
    needsDownloadTool,
    needsVectorSearch,
    needsFaqSearch,
    needsHistory,
    needsUserProfile,
    needsMusicSearch,
    confidence: clamp01(r.confidence),
  };
}

/**
 * Classifier 결과(또는 실패 기본값)에 사용자 문구 가드를 적용.
 * 다운로드·검색 요청이 music/general로 오분류되어 도구가 꺼지는 것을 막는다.
 */
export function applyIntentMessageGuards(
  userMessage: string,
  base: IntentResult,
): IntentResult {
  const t = userMessage.trim();
  let next = { ...base };
  let guarded = false;

  const wantsDownload = messageLooksLikeDownload(t);
  const wantsSearch = messageLooksLikeMusicSearch(t) || wantsDownload;

  if (wantsDownload) {
    if (
      next.intent !== 'download' ||
      !next.needsDownloadTool ||
      !next.needsMusicSearch ||
      next.needsWebSearch
    ) {
      guarded = true;
    }
    next = {
      ...next,
      intent: 'download',
      needsDownloadTool: true,
      needsMusicSearch: true,
      needsWebSearch: false,
      confidence: Math.max(next.confidence, 0.9),
      reasoning: [next.reasoning, 'guard:download'].filter(Boolean).join('|').slice(0, 160),
    };
  } else if (wantsSearch) {
    if (!next.needsMusicSearch) guarded = true;
    next = {
      ...next,
      needsMusicSearch: true,
      // 곡 찾기만 해도 Melon FC가 필요 — download intent까지는 강제하지 않음
      confidence: Math.max(next.confidence, 0.75),
      reasoning: [next.reasoning, 'guard:music_search'].filter(Boolean).join('|').slice(0, 160),
    };
    // 가수/앨범 힌트가 있어도 needsMusicSearch만으로 search_music_* 도구가 노출됨
    void RE_ARTIST_HINT;
    void RE_ALBUM_HINT;
  }

  next = normalizeFlags(next);
  if (guarded && next.source === 'classifier') {
    next = { ...next, source: 'classifier_guarded' };
  }
  if (guarded && next.source === 'classifier_failed') {
    next = { ...next, source: 'keyword_guard' };
  }
  return next;
}

function parseClassifierJson(text: string): IntentResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let jsonStr = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) jsonStr = fence[1].trim();
  const brace = jsonStr.match(/\{[\s\S]*\}/);
  if (brace) jsonStr = brace[0];
  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const intent = normalizeIntent(obj.intent);
    return normalizeFlags({
      intent,
      confidence: clamp01(Number(obj.confidence ?? 0.7)),
      needsWebSearch: bool(obj.needsWebSearch, intent === 'latest'),
      needsVectorSearch: bool(obj.needsVectorSearch, intent === 'recommendation'),
      needsFaqSearch: bool(obj.needsFaqSearch, intent === 'faq'),
      needsDownloadTool: bool(obj.needsDownloadTool, intent === 'download'),
      needsHistory: bool(obj.needsHistory, intent === 'recommendation'),
      needsUserProfile: bool(obj.needsUserProfile, intent === 'recommendation'),
      needsMusicSearch: bool(
        obj.needsMusicSearch,
        intent === 'download' || bool(obj.needsDownloadTool, intent === 'download'),
      ),
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning.slice(0, 160) : undefined,
      source: 'classifier',
    });
  } catch {
    return null;
  }
}

/**
 * 학습 컷오프/실시간 웹이 필요한 질문 여부.
 * 웹 검색 비활성 이후에는 메인 LLM을 호출하지 않고 채팅 경고로 대체한다.
 */
export function isBeyondKnowledgeCutoffIntent(
  intent: Pick<IntentResult, 'intent' | 'needsWebSearch'>,
): boolean {
  return intent.needsWebSearch === true || intent.intent === 'latest';
}

/** @deprecated 전체 휴리스틱 폴백은 사용하지 않음. 테스트·참고용으로만 유지. */
export function classifyIntentHeuristic(userMessage: string): IntentResult {
  const t = userMessage.trim();
  if (messageLooksLikeDownload(t)) {
    return applyIntentMessageGuards(
      t,
      intentWhenClassifierUnavailable('heuristic_download'),
    );
  }
  if (messageLooksLikeMusicSearch(t)) {
    return applyIntentMessageGuards(
      t,
      {
        ...intentWhenClassifierUnavailable('heuristic_search'),
        intent: 'music',
        needsMusicSearch: true,
        source: 'heuristic_fallback',
      },
    );
  }
  return intentWhenClassifierUnavailable('heuristic_general');
}

export function toolContinueIntentResult(): IntentResult {
  return normalizeFlags({
    intent: 'download',
    confidence: 1,
    needsWebSearch: false,
    needsVectorSearch: false,
    needsFaqSearch: false,
    needsDownloadTool: true,
    needsHistory: false,
    needsUserProfile: false,
    needsMusicSearch: true,
    reasoning: 'client_tool_continue',
    source: 'tool_continue',
  });
}

export async function classifyIntentWithLlm(
  apiKey: string,
  userMessage: string,
): Promise<IntentResult | null> {
  const message = userMessage.trim().slice(0, 2000);
  if (!message || !apiKey.trim()) return null;

  if (shouldUseGeminiInteractionsApi()) {
    const text = await classifyIntentViaInteractions({
      apiKey,
      modelName: INTENT_CLASSIFIER_MODEL,
      systemInstruction: CLASSIFIER_SYSTEM,
      userMessage: message,
      maxOutputTokens: INTENT_MAX_OUTPUT_TOKENS,
      timeoutMs: INTENT_TIMEOUT_MS,
    });
    if (text) {
      const parsed = parseClassifierJson(text);
      if (parsed) {
        logIntent('intent_classifier_ok', {
          api: 'interactions',
          intent: parsed.intent,
          needsDownloadTool: parsed.needsDownloadTool,
          needsMusicSearch: parsed.needsMusicSearch,
          preview: message.slice(0, 60),
        });
        return parsed;
      }
      logIntent('intent_classifier_parse_fail', {
        api: 'interactions',
        preview: message.slice(0, 60),
        textPreview: text.slice(0, 200),
      });
    }
    // Interactions 실패/파싱 실패 → Legacy generateContent 폴백
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/${INTENT_CLASSIFIER_MODEL}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CLASSIFIER_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: INTENT_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(INTENT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logIntent('intent_classifier_http_error', {
        api: 'generateContent',
        status: res.status,
        bodyPreview: errBody.slice(0, 300),
        preview: message.slice(0, 60),
      });
      return null;
    }
    const json = await res.json();
    // deno-lint-ignore no-explicit-any
    const parts = (json as any)?.candidates?.[0]?.content?.parts;
    let text = '';
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (p && typeof p.text === 'string') text += p.text;
      }
    }
    const parsed = parseClassifierJson(text);
    if (parsed) {
      logIntent('intent_classifier_ok', {
        api: 'generateContent',
        intent: parsed.intent,
        needsDownloadTool: parsed.needsDownloadTool,
        needsMusicSearch: parsed.needsMusicSearch,
        preview: message.slice(0, 60),
      });
      return parsed;
    }
    logIntent('intent_classifier_parse_fail', {
      api: 'generateContent',
      preview: message.slice(0, 60),
      textPreview: text.slice(0, 200),
    });
    return null;
  } catch (e) {
    logIntent('intent_classifier_exception', {
      api: 'generateContent',
      message: e instanceof Error ? e.message : String(e),
      preview: message.slice(0, 60),
    });
    return null;
  }
}

export function intentWhenClassifierUnavailable(reason: string): IntentResult {
  return {
    intent: 'general',
    confidence: 0,
    needsWebSearch: false,
    needsVectorSearch: false,
    needsFaqSearch: false,
    needsDownloadTool: false,
    needsHistory: false,
    needsUserProfile: false,
    needsMusicSearch: false,
    reasoning: reason.slice(0, 160),
    source: 'classifier_failed' satisfies IntentSource,
  };
}

export async function analyzeUserIntent(params: {
  userMessage: string;
  isToolContinue: boolean;
  googleApiKey: string | null;
}): Promise<IntentResult> {
  if (params.isToolContinue) return toolContinueIntentResult();

  const msg = params.userMessage.trim();
  let base: IntentResult;

  if (!params.googleApiKey?.trim()) {
    base = intentWhenClassifierUnavailable('no_google_api_key');
  } else {
    const classified = await classifyIntentWithLlm(params.googleApiKey, msg);
    base = classified ?? intentWhenClassifierUnavailable('classifier_failed_or_unparsed');
  }

  const guarded = applyIntentMessageGuards(msg, base);
  logIntent('intent_final', {
    source: guarded.source,
    intent: guarded.intent,
    needsDownloadTool: guarded.needsDownloadTool,
    needsMusicSearch: guarded.needsMusicSearch,
    needsWebSearch: guarded.needsWebSearch,
    reasoning: guarded.reasoning ?? null,
    preview: msg.slice(0, 80),
    classifierSource: base.source,
    classifierIntent: base.intent,
  });
  return guarded;
}
