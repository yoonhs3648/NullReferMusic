/**
 * RecommendationStrategy — 구현 없이 인터페이스만.
 * Popularity / Similarity / Mood … 를 등록만으로 교체.
 */

import type { RecommendationContext } from '../types.ts';
import type { MusicTrackHit } from '../music/metadataProvider.ts';

export type RecommendationStrategyId =
  | 'popularity'
  | 'similarity'
  | 'recent'
  | 'mood'
  | 'artist'
  | 'genre'
  | 'release'
  | 'collaborative_filtering';

export type RecommendationRequest = {
  serialNo: string;
  userMessage: string;
  profile: RecommendationContext;
  limit?: number;
};

export type RecommendationResult = {
  strategy: RecommendationStrategyId | string;
  tracks: MusicTrackHit[];
  confidence: number;
  reasoning?: string;
};

export interface RecommendationStrategy {
  id: RecommendationStrategyId | string;
  enabled: boolean;
  supports(req: RecommendationRequest): boolean;
  recommend(req: RecommendationRequest): Promise<RecommendationResult>;
}

const strategies = new Map<string, RecommendationStrategy>();

export function registerRecommendationStrategy(s: RecommendationStrategy): void {
  strategies.set(s.id, s);
}

export function listRecommendationStrategies(): RecommendationStrategy[] {
  return [...strategies.values()].filter((s) => s.enabled);
}

export function getRecommendationStrategy(id: string): RecommendationStrategy | undefined {
  return strategies.get(id);
}

/** 스텁 전략 — 항상 빈 결과 (인터페이스 검증용) */
registerRecommendationStrategy({
  id: 'similarity',
  enabled: true,
  supports: () => true,
  async recommend(req) {
    return {
      strategy: 'similarity',
      tracks: [],
      confidence: 0,
      reasoning: 'stub_not_implemented',
      // profile 참조만 유지
      ...(req.profile ? {} : {}),
    };
  },
});
