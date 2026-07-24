/**
 * Intent → DAG ExecutionGraph.
 * recommendation 등은 History∥FAQ → Vector → Recommend → Merge → LLM.
 */

import type { IntentResult, ToolDefinition } from '../types.ts';
import { dagGraph, linearGraph, type ExecutionGraph } from './types.ts';

export function buildExecutionGraph(params: {
  intent: IntentResult;
  tools: ToolDefinition[];
  isToolContinue: boolean;
}): ExecutionGraph {
  const { intent, tools, isToolContinue } = params;
  const downloadTools = tools.filter((t) => t.kind === 'download_fc').map((t) => t.id);
  const hasGrounding = tools.some((t) => t.kind === 'native_grounding');

  if (isToolContinue || intent.needsDownloadTool || downloadTools.length > 0) {
    return linearGraph([
      { type: 'tools', toolIds: downloadTools, parallel: false, retry: 0 },
      { type: 'llm', timeoutMs: 45_000, retry: 0, parallel: false },
      { type: 'end', parallel: false },
    ]);
  }

  if (intent.intent === 'latest' || intent.needsWebSearch || hasGrounding) {
    // FAQ∥History(optional) → Search(serial) → Merge → LLM
    return dagGraph(
      [
        { id: 'faq', type: 'context', ref: 'faq', parallel: true, timeoutMs: 5_000 },
        { id: 'hist', type: 'context', ref: 'user_music_history', parallel: true, timeoutMs: 5_000 },
        { id: 'search', type: 'native_search', parallel: false, timeoutMs: 30_000, retry: 2 },
        { id: 'merge', type: 'merge_context', parallel: false },
        { id: 'llm', type: 'llm', timeoutMs: 30_000, retry: 1, parallel: false },
        { id: 'end', type: 'end', parallel: false },
      ],
      [
        { from: 'faq', to: 'search' },
        { from: 'hist', to: 'search' },
        { from: 'search', to: 'merge' },
        { from: 'merge', to: 'llm' },
        { from: 'llm', to: 'end' },
      ],
      'faq',
    );
  }

  if (intent.intent === 'recommendation') {
    /*
            hist ----\
                      \
            faq -------+--> vector --> recommend --> merge --> llm --> end
     */
    return dagGraph(
      [
        { id: 'hist', type: 'context', ref: 'user_music_history', parallel: true },
        { id: 'faq', type: 'context', ref: 'faq', parallel: true },
        { id: 'vector', type: 'context', ref: 'vector', parallel: false, timeoutMs: 8_000 },
        { id: 'rec', type: 'recommend', ref: 'similarity', parallel: false },
        { id: 'merge', type: 'merge_context', parallel: false },
        { id: 'llm', type: 'llm', timeoutMs: 25_000, retry: 0, parallel: false },
        { id: 'end', type: 'end', parallel: false },
      ],
      [
        { from: 'hist', to: 'vector' },
        { from: 'faq', to: 'vector' },
        { from: 'vector', to: 'rec' },
        { from: 'rec', to: 'merge' },
        { from: 'merge', to: 'llm' },
        { from: 'llm', to: 'end' },
      ],
      'hist',
    );
  }

  if (intent.intent === 'faq' || intent.needsFaqSearch) {
    return linearGraph([
      { type: 'context', ref: 'faq', parallel: true, retry: 0 },
      { type: 'merge_context', parallel: false },
      { type: 'llm', timeoutMs: 20_000, retry: 0 },
      { type: 'end' },
    ]);
  }

  return linearGraph([
    { type: 'llm', timeoutMs: 22_000, retry: 0 },
    { type: 'end' },
  ]);
}

export function planRuntimeFromGraph(graph: ExecutionGraph): {
  timeoutMs: number;
  retry: number;
} {
  let timeoutMs = 22_000;
  let retry = 0;
  for (const n of graph.nodes) {
    if (typeof n.timeoutMs === 'number') timeoutMs = Math.max(timeoutMs, n.timeoutMs);
    if (typeof n.retry === 'number') retry = Math.max(retry, n.retry);
  }
  return { timeoutMs, retry };
}
