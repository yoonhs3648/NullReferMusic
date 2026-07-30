/**
 * Feature Flags — 운영 중 RAG/Summary/Recommendation 등 on/off.
 * 점진 배포: FeatureFlagDef.rolloutPercent (0~100).
 */

export type FeatureFlags = {
  rag: boolean;
  summary: boolean;
  recommendation: boolean;
  reasoning: boolean;
  webSearch: boolean;
  evaluation: boolean;
  questionCache: boolean;
  semanticCache: boolean;
  inputGuard: boolean;
  outputGuard: boolean;
  /**
   * Google Gemini: true → Interactions API(`/v1beta/interactions`),
   * false → Legacy generateContent/streamGenerateContent.
   * env `GEMINI_API_MODE` / `GEMINI_USE_INTERACTIONS_API`가 있으면 그쪽이 우선.
   */
  geminiInteractionsApi: boolean;
};

/** 점진 롤아웃용 정의(원격 Config/DB 매핑) */
export type FeatureFlagDef = {
  name: keyof FeatureFlags;
  enabled: boolean;
  /** 0=전원 off( enabled 무시), 100=전원 on. enabled=false 면 항상 off */
  rolloutPercent: number;
  expiresAt?: string | null;
  /** 담당자 — 예: admin, ailab */
  owner?: string;
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  rag: false,
  summary: false,
  recommendation: true,
  reasoning: false,
  webSearch: false,
  evaluation: true,
  questionCache: false,
  semanticCache: false,
  inputGuard: true,
  outputGuard: true,
  geminiInteractionsApi: true,
};

export interface FeatureFlagProvider {
  getFlags(serialNo: string): Promise<FeatureFlags> | FeatureFlags;
  /** 선택: 정의 기반 롤아웃 */
  getDefs?(serialNo: string): Promise<FeatureFlagDef[]> | FeatureFlagDef[];
}

/** serialNo 해시 → 0..99 — 동일 유저는 같은 버킷 */
export function rolloutBucket(serialNo: string): number {
  let h = 0;
  const s = String(serialNo || 'anon');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

export function applyFlagDefs(
  base: FeatureFlags,
  defs: FeatureFlagDef[],
  serialNo: string,
  now = Date.now(),
): FeatureFlags {
  const out = { ...base };
  const bucket = rolloutBucket(serialNo);
  for (const d of defs) {
    if (d.expiresAt) {
      const exp = Date.parse(d.expiresAt);
      if (Number.isFinite(exp) && now > exp) {
        out[d.name] = false;
        continue;
      }
    }
    if (!d.enabled) {
      out[d.name] = false;
      continue;
    }
    const pct = Math.max(0, Math.min(100, Math.floor(d.rolloutPercent)));
    out[d.name] = bucket < pct;
  }
  return out;
}

let flagProvider: FeatureFlagProvider = {
  getFlags: () => DEFAULT_FEATURE_FLAGS,
};

export function registerFeatureFlagProvider(p: FeatureFlagProvider): void {
  flagProvider = p;
}

export async function resolveFeatureFlags(serialNo: string): Promise<FeatureFlags> {
  const base = await flagProvider.getFlags(serialNo);
  if (flagProvider.getDefs) {
    const defs = await flagProvider.getDefs(serialNo);
    return applyFlagDefs(base, defs, serialNo);
  }
  return base;
}
