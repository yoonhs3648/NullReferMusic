/**
 * Token Budget — 버킷 + 미사용 Search 토큰을 History에 양보(Dynamic).
 */

import type { ContextResult } from '../types.ts';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type TokenBuckets = {
  system: number;
  history: number;
  faq: number;
  vector: number;
  search: number;
  user: number;
};

export const DEFAULT_TOKEN_BUCKETS: TokenBuckets = {
  system: 1500,
  history: 4000,
  faq: 1500,
  search: 3000,
  vector: 2500,
  user: 2000,
};

export type TokenBudgetPlan = {
  maxInputTokens: number;
  reservedForOutput: number;
  buckets: TokenBuckets;
  maxContextCost: number;
  maxContextLatencyMs?: number;
};

const DEFAULT_BUDGET: TokenBudgetPlan = {
  maxInputTokens: 24_000,
  reservedForOutput: 4_096,
  buckets: DEFAULT_TOKEN_BUCKETS,
  maxContextCost: 40,
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

function bucketForProvider(providerId: string): keyof TokenBuckets | null {
  if (providerId === 'faq') return 'faq';
  if (providerId === 'vector' || providerId === 'recommendation_profile') return 'vector';
  if (providerId === 'web_search') return 'search';
  if (providerId === 'user_music_history') return 'history';
  return null;
}

export function packHistoryAndContexts(params: {
  history: ChatTurn[];
  contexts: ContextResult[];
  userMessage: string;
  systemPromptEstimate?: number;
  budget?: Partial<TokenBudgetPlan> & { buckets?: Partial<TokenBuckets> };
  maxTurns?: number;
  /** Search 컨텍스트가 없으면 search 버킷을 history에 양보 */
  redistributeUnusedSearch?: boolean;
}): {
  history: ChatTurn[];
  contexts: ContextResult[];
  historyTurnsUsed: number;
  tokensUsedEstimate: number;
  bucketsUsed: Partial<Record<keyof TokenBuckets, number>>;
  contextCostUsed: number;
  buckets: TokenBuckets;
} {
  const buckets: TokenBuckets = {
    ...DEFAULT_TOKEN_BUCKETS,
    ...params.budget?.buckets,
  };
  const budget: TokenBudgetPlan = {
    ...DEFAULT_BUDGET,
    ...params.budget,
    buckets,
  };

  const hasSearch = params.contexts.some(
    (c) => c.provider === 'web_search' && (c.content.trim() || c.metadata),
  );
  if (params.redistributeUnusedSearch !== false && !hasSearch) {
    buckets.history += buckets.search;
    buckets.search = 0;
  }

  const maxTurns = params.maxTurns ?? 15;
  const bucketsUsed: Partial<Record<keyof TokenBuckets, number>> = {};
  let used = 0;

  const sysEst = params.systemPromptEstimate ?? 0;
  const sysTake = Math.min(sysEst, buckets.system);
  bucketsUsed.system = sysTake;
  used += sysTake;

  const userTok = Math.min(estimateTokens(params.userMessage), buckets.user);
  bucketsUsed.user = userTok;
  used += userTok;

  let candidates = [...params.contexts];
  if (budget.maxContextLatencyMs != null) {
    candidates = candidates.filter(
      (c) => (c.estimatedLatencyMs ?? 0) <= budget.maxContextLatencyMs!,
    );
  }

  candidates.sort(
    (a, b) =>
      (a.estimatedCost ?? a.cost ?? 1) - (b.estimatedCost ?? b.cost ?? 1) ||
      a.priority - b.priority,
  );

  let contextCostUsed = 0;
  const packedContexts: ContextResult[] = [];
  for (const c of candidates) {
    const cost = c.estimatedCost ?? c.cost ?? 1;
    if (contextCostUsed + cost > budget.maxContextCost) continue;

    const piece = c.content.trim();
    const metaOnly = !piece && c.metadata && Object.keys(c.metadata).length > 0;
    if (!piece && !metaOnly) {
      packedContexts.push(c);
      contextCostUsed += cost;
      continue;
    }

    const tok = estimateTokens(piece || JSON.stringify(c.metadata ?? {}));
    const bucket = bucketForProvider(c.provider);
    if (bucket) {
      const usedInBucket = bucketsUsed[bucket] ?? 0;
      if (usedInBucket + tok > buckets[bucket]) continue;
      bucketsUsed[bucket] = usedInBucket + tok;
    }
    if (used + tok > budget.maxInputTokens - budget.reservedForOutput) continue;
    packedContexts.push(c);
    contextCostUsed += cost;
    used += tok;
  }
  packedContexts.sort((a, b) => a.priority - b.priority);

  const recent = params.history.slice(-maxTurns);
  const keptRev: ChatTurn[] = [];
  let histTok = bucketsUsed.history ?? 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const turn = recent[i]!;
    const cost = estimateTokens(turn.content);
    if (histTok + cost > buckets.history) break;
    if (used + cost > budget.maxInputTokens - budget.reservedForOutput) break;
    keptRev.push(turn);
    histTok += cost;
    used += cost;
  }
  bucketsUsed.history = histTok;

  return {
    history: keptRev.reverse(),
    contexts: packedContexts,
    historyTurnsUsed: keptRev.length,
    tokensUsedEstimate: used,
    bucketsUsed,
    contextCostUsed,
    buckets,
  };
}
