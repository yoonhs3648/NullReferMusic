/**
 * ContextMerger — 여러 ContextResult 중복 제거·우선순위 통합.
 */

import type { ContextResult } from '../types.ts';

export type MergedContext = {
  contexts: ContextResult[];
  combinedBlock: string;
  droppedDuplicates: number;
};

function fingerprint(c: ContextResult): string {
  const body = c.content.trim().replace(/\s+/g, ' ').slice(0, 400);
  if (body) return `${c.provider}::${body}`;
  const meta = c.metadata ? JSON.stringify(c.metadata) : '';
  return `${c.provider}::meta:${meta.slice(0, 200)}`;
}

export function mergeContexts(inputs: ContextResult[]): MergedContext {
  const sorted = [...inputs].sort(
    (a, b) => a.priority - b.priority || (a.cost ?? 1) - (b.cost ?? 1),
  );
  const seen = new Set<string>();
  const out: ContextResult[] = [];
  let dropped = 0;
  for (const c of sorted) {
    const fp = fingerprint(c);
    if (seen.has(fp)) {
      dropped += 1;
      continue;
    }
    seen.add(fp);
    out.push(c);
  }
  const combinedBlock = out
    .filter((c) => c.content.trim().length > 0)
    .map(
      (c) =>
        `[${c.provider} p=${c.priority} cost=${c.cost} lat=${c.estimatedLatencyMs ?? '?'}]\n${c.content.trim()}`,
    )
    .join('\n\n');
  return { contexts: out, combinedBlock, droppedDuplicates: dropped };
}
