/**
 * ContextProvider Registry — parallel / latency / cost.
 */

import type { ContextResult, IntentResult, RecommendationContext } from '../types.ts';

export type ContextRequest = {
  serialNo: string;
  userMessage: string;
  intent: IntentResult;
  preferLowLatency?: boolean;
  // deno-lint-ignore no-explicit-any
  supabase?: any;
  googleApiKey?: string | null;
  signal?: AbortSignal;
};

export interface ContextProvider {
  id: string;
  enabled: boolean;
  defaultPriority: number;
  cost: number;
  estimatedCost: number;
  estimatedLatencyMs: number;
  supportsParallelExecution: boolean;
  supports(intent: IntentResult): boolean;
  execute(request: ContextRequest): Promise<ContextResult | ContextResult[] | null>;
}

const providers = new Map<string, ContextProvider>();

export function registerContextProvider(provider: ContextProvider): void {
  providers.set(provider.id, provider);
}

export function listContextProviders(): ContextProvider[] {
  return [...providers.values()].sort((a, b) => a.defaultPriority - b.defaultPriority);
}

export function getContextProvider(id: string): ContextProvider | undefined {
  return providers.get(id);
}

export async function collectContexts(request: ContextRequest): Promise<{
  results: ContextResult[];
  timings: Record<string, number>;
}> {
  const eligible = listContextProviders().filter(
    (p) => p.enabled && p.supports(request.intent),
  );

  const filtered = request.preferLowLatency
    ? eligible.filter((p) => p.estimatedLatencyMs < 200 && p.estimatedCost < 15)
    : eligible;

  const parallel = filtered.filter((p) => p.supportsParallelExecution);
  const serial = filtered.filter((p) => !p.supportsParallelExecution);

  const results: ContextResult[] = [];
  const timings: Record<string, number> = {};

  const runOne = async (p: ContextProvider) => {
    if (request.signal?.aborted) return;
    const t0 = Date.now();
    try {
      const out = await p.execute(request);
      timings[p.id] = Date.now() - t0;
      if (!out) return;
      const list = Array.isArray(out) ? out : [out];
      for (const row of list) {
        results.push({
          ...row,
          cost: row.cost ?? p.cost,
          estimatedCost: row.estimatedCost ?? p.estimatedCost,
          estimatedLatencyMs: row.estimatedLatencyMs ?? p.estimatedLatencyMs,
        });
      }
    } catch (e) {
      timings[p.id] = Date.now() - t0;
      console.warn(
        JSON.stringify({
          fn: 'llm-chat-send',
          event: 'context_provider_failed',
          provider: p.id,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  await Promise.all(parallel.map(runOne));
  for (const p of serial) {
    await runOne(p);
  }

  results.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
  return { results, timings };
}

export function contextsToCombinedBlock(contexts: ContextResult[]): string {
  return contexts
    .filter((c) => c.content.trim().length > 0)
    .map(
      (c) =>
        `[${c.provider} priority=${c.priority} cost=${c.cost}]\n${c.content.trim()}`,
    )
    .join('\n\n');
}

export function emptyRecommendationContext(): RecommendationContext {
  return {
    recentTracks: [],
    favoriteArtists: [],
    favoriteGenres: [],
    listeningPatterns: undefined,
  };
}
