/**
 * AI Lab Agent — 핵심 계약.
 */

import type { ExecutionGraph } from './graph/types.ts';

export type AiLabIntentKind =
  | 'general'
  | 'music'
  | 'latest'
  | 'recommendation'
  | 'download'
  | 'faq';

export type IntentSource =
  | 'classifier'
  /** Classifier 결과에 다운로드/검색 키워드 가드를 적용함 */
  | 'classifier_guarded'
  | 'classifier_failed'
  /** Classifier 실패·없음이지만 다운로드/검색 키워드로 도구 ON */
  | 'keyword_guard'
  | 'tool_continue'
  /** @deprecated 전체 휴리스틱 폴백은 사용하지 않음 */
  | 'heuristic_fallback';

export type IntentResult = {
  intent: AiLabIntentKind;
  confidence: number;
  needsWebSearch: boolean;
  needsVectorSearch: boolean;
  needsFaqSearch: boolean;
  needsDownloadTool: boolean;
  needsHistory: boolean;
  needsUserProfile: boolean;
  needsMusicSearch: boolean;
  reasoning?: string;
  source: IntentSource;
};

export type IntentAnalysis = IntentResult & {
  needSearch: boolean;
  needDownloadTools: boolean;
  needVector: boolean;
  needFaq: boolean;
  reason?: string;
};

export function toLegacyIntentAnalysis(r: IntentResult): IntentAnalysis {
  return {
    ...r,
    needSearch: r.needsWebSearch,
    needDownloadTools: r.needsDownloadTool,
    needVector: r.needsVectorSearch,
    needFaq: r.needsFaqSearch,
    reason: r.reasoning,
  };
}

export type ContextResult = {
  provider: string;
  priority: number;
  /** Budget 비용 가중치 (FAQ=1 … Search=20) — estimatedCost 별칭 */
  cost: number;
  estimatedCost?: number;
  /** 예상 지연 ms */
  estimatedLatencyMs?: number;
  confidence: number;
  content: string;
  metadata?: Record<string, unknown>;
};

export type RecommendationContext = {
  recentTracks: Array<{ id?: string; title: string; artist?: string }>;
  favoriteArtists: Array<{ id?: string; name: string }>;
  favoriteGenres: Array<{ name: string; weight?: number }>;
  listeningPatterns?: Record<string, unknown>;
};

export type LlmProviderCapabilities = {
  supportsStreaming: boolean;
  supportsJson: boolean;
  supportsJsonMode: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  supportsEmbedding: boolean;
  supportsEmbeddings: boolean;
  supportsSearch: boolean;
  supportsGrounding: boolean;
  supportsThinking: boolean;
  supportsImageGeneration: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsFunctionCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsCaching: boolean;
  supportsSystemInstruction: boolean;
  supportsParallelTools: boolean;
  supportsStreamingFunctionCall: boolean;
  /** 하위호환 */
  supportsTools: boolean;
};

function caps(partial: Partial<LlmProviderCapabilities> & Pick<
  LlmProviderCapabilities,
  | 'supportsStreaming'
  | 'supportsGrounding'
  | 'supportsFunctionCalling'
  | 'supportsThinking'
  | 'supportsVision'
>): LlmProviderCapabilities {
  return {
    supportsJson: partial.supportsJson ?? partial.supportsJsonMode ?? true,
    supportsJsonMode: partial.supportsJsonMode ?? partial.supportsJson ?? true,
    supportsReasoning: partial.supportsReasoning ?? partial.supportsThinking ?? false,
    supportsEmbedding: partial.supportsEmbedding ?? partial.supportsEmbeddings ?? false,
    supportsEmbeddings: partial.supportsEmbeddings ?? partial.supportsEmbedding ?? false,
    supportsSearch: partial.supportsSearch ?? partial.supportsGrounding ?? false,
    supportsImageGeneration: partial.supportsImageGeneration ?? false,
    supportsAudio: partial.supportsAudio ?? false,
    supportsVideo: partial.supportsVideo ?? false,
    supportsStructuredOutput: partial.supportsStructuredOutput ?? partial.supportsJsonMode ?? true,
    supportsCaching: partial.supportsCaching ?? false,
    supportsSystemInstruction: partial.supportsSystemInstruction ?? true,
    supportsParallelTools: partial.supportsParallelTools ?? false,
    supportsStreamingFunctionCall:
      partial.supportsStreamingFunctionCall ?? partial.supportsFunctionCalling ?? false,
    supportsTools: partial.supportsTools ?? partial.supportsFunctionCalling,
    supportsStreaming: partial.supportsStreaming,
    supportsGrounding: partial.supportsGrounding,
    supportsFunctionCalling: partial.supportsFunctionCalling,
    supportsThinking: partial.supportsThinking,
    supportsVision: partial.supportsVision,
  };
}

export const PROVIDER_CAPABILITIES: Record<string, LlmProviderCapabilities> = {
  Google: caps({
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: true,
    supportsJsonMode: true,
    supportsFunctionCalling: true,
    /** 웹 검색(google_search) 전면 비활성 — 2026-07-29 */
    supportsGrounding: false,
    supportsEmbeddings: true,
    supportsReasoning: true,
    supportsImageGeneration: true,
    supportsAudio: true,
    supportsVideo: true,
    supportsCaching: true,
    supportsSystemInstruction: true,
    supportsParallelTools: true,
    supportsStreamingFunctionCall: true,
    supportsSearch: false,
    supportsTools: true,
  }),
  Groq: caps({
    supportsStreaming: true,
    supportsVision: false,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsFunctionCalling: true,
    /** 웹 검색(browser_search) 전면 비활성 — 2026-07-29 */
    supportsGrounding: false,
    supportsEmbeddings: false,
    supportsReasoning: false,
    supportsSearch: false,
    supportsTools: true,
    supportsSystemInstruction: true,
    supportsStreamingFunctionCall: true,
  }),
};

export function getProviderCapabilities(providerName: string): LlmProviderCapabilities {
  return (
    PROVIDER_CAPABILITIES[providerName] ??
    caps({
      supportsStreaming: true,
      supportsVision: false,
      supportsThinking: false,
      supportsJsonMode: false,
      supportsFunctionCalling: false,
      supportsGrounding: false,
    })
  );
}

export type ProviderInfo = {
  providerId: number;
  providerName: string;
  modelId: number;
  modelName: string;
  modelDisplayName: string;
  capabilities: LlmProviderCapabilities;
  selectedBy: 'user' | 'planner';
};

export type PromptSection = {
  id: string;
  priority: number;
  content: string;
  required: boolean;
  /** Section별 토큰 상한(대략) — Budget/Prompt 조립 시 절삭 */
  maxTokens?: number;
};

export type ToolSchemaParam = {
  type: string;
  description?: string;
  // deno-lint-ignore no-explicit-any
  properties?: Record<string, any>;
  required?: string[];
};

export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  kind: 'download_fc' | 'native_grounding' | 'server_stub';
  priority: number;
  parameters: ToolSchemaParam;
  examples?: Array<{ user: string; args: Record<string, unknown> }>;
  /** Tool 스키마 버전 — 호환성 관리 */
  version?: string;
};

export type AgentToolMode = 'download' | 'web_search' | 'none';

export type TokenUsageBreakdown = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  promptTokens?: number;
  contextTokens?: number;
  searchTokens?: number;
  historyTokens?: number;
};

export type AgentPlan = {
  traceId: string;
  intent: IntentResult;
  contexts: ContextResult[];
  provider: ProviderInfo;
  tools: ToolDefinition[];
  systemPrompt: string;
  promptSections: PromptSection[];
  model: string;
  temperature: number;
  maxOutputTokens: number;
  historyBudgetTurns: number;
  toolMode: AgentToolMode;
  graph: ExecutionGraph;
  retry: number;
  timeoutMs: number;
  maxContextTokens: number;
  preferLowLatency?: boolean;
  analysis: IntentAnalysis;
  context: {
    faqText: string;
    vectorText: string;
    userMusicText: string;
    combinedBlock: string;
  };
  /** packHistoryAndContexts 버킷 사용량 — promptDiagnostics */
  tokenBucketsUsed?: Partial<Record<'system' | 'history' | 'faq' | 'vector' | 'search' | 'user', number>>;
};

export type AgentTimings = {
  intentMs?: number;
  plannerMs?: number;
  contextMs?: number;
  faqMs?: number;
  vectorMs?: number;
  searchMs?: number;
  mergeMs?: number;
  promptMs?: number;
  planMs?: number;
  totalPlanMs?: number;
  llmMs?: number;
  graphNodeMs?: Record<string, number>;
  waveMs?: number[];
};

export type AgentState = {
  traceId: string;
  requestId: string;
  serialNo: string;
  userMessage: string;
  isToolContinue: boolean;
  intent: IntentResult | null;
  contexts: ContextResult[];
  tools: ToolDefinition[];
  provider: ProviderInfo | null;
  retries: number;
  timings: AgentTimings;
  errors: AgentErrorPayload[];
  /** 스트리밍 중지 */
  abortController: AbortController;
  tokenUsage?: TokenUsageBreakdown;
};

export type AgentErrorKind =
  | 'intent'
  | 'context'
  | 'provider'
  | 'tool'
  | 'quota'
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'other';

export type AgentErrorPayload = {
  kind: AgentErrorKind;
  code: string;
  message: string;
  retryable: boolean;
  cause?: string;
};

export class AgentError extends Error {
  readonly kind: AgentErrorKind;
  readonly code: string;
  readonly retryable: boolean;
  constructor(kind: AgentErrorKind, code: string, message: string, retryable = false) {
    super(message);
    this.name = 'AgentError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
  toPayload(): AgentErrorPayload {
    return {
      kind: this.kind,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export function emptyAgentState(
  requestId: string,
  serialNo: string,
  userMessage: string,
  isToolContinue: boolean,
  traceId?: string,
): AgentState {
  return {
    traceId: traceId ?? requestId,
    requestId,
    serialNo,
    userMessage,
    isToolContinue,
    intent: null,
    contexts: [],
    tools: [],
    provider: null,
    retries: 0,
    timings: {},
    errors: [],
    abortController: new AbortController(),
  };
}

export function deriveToolMode(tools: ToolDefinition[], isToolContinue: boolean): AgentToolMode {
  if (isToolContinue) return 'download';
  if (tools.some((t) => t.kind === 'download_fc')) return 'download';
  if (tools.some((t) => t.kind === 'native_grounding')) return 'web_search';
  return 'none';
}
