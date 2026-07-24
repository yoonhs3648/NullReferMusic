/**
 * VectorSearch — 내일 RAG용 계약. 오늘은 빈 배열.
 */

export type VectorSearchResult = {
  id: string;
  score: number;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type VectorSearchQuery = {
  q: string;
  topK?: number;
  filter?: Record<string, unknown>;
};

export interface VectorSearchProvider {
  id: string;
  search(query: VectorSearchQuery): Promise<VectorSearchResult[]>;
}

const emptyProvider: VectorSearchProvider = {
  id: 'noop',
  async search() {
    return [];
  },
};

let active: VectorSearchProvider = emptyProvider;

export function registerVectorSearchProvider(p: VectorSearchProvider): void {
  active = p;
}

export function getVectorSearchProvider(): VectorSearchProvider {
  return active;
}

export async function searchVector(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
  return await active.search(query);
}
