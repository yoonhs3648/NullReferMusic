/**
 * Question / Semantic Cache — 인터페이스만.
 */

export type CacheLookup = {
  hit: boolean;
  key: string;
  answer?: string;
  // deno-lint-ignore no-explicit-any
  payload?: any;
};

export interface QuestionCache {
  get(key: string): Promise<CacheLookup> | CacheLookup;
  set(key: string, answer: string, ttlSec?: number): Promise<void> | void;
}

export interface SemanticCache {
  /** embedding 유사 질문 조회 — 미구현 */
  findSimilar(query: string, threshold?: number): Promise<CacheLookup> | CacheLookup;
  put(query: string, answer: string, embedding?: number[]): Promise<void> | void;
}

const noopQuestion: QuestionCache = {
  get: (key) => ({ hit: false, key }),
  set: () => undefined,
};

const noopSemantic: SemanticCache = {
  findSimilar: () => ({ hit: false, key: 'semantic:noop' }),
  put: () => undefined,
};

let questionCache: QuestionCache = noopQuestion;
let semanticCache: SemanticCache = noopSemantic;

export function registerQuestionCache(c: QuestionCache): void {
  questionCache = c;
}

export function registerSemanticCache(c: SemanticCache): void {
  semanticCache = c;
}

export function getQuestionCache(): QuestionCache {
  return questionCache;
}

export function getSemanticCache(): SemanticCache {
  return semanticCache;
}

export function cacheKeyForQuestion(serialNo: string, modelId: number, message: string): string {
  const norm = message.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 500);
  return `q:${serialNo}:${modelId}:${norm}`;
}
