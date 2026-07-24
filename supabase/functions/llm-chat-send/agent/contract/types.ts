/**
 * Agent SDK 계약 — 문자열만 반환하지 않는다.
 */

import { estimateTokens } from '../budget/tokenBudget.ts';
import type { AgentPlan, AgentState, AgentTimings, IntentResult, TokenUsageBreakdown } from '../types.ts';
import type { NormalizedToolCall } from '../providers/normalize.ts';
import type { FeatureFlags } from '../ops/featureFlags.ts';

export type AgentRequest = {
  traceId: string;
  requestId: string;
  serialNo: string;
  userMessage: string;
  sessionId: number | null;
  modelId: number;
  isToolContinue: boolean;
  promptVersion: string;
  experimentId?: string | null;
  featureFlags: FeatureFlags;
  locale?: string;
};

export type AgentCitation = {
  title?: string;
  uri?: string;
  snippet?: string;
};

export type AgentEvaluationSnapshot = {
  answerScore?: number | null;
  confidence?: number | null;
  hallucinationRisk?: number | null;
  toolSuccess?: boolean | null;
  answerLength: number;
  latencyMs: number;
  toolCount: number;
  contextCount: number;
  searchUsed: boolean;
  ragUsed: boolean;
  recommendationUsed: boolean;
};

export type AgentUiBadge = {
  id: string;
  label: string;
  icon?: string;
};

export type AgentUiAction = {
  id: string;
  label: string;
  kind?: 'download' | 'retry' | 'open' | 'other';
};

export type AgentUiWarning = {
  id: string;
  message: string;
};

/** badges / actions / warnings — UI 확장용 */
export type AgentResponseUi = {
  badges: AgentUiBadge[];
  actions: AgentUiAction[];
  warnings: AgentUiWarning[];
  /** 하위 호환 힌트 */
  providerLabel?: string;
  latencyMs?: number;
};

export type PromptDiagnostics = {
  systemPromptTokens: number;
  historyTokens: number;
  faqTokens: number;
  searchTokens: number;
  vectorTokens: number;
  userTokens: number;
  totalEstimatedTokens: number;
};

export type ContextDiagnosticRow = {
  provider: string;
  tokens: number;
  latencyMs: number | null;
  confidence: number;
  hitCount?: number;
};

export type ContextDiagnostics = {
  contexts: ContextDiagnosticRow[];
};

export type AgentResponse = {
  ok: boolean;
  traceId: string;
  requestId: string;
  answer: string;
  role: 'assistant' | 'system';
  toolCalls: NormalizedToolCall[];
  citations: AgentCitation[];
  timings: AgentTimings;
  tokenUsage: TokenUsageBreakdown;
  contextUsed: Array<{ provider: string; priority: number; cost: number }>;
  provider: {
    providerName: string;
    modelName: string;
    selectedBy: 'user' | 'planner';
  };
  promptVersion: string;
  experimentId?: string | null;
  featureFlags: FeatureFlags;
  intent: IntentResult | null;
  searchUsed: boolean;
  ragUsed: boolean;
  recommendationUsed: boolean;
  musicSearchUsed: boolean;
  evaluation: AgentEvaluationSnapshot;
  ui: AgentResponseUi;
  promptDiagnostics: PromptDiagnostics;
  contextDiagnostics: ContextDiagnostics;
  error?: { kind: string; message: string };
  // deno-lint-ignore no-explicit-any
  raw?: any;
};

export function buildAgentRequest(partial: Omit<AgentRequest, 'featureFlags'> & {
  featureFlags?: FeatureFlags;
}): AgentRequest {
  return {
    ...partial,
    featureFlags: partial.featureFlags ?? {
      rag: false,
      summary: false,
      recommendation: true,
      reasoning: false,
      webSearch: true,
      evaluation: true,
      questionCache: false,
      semanticCache: false,
      inputGuard: true,
      outputGuard: true,
    },
    promptVersion: partial.promptVersion || 'music-1.0.0',
    experimentId: partial.experimentId ?? null,
  };
}

function buildUi(params: {
  searchUsed: boolean;
  musicSearchUsed: boolean;
  ragUsed: boolean;
  recommendationUsed: boolean;
  citations: AgentCitation[];
  reasoning: boolean;
  providerLabel: string;
  latencyMs: number;
  answerOk: boolean;
  musicEmpty?: boolean;
}): AgentResponseUi {
  const badges: AgentUiBadge[] = [];
  if (params.searchUsed) badges.push({ id: 'web', label: 'Web', icon: 'globe' });
  if (params.musicSearchUsed) badges.push({ id: 'music', label: 'Music', icon: 'musical-notes' });
  if (params.ragUsed) badges.push({ id: 'rag', label: 'RAG', icon: 'library' });
  if (params.recommendationUsed) {
    badges.push({ id: 'recommend', label: 'Recommend', icon: 'sparkles' });
  }
  if (params.citations.length > 0) {
    badges.push({
      id: 'citations',
      label: `출처 ${params.citations.length}`,
      icon: 'book',
    });
  }
  if (params.reasoning) badges.push({ id: 'thinking', label: 'Thinking', icon: 'bulb' });
  if (params.providerLabel) {
    badges.push({ id: 'provider', label: params.providerLabel, icon: 'chip' });
  }
  if (params.latencyMs > 0) {
    badges.push({
      id: 'latency',
      label: `${(params.latencyMs / 1000).toFixed(1)}초`,
      icon: 'flash',
    });
  }

  const actions: AgentUiAction[] = [];
  if (params.musicSearchUsed && params.answerOk) {
    actions.push({ id: 'download_flow', label: '노래 다운로드', kind: 'download' });
  }

  const warnings: AgentUiWarning[] = [];
  if (params.musicEmpty) {
    warnings.push({ id: 'music_empty', message: '검색 결과 없음' });
  }

  return {
    badges,
    actions,
    warnings,
    providerLabel: params.providerLabel,
    latencyMs: params.latencyMs,
  };
}

function buildPromptDiagnostics(plan: AgentPlan, state: AgentState): PromptDiagnostics {
  const buckets = plan.tokenBucketsUsed ?? {};
  const systemPromptTokens = estimateTokens(plan.systemPrompt || '');
  const historyTokens = buckets.history ?? 0;
  const faqTokens = buckets.faq ?? estimateTokens(plan.context.faqText || '');
  const searchTokens = buckets.search ?? 0;
  const vectorTokens = buckets.vector ?? estimateTokens(plan.context.vectorText || '');
  const userTokens = buckets.user ?? estimateTokens(state.userMessage || '');
  return {
    systemPromptTokens,
    historyTokens,
    faqTokens,
    searchTokens,
    vectorTokens,
    userTokens,
    totalEstimatedTokens:
      systemPromptTokens + historyTokens + faqTokens + searchTokens + vectorTokens + userTokens,
  };
}

function buildContextDiagnostics(plan: AgentPlan, state: AgentState): ContextDiagnostics {
  const latencyByProvider: Record<string, number | undefined> = {
    faq: state.timings.faqMs,
    vector: state.timings.vectorMs,
    web_search: state.timings.searchMs,
  };
  const contexts = state.contexts.map((c) => ({
    provider: c.provider,
    tokens: estimateTokens(c.content || ''),
    latencyMs: latencyByProvider[c.provider] ?? c.estimatedLatencyMs ?? null,
    confidence: c.confidence ?? 0,
    hitCount:
      typeof c.metadata?.hitCount === 'number'
        ? c.metadata.hitCount
        : c.content
          ? 1
          : 0,
  }));
  // plan에 있지만 state에 없는 provider도 기록
  for (const p of plan.contexts) {
    if (!contexts.some((x) => x.provider === p.provider)) {
      contexts.push({
        provider: p.provider,
        tokens: estimateTokens(p.content || ''),
        latencyMs: latencyByProvider[p.provider] ?? null,
        confidence: p.confidence ?? 0,
        hitCount: 0,
      });
    }
  }
  return { contexts };
}

export function buildAgentResponse(params: {
  request: AgentRequest;
  plan: AgentPlan;
  state: AgentState;
  answer: string;
  ok: boolean;
  role: 'assistant' | 'system';
  toolCalls?: NormalizedToolCall[];
  citations?: AgentCitation[];
  searchUsed: boolean;
  musicSearchUsed?: boolean;
  musicEmpty?: boolean;
  latencyMs: number;
  error?: { kind: string; message: string };
  // deno-lint-ignore no-explicit-any
  raw?: any;
}): AgentResponse {
  const { request, plan, state } = params;
  const tokenUsage: TokenUsageBreakdown = state.tokenUsage ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  const contextUsed = state.contexts.map((c) => ({
    provider: c.provider,
    priority: c.priority,
    cost: c.cost,
  }));
  const toolCalls = params.toolCalls ?? [];
  const ragUsed = state.contexts.some(
    (c) => c.provider === 'vector' && Boolean(c.content?.trim()),
  );
  const recommendationUsed =
    plan.intent.intent === 'recommendation' ||
    state.contexts.some((c) => c.provider === 'recommendation_profile');
  const musicSearchUsed =
    params.musicSearchUsed === true ||
    plan.intent.needsMusicSearch ||
    plan.intent.intent === 'download' ||
    plan.intent.intent === 'music';
  const citations = params.citations ?? [];
  const intentConf = plan.intent.confidence ?? 0;
  const answerLength = params.answer.length;

  const evaluation: AgentEvaluationSnapshot = {
    answerScore: null,
    confidence: intentConf,
    hallucinationRisk: null,
    toolSuccess: null,
    answerLength,
    latencyMs: params.latencyMs,
    toolCount: toolCalls.length,
    contextCount: contextUsed.length,
    searchUsed: params.searchUsed,
    ragUsed,
    recommendationUsed,
  };

  const promptDiagnostics = buildPromptDiagnostics(plan, state);
  const contextDiagnostics = buildContextDiagnostics(plan, state);

  return {
    ok: params.ok,
    traceId: request.traceId,
    requestId: request.requestId,
    answer: params.answer,
    role: params.role,
    toolCalls,
    citations,
    timings: state.timings,
    tokenUsage,
    contextUsed,
    provider: {
      providerName: plan.provider.providerName,
      modelName: plan.model,
      selectedBy: plan.provider.selectedBy,
    },
    promptVersion: request.promptVersion,
    experimentId: request.experimentId,
    featureFlags: request.featureFlags,
    intent: state.intent,
    searchUsed: params.searchUsed,
    ragUsed,
    recommendationUsed,
    musicSearchUsed,
    evaluation,
    ui: buildUi({
      searchUsed: params.searchUsed,
      musicSearchUsed,
      ragUsed: ragUsed && request.featureFlags.rag,
      recommendationUsed,
      citations,
      reasoning: request.featureFlags.reasoning,
      providerLabel: plan.provider.modelDisplayName || plan.model,
      latencyMs: params.latencyMs,
      answerOk: params.ok,
      musicEmpty: params.musicEmpty,
    }),
    promptDiagnostics,
    contextDiagnostics,
    error: params.error,
    raw: params.raw,
  };
}
