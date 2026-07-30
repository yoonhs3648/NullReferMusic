/**
 * Agent Executor — DAG wave 병렬 실행.
 * Provider 종류를 모른다: ProviderFactory.get(id).stream → NormalizedResponse.
 */

import { mergeContexts } from './context/merge.ts';
import { topologicalWaves } from './graph/types.ts';
import { logAgentPhase } from './log.ts';
import {
  backoffDelayMs,
  DEFAULT_RETRY_POLICY,
  isRetryableKind,
  SEARCH_RETRY_POLICY,
  sleepMs,
  type RetryPolicy,
} from './policy/retry.ts';
import {
  denormalizeToLegacyAdapterShape,
  type NormalizedResponse,
} from './providers/normalize.ts';
import { ProviderFactory } from './providers/registry.ts';
import type { AgentPlan, AgentState, AgentToolMode } from './types.ts';

type Turn = { role: 'user' | 'assistant'; content: string };

export type ExecutorBridge = {
  systemInstruction: string;
  enableDownloadTools: boolean;
  enableWebSearch: boolean;
  toolMode: AgentToolMode;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  retry: number;
  toolNames: string[];
  contextProvidersUsed: string[];
  graphNodeIds: string[];
  graphWaves: string[][];
};

export function executePlanToAdapterOptions(plan: AgentPlan): ExecutorBridge {
  const waves = topologicalWaves(plan.graph);
  return {
    systemInstruction: plan.systemPrompt,
    enableDownloadTools: plan.toolMode === 'download',
    /** 웹 검색 전면 비활성 */
    enableWebSearch: false,
    toolMode: plan.toolMode,
    model: plan.model,
    temperature: plan.temperature,
    maxOutputTokens: plan.maxOutputTokens,
    timeoutMs: plan.timeoutMs,
    retry: plan.retry,
    toolNames: plan.tools.map((t) => t.name),
    contextProvidersUsed: plan.contexts.map((c) => c.provider),
    graphNodeIds: waves.flat().map((n) => `${n.id}:${n.type}`),
    graphWaves: waves.map((w) => w.map((n) => n.id)),
  };
}

export type RunGraphParams = {
  plan: AgentPlan;
  state: AgentState;
  apiKey: string;
  history: Turn[];
  userMessage: string;
  onDelta: (text: string) => void;
  toolContinue?: {
    modelFunctionCalls: Array<{
      callId: string;
      name: string;
      args: Record<string, unknown>;
    }>;
    functionResponses: Array<{ name: string; response: Record<string, unknown> }>;
    previousInteractionId?: string | null;
  };
};

function policyForNode(type: string, planRetry: number): RetryPolicy {
  if (type === 'native_search' || type === 'llm') {
    return planRetry > 0 ? { ...SEARCH_RETRY_POLICY, maxRetry: planRetry } : DEFAULT_RETRY_POLICY;
  }
  return { ...DEFAULT_RETRY_POLICY, maxRetry: 0 };
}

/**
 * DAG wave 실행. 같은 wave의 parallel=true 노드는 Promise.all.
 * 반환은 레거시 AdapterShape (index finalize 경로 호환) — 내부는 Normalized.
 */
export async function runExecutionGraph(
  params: RunGraphParams,
): Promise<Record<string, unknown>> {
  const { plan, state, apiKey, history, userMessage, onDelta, toolContinue } = params;
  const traceId = plan.traceId;
  const signal = state.abortController.signal;
  const waves = topologicalWaves(plan.graph);
  state.timings.graphNodeMs = state.timings.graphNodeMs ?? {};
  state.timings.waveMs = [];

  let enableDownloadTools = plan.toolMode === 'download';
  /** 웹 검색 전면 비활성 — native_search 노드가 남아도 켜지 않음 */
  const enableWebSearch = false;
  let lastNorm: NormalizedResponse | null = null;

  const runNode = async (node: (typeof waves)[0][0]) => {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const t0 = Date.now();
    logAgentPhase(traceId, 'graph_node_start', {
      traceId,
      nodeId: node.id,
      type: node.type,
      ref: node.ref ?? null,
      parallel: node.parallel !== false,
    });

    if (node.type === 'end') {
      state.timings.graphNodeMs![node.id] = Date.now() - t0;
      return;
    }

    if (
      node.type === 'context' ||
      node.type === 'recommend' ||
      node.type === 'tools'
    ) {
      state.timings.graphNodeMs![node.id] = Date.now() - t0;
      return;
    }

    if (node.type === 'merge_context') {
      const tMerge = Date.now();
      const merged = mergeContexts(state.contexts);
      state.contexts = merged.contexts;
      plan.context.combinedBlock = merged.combinedBlock;
      state.timings.mergeMs = Date.now() - tMerge;
      state.timings.graphNodeMs![node.id] = Date.now() - t0;
      logAgentPhase(traceId, 'context_merged', {
        traceId,
        count: merged.contexts.length,
        droppedDuplicates: merged.droppedDuplicates,
      });
      return;
    }

    if (node.type === 'native_search') {
      enableDownloadTools = false;
      state.timings.graphNodeMs![node.id] = Date.now() - t0;
      return;
    }

    if (node.type === 'llm') {
      // Executor는 Provider 이름을 Factory 키로만 사용 — if(Google) 금지
      const provider = ProviderFactory.get(plan.provider.providerName);
      const policy = policyForNode('llm', node.retry ?? plan.retry);
      let attempt = 0;
      let result: NormalizedResponse | null = null;

      while (attempt <= policy.maxRetry) {
        if (signal.aborted) {
          result = {
            ok: false,
            kind: 'cancelled',
            message: 'aborted',
            needsWebSearch: enableWebSearch,
          };
          break;
        }
        const llmStarted = Date.now();
        result = await provider.stream(
          apiKey,
          plan.model,
          history,
          userMessage,
          onDelta,
          {
            adminSystemInstruction: plan.systemPrompt,
            enableDownloadTools,
            enableWebSearch,
            temperature: plan.temperature,
            maxOutputTokens: plan.maxOutputTokens,
            timeoutMs: node.timeoutMs ?? plan.timeoutMs,
            signal,
            toolContinue,
          },
        );
        state.timings.llmMs = (state.timings.llmMs ?? 0) + (Date.now() - llmStarted);

        if (result.ok) {
          state.tokenUsage = {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            promptTokens: result.usage.promptTokens,
            contextTokens: result.usage.contextTokens,
            searchTokens: result.usage.searchTokens,
          };
          break;
        }

        const kind = result.kind;
        if (!isRetryableKind(policy, kind === 'cancelled' ? 'other' : kind)) break;
        if (attempt >= policy.maxRetry) break;
        await sleepMs(backoffDelayMs(policy, attempt), signal);
        attempt += 1;
        state.retries = attempt;
      }

      lastNorm = result;
      state.timings.graphNodeMs![node.id] = Date.now() - t0;
      logAgentPhase(traceId, 'graph_node_done', {
        traceId,
        nodeId: node.id,
        type: 'llm',
        elapsedMs: state.timings.graphNodeMs![node.id],
        llmMs: state.timings.llmMs,
        ok: lastNorm?.ok ?? false,
        tokenUsage: state.tokenUsage ?? null,
      });
    }
  };

  try {
    for (const wave of waves) {
      const tw = Date.now();
      const parallelizable = wave.filter((n) => n.parallel !== false && n.type !== 'llm');
      const serial = wave.filter((n) => n.parallel === false || n.type === 'llm');

      if (parallelizable.length > 0) {
        await Promise.all(parallelizable.map(runNode));
      }
      for (const n of serial) {
        await runNode(n);
      }
      state.timings.waveMs!.push(Date.now() - tw);
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      lastNorm = {
        ok: false,
        kind: 'cancelled',
        message: 'aborted',
        needsWebSearch: enableWebSearch,
      };
    } else {
      throw e;
    }
  }

  if (!lastNorm) {
    lastNorm = {
      ok: false,
      kind: 'other',
      message: 'execution_graph_no_llm_node',
      needsWebSearch: enableWebSearch,
    };
  }

  return denormalizeToLegacyAdapterShape(lastNorm);
}
