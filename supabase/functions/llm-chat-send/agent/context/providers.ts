/**
 * 기본 Context Providers (cost / latency / parallel).
 */

import type { ContextResult, IntentResult } from '../types.ts';
import { formatFaqHitsForPrompt, matchFaqHits } from './faqData.ts';
import {
  emptyRecommendationContext,
  registerContextProvider,
  type ContextRequest,
} from './registry.ts';
import { getReRankProvider } from './rerank.ts';
import { searchVector } from './vectorSearch.ts';

function baseResult(
  provider: string,
  priority: number,
  cost: number,
  latencyMs: number,
  content: string,
  confidence: number,
  metadata?: Record<string, unknown>,
): ContextResult {
  return {
    provider,
    priority,
    cost,
    estimatedCost: cost,
    estimatedLatencyMs: latencyMs,
    confidence,
    content,
    metadata,
  };
}

registerContextProvider({
  id: 'faq',
  enabled: true,
  defaultPriority: 10,
  cost: 1,
  estimatedCost: 1,
  estimatedLatencyMs: 5,
  supportsParallelExecution: true,
  supports: (intent: IntentResult) => intent.needsFaqSearch || intent.intent === 'faq',
  async execute(req: ContextRequest) {
    const hits = matchFaqHits(req.userMessage, 3);
    const content = formatFaqHitsForPrompt(hits);
    const confidence = hits.length > 0 ? Math.min(1, 0.4 + hits[0]!.score * 0.15) : 0;
    return baseResult('faq', 10, 1, 5, content, confidence, {
      hitCount: hits.length,
      hitIds: hits.map((h) => h.id),
      status: hits.length > 0 ? 'matched' : 'no_hit',
    });
  },
});

registerContextProvider({
  id: 'vector',
  enabled: true,
  defaultPriority: 20,
  cost: 5,
  estimatedCost: 5,
  estimatedLatencyMs: 60,
  supportsParallelExecution: true,
  supports: (intent: IntentResult) =>
    intent.needsVectorSearch || intent.intent === 'recommendation',
  async execute(req: ContextRequest) {
    const raw = await searchVector({ q: req.userMessage, topK: 5 });
    const ranked = await getReRankProvider().rerank(
      req.userMessage,
      raw.map((r) => ({
        id: r.id,
        text: r.content,
        score: r.score,
        metadata: { title: r.title, ...(r.metadata ?? {}) },
      })),
      5,
    );
    const content = ranked.candidates
      .map((c, i) => `VECTOR_HIT_${i + 1} id=${c.id}\n${c.text}`)
      .join('\n\n');
    return baseResult('vector', 20, 5, 60, content, ranked.candidates[0]?.score ?? 0, {
      hitCount: ranked.candidates.length,
      strategy: ranked.strategy,
      status: ranked.candidates.length > 0 ? 'matched' : 'empty',
    });
  },
});

registerContextProvider({
  id: 'user_music_history',
  enabled: true,
  defaultPriority: 30,
  cost: 1,
  estimatedCost: 1,
  estimatedLatencyMs: 3,
  supportsParallelExecution: true,
  supports: (intent: IntentResult) =>
    intent.needsUserProfile ||
    intent.needsHistory ||
    intent.intent === 'recommendation' ||
    intent.intent === 'latest',
  async execute(_req: ContextRequest) {
    return baseResult('user_music_history', 30, 1, 3, '', 0, {
      stub: true,
      recommendationShape: emptyRecommendationContext(),
    });
  },
});

registerContextProvider({
  id: 'web_search',
  enabled: true,
  defaultPriority: 40,
  cost: 20,
  estimatedCost: 20,
  estimatedLatencyMs: 900,
  supportsParallelExecution: false,
  supports: (intent: IntentResult) => intent.needsWebSearch || intent.intent === 'latest',
  async execute(req: ContextRequest) {
    return baseResult('web_search', 40, 20, 900, '', req.intent.confidence, {
      mode: 'native_grounding_preferred',
      queryHint: req.userMessage.slice(0, 200),
      stubExternalSearch: true,
    });
  },
});

registerContextProvider({
  id: 'recommendation_profile',
  enabled: true,
  defaultPriority: 25,
  cost: 2,
  estimatedCost: 2,
  estimatedLatencyMs: 10,
  supportsParallelExecution: true,
  supports: (intent: IntentResult) => intent.intent === 'recommendation',
  async execute(_req: ContextRequest) {
    return baseResult('recommendation_profile', 25, 2, 10, '', 0, {
      stub: true,
      profile: emptyRecommendationContext(),
    });
  },
});
