/**
 * AI Lab Agent public API.
 */

export type {
  AgentPlan,
  AgentState,
  AgentToolMode,
  ContextResult,
  IntentResult,
  LlmProviderCapabilities,
  ProviderInfo,
  RecommendationContext,
  ToolDefinition,
  TokenUsageBreakdown,
} from './types.ts';

export {
  emptyAgentState,
  getProviderCapabilities,
  toLegacyIntentAnalysis,
} from './types.ts';

export { runPlanner, selectProviderForIntent } from './planner.ts';
export {
  executePlanToAdapterOptions,
  runExecutionGraph,
} from './executor.ts';
export {
  logAgentPlanSummary,
  logAgentStateSnapshot,
  logAgentPhase,
  logAgentTimings,
} from './log.ts';
export { registerContextProvider } from './context/registry.ts';
export { mergeContexts } from './context/merge.ts';
export { registerTool, createTool, buildFunctionSchemasForLlm } from './tools/registry.ts';
export { ToolFactory, registerToolFactory } from './tools/factory.ts';
export { PromptBuilder } from './prompt/builder.ts';
export {
  registerProvider,
  registerProviderFactory,
  registerAdapterAsProvider,
  getProvider,
  requireProvider,
  listProviders,
  hasProvider,
  ProviderFactory,
} from './providers/registry.ts';
export type { LlmProvider, ProviderStreamResult } from './providers/registry.ts';
export type { NormalizedResponse } from './providers/normalize.ts';
export {
  normalizeProviderResult,
  denormalizeToLegacyAdapterShape,
} from './providers/normalize.ts';
export { buildExecutionGraph } from './graph/build.ts';
export type { ExecutionGraph, GraphNode } from './graph/types.ts';
export { topologicalWaves } from './graph/types.ts';
export {
  registerMusicMetadataProvider,
  listMusicMetadataProviders,
} from './music/metadataProvider.ts';
export type { MusicMetadataProvider } from './music/metadataProvider.ts';
export {
  registerRecommendationStrategy,
  listRecommendationStrategies,
} from './recommend/strategies.ts';
export type { RecommendationStrategy } from './recommend/strategies.ts';
export {
  DEFAULT_RETRY_POLICY,
  SEARCH_RETRY_POLICY,
  NO_RETRY_POLICY,
} from './policy/retry.ts';
export type { RetryPolicy } from './policy/retry.ts';

export type {
  AgentRequest,
  AgentResponse,
  AgentEvaluationSnapshot,
  AgentResponseUi,
  PromptDiagnostics,
  ContextDiagnostics,
} from './contract/types.ts';
export { buildAgentRequest, buildAgentResponse } from './contract/types.ts';

/** Ops interfaces (register to enable) */
export {
  resolveFeatureFlags,
  registerFeatureFlagProvider,
  applyFlagDefs,
  rolloutBucket,
  DEFAULT_FEATURE_FLAGS,
} from './ops/featureFlags.ts';
export type { FeatureFlags, FeatureFlagDef } from './ops/featureFlags.ts';
export {
  resolveGeminiApiMode,
  resolveGeminiApiModeFromEnv,
  shouldUseGeminiInteractionsApi,
  setGeminiInteractionsApiOverride,
} from './ops/geminiApiMode.ts';
export type { GeminiApiMode } from './ops/geminiApiMode.ts';
export { getActivePromptVersion, registerPromptVersion } from './ops/promptVersion.ts';
export { runEvaluation, registerAnswerEvaluator } from './ops/evaluation.ts';
export {
  getQuestionCache,
  getSemanticCache,
  registerQuestionCache,
  registerSemanticCache,
  cacheKeyForQuestion,
} from './ops/cache.ts';
export {
  getInputGuard,
  getOutputGuard,
  registerInputGuard,
  registerOutputGuard,
} from './ops/safety.ts';
export {
  getSummaryMemoryProvider,
  registerSummaryMemoryProvider,
} from './ops/memory.ts';
export {
  getProviderHealthMonitor,
  getCircuitBreaker,
  getProviderRateLimiter,
  registerProviderHealthMonitor,
  registerCircuitBreaker,
  registerProviderRateLimiter,
} from './ops/health.ts';
export type { ProviderHealthScore } from './ops/health.ts';
export { assignExperiment, registerExperimentAssigner } from './ops/experiment.ts';
export { metricsFromAgentResponse } from './ops/metrics.ts';
export type { AgentMetrics } from './ops/metrics.ts';
export {
  buildProviderHttpDiag,
  classifyQuotaFromResponse,
  detectToolsInRequestBody,
  headersToRecord,
  pickProviderRequestId,
  snapshotRequestBody,
} from './ops/providerHttpDiag.ts';
export type {
  ProviderHttpDiag,
  QuotaClass,
  QuotaClassification,
  RequestBodySnapshot,
} from './ops/providerHttpDiag.ts';
export {
  getReRankProvider,
  registerReRankProvider,
  rerankContext,
  IdentityReRank,
} from './context/rerank.ts';
export type { ReRankProvider, ReRankCandidate } from './context/rerank.ts';
export {
  getVectorSearchProvider,
  registerVectorSearchProvider,
  searchVector,
} from './context/vectorSearch.ts';
export type { VectorSearchResult, VectorSearchProvider } from './context/vectorSearch.ts';
export {
  resolveMusicMetadataProvider,
  getDefaultMusicMetadataProviderId,
  setDefaultMusicMetadataProvider,
  MelonProvider,
} from './music/metadataProvider.ts';

export {
  analyzeUserIntent,
  applyIntentMessageGuards,
  classifyIntentHeuristic,
  isBeyondKnowledgeCutoffIntent,
  messageLooksLikeDownload,
  messageLooksLikeMusicSearch,
} from './intent.ts';
export { INTENT_CLASSIFIER_MODEL } from './intent.ts';

/** @deprecated */
export { runPlanner as buildAgentPlan } from './planner.ts';
