/**
 * Metrics helpers — answerLength / toolCalls / tokens 등.
 */

import type { AgentResponse } from '../contract/types.ts';

export type AgentMetrics = {
  answerLength: number;
  toolCalls: number;
  contextTokens: number;
  searchTokens: number;
  reasoningTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  searchUsed: boolean;
  ragUsed: boolean;
};

export function metricsFromAgentResponse(r: AgentResponse): AgentMetrics {
  return {
    answerLength: r.evaluation.answerLength ?? r.answer.length,
    toolCalls: r.toolCalls.length,
    contextTokens: r.tokenUsage.contextTokens ?? 0,
    searchTokens: r.tokenUsage.searchTokens ?? 0,
    reasoningTokens: 0,
    inputTokens: r.tokenUsage.inputTokens,
    outputTokens: r.tokenUsage.outputTokens,
    totalTokens: r.tokenUsage.totalTokens,
    latencyMs: r.evaluation.latencyMs,
    searchUsed: r.searchUsed,
    ragUsed: r.ragUsed,
  };
}
