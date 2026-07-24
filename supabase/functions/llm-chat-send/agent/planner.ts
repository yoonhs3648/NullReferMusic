/**
 * Agent Planner — Intent → Graph + Plan (실행은 Executor).
 */

import './context/providers.ts';
import './tools/providers.ts';
import './recommend/strategies.ts';

import { packHistoryAndContexts, type ChatTurn } from './budget/tokenBudget.ts';
import { mergeContexts } from './context/merge.ts';
import { collectContexts, contextsToCombinedBlock } from './context/registry.ts';
import { buildExecutionGraph, planRuntimeFromGraph } from './graph/build.ts';
import { analyzeUserIntent } from './intent.ts';
import {
  getCircuitBreaker,
  getProviderHealthMonitor,
  getProviderRateLimiter,
} from './ops/health.ts';
import { buildLiveCurrentDatetimeBlock, PromptBuilder } from './prompt/builder.ts';
import { selectToolsForIntent } from './tools/registry.ts';
import type {
  AgentPlan,
  AgentState,
  IntentResult,
  ProviderInfo,
} from './types.ts';
import {
  deriveToolMode,
  getProviderCapabilities,
  toLegacyIntentAnalysis,
} from './types.ts';

export type PlannerMusicPlatform = {
  id: string;
  label: string;
  blocked: boolean;
  explicit: boolean;
};

/** Edge — 앱 MUSIC_PLATFORM_CAPABILITIES 와 동기화 */
function edgeMusicPlatformCapabilities(id: string): {
  supportsSearch: boolean;
  supportsChart: boolean;
  supportsAlbum: boolean;
  supportsArtist: boolean;
  supportsLyrics: boolean;
} {
  const table: Record<string, {
    supportsSearch: boolean;
    supportsChart: boolean;
    supportsAlbum: boolean;
    supportsArtist: boolean;
    supportsLyrics: boolean;
  }> = {
    melon: {
      supportsSearch: true,
      supportsChart: true,
      supportsAlbum: true,
      supportsArtist: true,
      supportsLyrics: true,
    },
    spotify: {
      supportsSearch: false,
      supportsChart: true,
      supportsAlbum: false,
      supportsArtist: false,
      supportsLyrics: false,
    },
    spotify_premium: {
      supportsSearch: true,
      supportsChart: true,
      supportsAlbum: true,
      supportsArtist: true,
      supportsLyrics: false,
    },
    apple_music: {
      supportsSearch: true,
      supportsChart: true,
      supportsAlbum: true,
      supportsArtist: true,
      supportsLyrics: false,
    },
    last_fm: {
      supportsSearch: true,
      supportsChart: true,
      supportsAlbum: true,
      supportsArtist: true,
      supportsLyrics: false,
    },
    youtube_music: {
      supportsSearch: false,
      supportsChart: true,
      supportsAlbum: false,
      supportsArtist: false,
      supportsLyrics: false,
    },
    genie: {
      supportsSearch: false,
      supportsChart: true,
      supportsAlbum: false,
      supportsArtist: false,
      supportsLyrics: false,
    },
    billboard: {
      supportsSearch: false,
      supportsChart: true,
      supportsAlbum: false,
      supportsArtist: false,
      supportsLyrics: false,
    },
    soundcloud: {
      supportsSearch: false,
      supportsChart: false,
      supportsAlbum: false,
      supportsArtist: false,
      supportsLyrics: false,
    },
  };
  return (
    table[id] ?? {
      supportsSearch: false,
      supportsChart: false,
      supportsAlbum: false,
      supportsArtist: false,
      supportsLyrics: false,
    }
  );
}

export type PlannerInput = {
  state: AgentState;
  userMessage: string;
  isToolContinue: boolean;
  googleApiKey: string | null;
  adminDbPrompt: string;
  provider: Omit<ProviderInfo, 'capabilities' | 'selectedBy'> & {
    capabilities?: ProviderInfo['capabilities'];
    selectedBy?: ProviderInfo['selectedBy'];
  };
  history: ChatTurn[];
  musicPlatform?: PlannerMusicPlatform;
  // deno-lint-ignore no-explicit-any
  supabase?: any;
};

export function selectProviderForIntent(
  intent: IntentResult,
  userProvider: PlannerInput['provider'],
): ProviderInfo {
  const capabilities =
    userProvider.capabilities ?? getProviderCapabilities(userProvider.providerName);
  const name = userProvider.providerName;
  const health = getProviderHealthMonitor().get(name);
  const circuitOk = getCircuitBreaker().allow(name);
  const rateOk = getProviderRateLimiter().tryAcquire(name);
  // 자동 페일오버(다른 Provider 키)는 이후 — 지금은 관측만
  void intent;
  void health;
  void circuitOk;
  void rateOk;
  return {
    providerId: userProvider.providerId,
    providerName: userProvider.providerName,
    modelId: userProvider.modelId,
    modelName: userProvider.modelName,
    modelDisplayName: userProvider.modelDisplayName,
    capabilities,
    selectedBy: userProvider.selectedBy ?? 'user',
  };
}

export function pickGenerationParams(intent: IntentResult, _modelName: string): {
  temperature: number;
  maxOutputTokens: number;
  maxContextTokens: number;
} {
  if (intent.intent === 'latest') {
    return { temperature: 0.6, maxOutputTokens: 65536, maxContextTokens: 8_000 };
  }
  if (intent.intent === 'recommendation') {
    return { temperature: 0.85, maxOutputTokens: 65536, maxContextTokens: 10_000 };
  }
  return { temperature: 0.8, maxOutputTokens: 65536, maxContextTokens: 12_000 };
}

export async function runPlanner(input: PlannerInput): Promise<{
  plan: AgentPlan;
  state: AgentState;
}> {
  const t0 = Date.now();
  const state = input.state;
  const traceId = state.traceId;

  const tIntent = Date.now();
  const intent = await analyzeUserIntent({
    userMessage: input.userMessage,
    isToolContinue: input.isToolContinue,
    googleApiKey: input.googleApiKey,
  });
  state.intent = intent;
  state.timings.intentMs = Date.now() - tIntent;

  const provider = selectProviderForIntent(intent, input.provider);
  state.provider = provider;

  const tCtx = Date.now();
  const { results: rawContexts, timings: ctxTimings } = await collectContexts({
    serialNo: state.serialNo,
    userMessage: input.userMessage,
    intent,
    preferLowLatency: intent.intent === 'general' || intent.intent === 'music',
    supabase: input.supabase,
    googleApiKey: input.googleApiKey,
    signal: state.abortController.signal,
  });
  state.timings.contextMs = Date.now() - tCtx;
  state.timings.faqMs = ctxTimings.faq;
  state.timings.vectorMs = ctxTimings.vector;
  state.timings.searchMs = ctxTimings.web_search;

  const tMerge = Date.now();
  const mergedEarly = mergeContexts(rawContexts);
  state.timings.mergeMs = Date.now() - tMerge;

  const gen = pickGenerationParams(intent, provider.modelName);

  const packed = packHistoryAndContexts({
    history: input.history,
    contexts: mergedEarly.contexts,
    userMessage: input.userMessage,
    systemPromptEstimate: 1200,
    maxTurns: 15,
    redistributeUnusedSearch: true,
    budget: {
      maxContextCost: 40,
      buckets: {
        system: 1500,
        history: 4000,
        faq: 1500,
        search: 3000,
        vector: 2500,
        user: 2000,
      },
    },
  });
  state.contexts = packed.contexts;

  const musicPlatform = input.musicPlatform ?? {
    id: 'melon',
    label: 'Melon',
    blocked: false,
    explicit: false,
  };

  const tools = selectToolsForIntent({
    intent,
    isToolContinue: input.isToolContinue,
    providerName: provider.providerName,
    supportsFunctionCalling: provider.capabilities.supportsFunctionCalling,
    supportsGrounding: provider.capabilities.supportsGrounding,
  }).filter((t) => {
    if (t.kind === 'native_grounding' && !provider.capabilities.supportsGrounding) return false;
    if (t.kind === 'download_fc' && !provider.capabilities.supportsFunctionCalling) return false;
    // Preference blocked여도 FC platform으로 다른 플랫폼 검색 가능 → download_fc 유지
    return true;
  });
  state.tools = tools;

  const graph = buildExecutionGraph({
    intent,
    tools,
    isToolContinue: input.isToolContinue,
  });
  const runtime = planRuntimeFromGraph(graph);
  const toolMode = deriveToolMode(tools, input.isToolContinue);

  const tPrompt = Date.now();
  const allowDownloadPrompt =
    toolMode === 'download' || intent.needsDownloadTool || intent.needsMusicSearch;
  const platformCaps = edgeMusicPlatformCapabilities(musicPlatform.id);
  const builder = new PromptBuilder()
    .addDatetime(buildLiveCurrentDatetimeBlock())
    .addRole()
    .addAdminPrompt(input.adminDbPrompt)
    .addRules()
    .addIntent(intent)
    .addMusicPlatform({
      id: musicPlatform.id,
      label: musicPlatform.label,
      blocked: musicPlatform.blocked,
      capabilities: platformCaps,
    })
    .addSearch(toolMode === 'web_search' || intent.needsWebSearch)
    .addDownload(allowDownloadPrompt)
    .addRag(intent.needsVectorSearch)
    .addRecommendation(intent.intent === 'recommendation')
    .addFaq(intent.needsFaqSearch || intent.intent === 'faq')
    .addUserHistory(intent.needsHistory || intent.needsUserProfile)
    .addToolRules(tools)
    .addOutputFormat()
    .addContext(packed.contexts);

  const { text: systemPrompt, sections } = builder.build();
  state.timings.promptMs = Date.now() - tPrompt;
  state.timings.plannerMs = Date.now() - t0;
  state.timings.planMs = state.timings.plannerMs;
  state.timings.totalPlanMs = state.timings.plannerMs;

  const plan: AgentPlan = {
    traceId,
    intent,
    contexts: packed.contexts,
    provider,
    tools,
    systemPrompt,
    promptSections: sections,
    model: provider.modelName,
    temperature: gen.temperature,
    maxOutputTokens: gen.maxOutputTokens,
    historyBudgetTurns: packed.historyTurnsUsed,
    toolMode,
    graph,
    retry: runtime.retry,
    timeoutMs: runtime.timeoutMs,
    maxContextTokens: gen.maxContextTokens,
    preferLowLatency: intent.intent === 'general' || intent.intent === 'music',
    analysis: toLegacyIntentAnalysis(intent),
    context: {
      faqText: packed.contexts.find((c) => c.provider === 'faq')?.content ?? '',
      vectorText: packed.contexts.find((c) => c.provider === 'vector')?.content ?? '',
      userMusicText:
        packed.contexts.find((c) => c.provider === 'user_music_history')?.content ?? '',
      combinedBlock: mergedEarly.combinedBlock || contextsToCombinedBlock(packed.contexts),
    },
    tokenBucketsUsed: packed.bucketsUsed,
  };

  return { plan, state };
}
