/**
 * Intent Classifier — IntentResult 구조체.
 *
 * Google 호출: Feature Flag에 따라 Interactions API 우선, 실패 시 Legacy generateContent.
 */

import { shouldUseGeminiInteractionsApi } from './ops/geminiApiMode.ts';
import { classifyIntentViaInteractions } from './providers/geminiInteractions.ts';
import type { AiLabIntentKind, IntentResult } from './types.ts';

export const INTENT_CLASSIFIER_MODEL = 'models/gemini-2.0-flash-lite';
const INTENT_TIMEOUT_MS = 8_000;
const INTENT_MAX_OUTPUT_TOKENS = 320;

const VALID: readonly AiLabIntentKind[] = [
  'general',
  'music',
  'latest',
  'recommendation',
  'download',
  'faq',
] as const;

const CLASSIFIER_SYSTEM = `너는 NullRefer Music AI Lab Intent Classifier다.
JSON만 출력. 설명·마크다운 금지.

스키마:
{"intent":"general|music|latest|recommendation|download|faq","confidence":0.0~1.0,"needsWebSearch":bool,"needsVectorSearch":bool,"needsFaqSearch":bool,"needsDownloadTool":bool,"needsHistory":bool,"needsUserProfile":bool,"needsMusicSearch":bool,"reasoning":"짧은한글"}

규칙:
- latest(차트/오늘/이번주/최신/뉴스/순위) → needsWebSearch=true
- download(받아줘/넣어줘/다운로드/저장) → needsDownloadTool=true, needsWebSearch=false
- "찾아줘/검색해줘"(곡·아티스트) → needsMusicSearch=true (필요 시 needsDownloadTool도)
- recommendation(취향 추천) → needsVectorSearch=true, needsUserProfile=true, needsHistory=true
- faq(앱 사용/로그인/결제/오류) → needsFaqSearch=true
- music(아티스트 설명 등 정적 지식) → 플래그 대부분 false
- general → 기본 false
- needsDownloadTool과 needsWebSearch 동시 true 금지(다운로드 우선)
- "비틀즈가 누구야"=music; "이번주 멜론"=latest; "아이유 노래 넣어줘"=download; "아이유 좋은날 찾아줘"=needsMusicSearch`;

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
  }
  if (r.intent === 'recommendation') {
    needsVectorSearch = true;
    needsUserProfile = true;
    needsHistory = true;
  }
  if (r.intent === 'faq') needsFaqSearch = true;
  if (needsDownloadTool) needsWebSearch = false;
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
      needsMusicSearch: bool(obj.needsMusicSearch, false),
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

export function classifyIntentHeuristic(userMessage: string): IntentResult {
  const t = userMessage.trim();

  if (
    /다운로드|다운\s*받|받아\s*줘|받아줘|넣어\s*줘|넣어줘|저장해|mp3|flac|download/i.test(t)
  ) {
    return normalizeFlags({
      intent: 'download',
      confidence: 0.55,
      needsWebSearch: false,
      needsVectorSearch: false,
      needsFaqSearch: false,
      needsDownloadTool: true,
      needsHistory: false,
      needsUserProfile: false,
      needsMusicSearch: true,
      reasoning: 'download_keywords',
      source: 'heuristic_fallback',
    });
  }

  if (
    /찾아\s*줘|찾아줘|검색해|search|spotify에서\s*찾|스포티파이에서|멜론에서\s*찾|유튜브에서\s*찾/i
      .test(t)
  ) {
    return normalizeFlags({
      intent: 'download',
      confidence: 0.52,
      needsWebSearch: false,
      needsVectorSearch: false,
      needsFaqSearch: false,
      needsDownloadTool: true,
      needsHistory: false,
      needsUserProfile: false,
      needsMusicSearch: true,
      reasoning: 'music_search_keywords',
      source: 'heuristic_fallback',
    });
  }

  if (
    /오늘|이번\s*주|이번주|최신|최근|실시간|발매|뉴스|차트|순위|빌보드|멜론\s*차트|this\s*week|today|hot\s*100/i
      .test(t)
  ) {
    return normalizeFlags({
      intent: 'latest',
      confidence: 0.55,
      needsWebSearch: true,
      needsVectorSearch: false,
      needsFaqSearch: false,
      needsDownloadTool: false,
      needsHistory: false,
      needsUserProfile: false,
      needsMusicSearch: false,
      reasoning: 'freshness_keywords',
      source: 'heuristic_fallback',
    });
  }

  if (/추천|비슷|취향|좋아할\s*(노래|곡)|recommend|similar\s*to|for\s*me/i.test(t)) {
    return normalizeFlags({
      intent: 'recommendation',
      confidence: 0.5,
      needsWebSearch: false,
      needsVectorSearch: true,
      needsFaqSearch: false,
      needsDownloadTool: false,
      needsHistory: true,
      needsUserProfile: true,
      needsMusicSearch: false,
      reasoning: 'recommendation_keywords',
      source: 'heuristic_fallback',
    });
  }

  if (/앱\s*(사용|설정|오류)|로그인|결제|구독|사용법|how\s*to\s*use/i.test(t)) {
    return normalizeFlags({
      intent: 'faq',
      confidence: 0.5,
      needsWebSearch: false,
      needsVectorSearch: false,
      needsFaqSearch: true,
      needsDownloadTool: false,
      needsHistory: false,
      needsUserProfile: false,
      needsMusicSearch: false,
      reasoning: 'faq_keywords',
      source: 'heuristic_fallback',
    });
  }

  const music =
    /누구야|장르|앨범|가수|아티스트|멤버|band|artist|genre|album|비틀|bts|coldplay|아이유/i
      .test(t);
  return normalizeFlags({
    intent: music ? 'music' : 'general',
    confidence: 0.4,
    needsWebSearch: false,
    needsVectorSearch: false,
    needsFaqSearch: false,
    needsDownloadTool: false,
    needsHistory: false,
    needsUserProfile: false,
    needsMusicSearch: false,
    reasoning: music ? 'music_knowledge' : 'general',
    source: 'heuristic_fallback',
  });
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
      if (parsed) return parsed;
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
          temperature: 0.1,
          maxOutputTokens: INTENT_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(INTENT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(
        JSON.stringify({
          fn: 'llm-chat-send',
          event: 'intent_classifier_http_error',
          status: res.status,
          bodyPreview: errBody.slice(0, 300),
          api: 'generateContent',
        }),
      );
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
    return parseClassifierJson(text);
  } catch (e) {
    console.warn(
      JSON.stringify({
        fn: 'llm-chat-send',
        event: 'intent_classifier_exception',
        message: e instanceof Error ? e.message : String(e),
        api: 'generateContent',
      }),
    );
    return null;
  }
}

export async function analyzeUserIntent(params: {
  userMessage: string;
  isToolContinue: boolean;
  googleApiKey: string | null;
}): Promise<IntentResult> {
  if (params.isToolContinue) return toolContinueIntentResult();
  if (params.googleApiKey) {
    const classified = await classifyIntentWithLlm(params.googleApiKey, params.userMessage);
    if (classified) return classified;
  }
  return classifyIntentHeuristic(params.userMessage);
}
