/**
 * ReRankProvider — Vector TopK 후 재순위.
 * IdentityReRank → CrossEncoder / Cohere / Jina 동일 계약.
 */

export type ReRankCandidate = {
  id: string;
  text: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type ReRankResult = {
  candidates: ReRankCandidate[];
  strategy: string;
};

export interface ReRankProvider {
  id: string;
  rerank(
    query: string,
    candidates: ReRankCandidate[],
    topK: number,
  ): Promise<ReRankResult> | ReRankResult;
}

/** 기본: 점수 유지한 채 TopK slice */
export const IdentityReRank: ReRankProvider = {
  id: 'identity',
  rerank(_query, candidates, topK) {
    return {
      candidates: candidates.slice(0, Math.max(1, topK)),
      strategy: 'identity',
    };
  },
};

let active: ReRankProvider = IdentityReRank;

export function registerReRankProvider(p: ReRankProvider): void {
  active = p;
}

export function getReRankProvider(): ReRankProvider {
  return active;
}

export async function rerankContext(
  query: string,
  candidates: ReRankCandidate[],
  topK = 5,
): Promise<ReRankResult> {
  return await active.rerank(query, candidates, topK);
}

/** @deprecated 이름 호환 */
export type RerankCandidate = ReRankCandidate;
export type RerankResult = ReRankResult;
export type ContextReranker = ReRankProvider;
export const registerContextReranker = registerReRankProvider;
export const getContextReranker = getReRankProvider;
