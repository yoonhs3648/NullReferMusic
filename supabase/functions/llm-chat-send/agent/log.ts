/**
 * Agent 단계별 구조화 로그 (traceId + timing).
 */

import type { AgentPlan, AgentState } from './types.ts';

export function logAgentPhase(
  traceOrRequestId: string,
  event: string,
  data: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      fn: 'llm-chat-send',
      event,
      traceId: data.traceId ?? traceOrRequestId,
      requestId: data.requestId ?? traceOrRequestId,
      ts: new Date().toISOString(),
      ...data,
    }),
  );
}

export function logAgentStateSnapshot(requestId: string, state: AgentState): void {
  logAgentPhase(state.traceId, 'agent_state', {
    traceId: state.traceId,
    requestId,
    serialNo: state.serialNo,
    isToolContinue: state.isToolContinue,
    intent: state.intent,
    contextProviders: state.contexts.map((c) => ({
      provider: c.provider,
      priority: c.priority,
      cost: c.cost,
      confidence: c.confidence,
      contentChars: c.content.length,
    })),
    tools: state.tools.map((t) => t.name),
    provider: state.provider
      ? {
          providerName: state.provider.providerName,
          modelName: state.provider.modelName,
          selectedBy: state.provider.selectedBy,
        }
      : null,
    retries: state.retries,
    timings: state.timings,
    errors: state.errors,
  });
}

export function logAgentPlanSummary(requestId: string, plan: AgentPlan): void {
  logAgentPhase(plan.traceId, 'agent_plan', {
    traceId: plan.traceId,
    requestId,
    intent: plan.intent.intent,
    confidence: plan.intent.confidence,
    flags: {
      needsWebSearch: plan.intent.needsWebSearch,
      needsVectorSearch: plan.intent.needsVectorSearch,
      needsFaqSearch: plan.intent.needsFaqSearch,
      needsDownloadTool: plan.intent.needsDownloadTool,
      needsHistory: plan.intent.needsHistory,
      needsUserProfile: plan.intent.needsUserProfile,
      needsMusicSearch: plan.intent.needsMusicSearch,
    },
    source: plan.intent.source,
    toolMode: plan.toolMode,
    tools: plan.tools.map((t) => ({ id: t.id, kind: t.kind })),
    contexts: plan.contexts.map((c) => ({ id: c.provider, cost: c.cost })),
    graph: {
      entry: plan.graph.entry,
      nodes: plan.graph.nodes.map((n) => ({ id: n.id, type: n.type, ref: n.ref ?? null })),
    },
    retry: plan.retry,
    timeoutMs: plan.timeoutMs,
    maxContextTokens: plan.maxContextTokens,
    promptSections: plan.promptSections.map((s) => ({
      id: s.id,
      required: s.required,
      priority: s.priority,
    })),
    systemPromptChars: plan.systemPrompt.length,
    model: plan.model,
    temperature: plan.temperature,
    historyBudgetTurns: plan.historyBudgetTurns,
    providerSelectedBy: plan.provider.selectedBy,
  });
}

export function logAgentTimings(traceId: string, timings: AgentState['timings'], extra?: Record<string, unknown>): void {
  logAgentPhase(traceId, 'agent_timings', {
    traceId,
    intentMs: timings.intentMs ?? null,
    plannerMs: timings.plannerMs ?? null,
    contextMs: timings.contextMs ?? null,
    faqMs: timings.faqMs ?? null,
    vectorMs: timings.vectorMs ?? null,
    searchMs: timings.searchMs ?? null,
    mergeMs: timings.mergeMs ?? null,
    promptMs: timings.promptMs ?? null,
    llmMs: timings.llmMs ?? null,
    waveMs: timings.waveMs ?? null,
    graphNodeMs: timings.graphNodeMs ?? null,
    totalPlanMs: timings.totalPlanMs ?? null,
    ...extra,
  });
}
