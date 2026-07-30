/**
 * Gemini API 모드 Feature Flag.
 *
 * 기본: Interactions API (`/v1beta/interactions`) — 공식 문서 권장.
 * Legacy: generateContent / streamGenerateContent — 비교 테스트용 유지.
 *
 * 우선순위:
 * 1) Deno.env `GEMINI_API_MODE` = interactions | legacy
 * 2) Deno.env `GEMINI_USE_INTERACTIONS_API` = 0|false|legacy → legacy, 그 외 interactions
 * 3) 요청 스코프 override (`setGeminiInteractionsApiOverride`) — FeatureFlags.geminiInteractionsApi
 * 4) 인자 featureFlagEnabled (기본 true)
 */

export type GeminiApiMode = 'interactions' | 'legacy';

/** 요청 단위 FeatureFlags 반영용 (Edge 요청 스코프) */
let requestFlagOverride: boolean | null = null;

export function setGeminiInteractionsApiOverride(enabled: boolean | null): void {
  requestFlagOverride = enabled;
}

export function resolveGeminiApiModeFromEnv(): GeminiApiMode | null {
  try {
    const mode = String(Deno.env.get('GEMINI_API_MODE') ?? '').trim().toLowerCase();
    if (mode === 'interactions' || mode === 'interaction' || mode === 'ia') {
      return 'interactions';
    }
    if (mode === 'legacy' || mode === 'generatecontent' || mode === 'generate_content') {
      return 'legacy';
    }
    const flag = String(Deno.env.get('GEMINI_USE_INTERACTIONS_API') ?? '').trim().toLowerCase();
    if (!flag) return null;
    if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'legacy' || flag === 'off') {
      return 'legacy';
    }
    return 'interactions';
  } catch {
    return null;
  }
}

/** FeatureFlags + env 합성. env가 있으면 플래그보다 우선. */
export function resolveGeminiApiMode(featureFlagEnabled = true): GeminiApiMode {
  const fromEnv = resolveGeminiApiModeFromEnv();
  if (fromEnv) return fromEnv;
  const flag =
    requestFlagOverride != null ? requestFlagOverride : featureFlagEnabled;
  return flag ? 'interactions' : 'legacy';
}

export function shouldUseGeminiInteractionsApi(featureFlagEnabled = true): boolean {
  return resolveGeminiApiMode(featureFlagEnabled) === 'interactions';
}
