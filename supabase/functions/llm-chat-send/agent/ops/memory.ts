/**
 * Memory — Short/Long/Summary/Preference 확장 포인트.
 * 현재 History는 prepare_turn; Summary Provider만 스텁.
 */

export type MemorySummary = {
  sessionId: number;
  summaryText: string;
  updatedAt?: string;
};

export interface SummaryMemoryProvider {
  get(sessionId: number): Promise<MemorySummary | null> | MemorySummary | null;
  upsert(sessionId: number, summaryText: string): Promise<void> | void;
}

const noop: SummaryMemoryProvider = {
  get: () => null,
  upsert: () => undefined,
};

let summaryProvider: SummaryMemoryProvider = noop;

export function registerSummaryMemoryProvider(p: SummaryMemoryProvider): void {
  summaryProvider = p;
}

export function getSummaryMemoryProvider(): SummaryMemoryProvider {
  return summaryProvider;
}
