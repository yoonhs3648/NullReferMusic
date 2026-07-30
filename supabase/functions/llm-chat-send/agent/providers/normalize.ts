/**
 * Provider 응답 정규화 — Executor는 Provider 종류를 모른다.
 */

export type NormalizedToolCall = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

export type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  thoughtsTokens?: number;
  /** Observability 세부 */
  promptTokens?: number;
  contextTokens?: number;
  searchTokens?: number;
};

export type NormalizedFinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'error'
  | 'unknown'
  | string;

export type NormalizedResponse =
  | {
    ok: true;
    text: string;
    toolCalls: NormalizedToolCall[];
    usage: NormalizedUsage;
    finishReason: NormalizedFinishReason;
    citations?: string[];
    grounded?: boolean;
    groundedQueryCount?: number;
    needsWebSearch: boolean;
    /** Gemini Interactions FC continue용 interaction.id */
    interactionId?: string | null;
    /** 원본 Provider payload (디버그) */
    // deno-lint-ignore no-explicit-any
    raw?: any;
    // deno-lint-ignore no-explicit-any
    attempts?: any[];
  }
  | {
    ok: false;
    kind: 'auth' | 'network' | 'rate_limit' | 'other' | 'timeout' | 'cancelled';
    status?: number;
    message: string;
    needsWebSearch: boolean;
    interactionId?: string | null;
    // deno-lint-ignore no-explicit-any
    attempts?: any[];
    // deno-lint-ignore no-explicit-any
    raw?: any;
  };

/** 기존 ProviderStreamResult / AdapterResult → NormalizedResponse */
export function normalizeProviderResult(
  // deno-lint-ignore no-explicit-any
  result: any,
): NormalizedResponse {
  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      kind: 'other',
      message: 'empty_provider_result',
      needsWebSearch: false,
    };
  }

  if (result.ok === true) {
    const finish = result.finishReason;
    let finishReason: NormalizedFinishReason = 'unknown';
    if (typeof finish === 'string' && finish) {
      const f = finish.toLowerCase();
      if (f.includes('stop') || f === 'end_turn') finishReason = 'stop';
      else if (f.includes('length') || f.includes('max')) finishReason = 'length';
      else if (f.includes('tool')) finishReason = 'tool_calls';
      else finishReason = finish;
    } else if (Array.isArray(result.functionCalls) && result.functionCalls.length > 0) {
      finishReason = 'tool_calls';
    } else {
      finishReason = 'stop';
    }

    const toolCalls: NormalizedToolCall[] = Array.isArray(result.functionCalls)
      ? result.functionCalls.map((fc: {
        callId?: string;
        name?: string;
        args?: Record<string, unknown>;
      }) => ({
        callId: String(fc.callId ?? ''),
        name: String(fc.name ?? ''),
        args: fc.args && typeof fc.args === 'object' ? fc.args : {},
      }))
      : [];

    return {
      ok: true,
      text: String(result.text ?? ''),
      toolCalls,
      usage: {
        inputTokens: Number(result.inputTokens ?? 0),
        outputTokens: Number(result.outputTokens ?? 0),
        totalTokens: Number(result.totalTokens ?? 0),
        thoughtsTokens: result.thoughtsTokens != null ? Number(result.thoughtsTokens) : undefined,
      },
      finishReason,
      grounded: result.grounded === true,
      groundedQueryCount: Number(result.groundedQueryCount ?? 0),
      needsWebSearch: result.needsWebSearch === true,
      interactionId: typeof result.interactionId === 'string' ? result.interactionId : null,
      attempts: result.attempts,
      raw: result,
    };
  }

  const kindRaw = String(result.kind ?? 'other');
  const kind =
    kindRaw === 'auth' ||
      kindRaw === 'network' ||
      kindRaw === 'rate_limit' ||
      kindRaw === 'timeout' ||
      kindRaw === 'cancelled'
      ? kindRaw
      : 'other';

  return {
    ok: false,
    kind,
    status: typeof result.status === 'number' ? result.status : undefined,
    message: String(result.message ?? 'provider_error'),
    needsWebSearch: result.needsWebSearch === true,
    interactionId: typeof result.interactionId === 'string' ? result.interactionId : null,
    attempts: result.attempts,
    raw: result,
  };
}

/** index.ts 레거시 경로 호환: Normalized → Adapter-like */
export function denormalizeToLegacyAdapterShape(n: NormalizedResponse): Record<string, unknown> {
  if (n.ok) {
    return {
      ok: true,
      text: n.text,
      inputTokens: n.usage.inputTokens,
      outputTokens: n.usage.outputTokens,
      totalTokens: n.usage.totalTokens,
      thoughtsTokens: n.usage.thoughtsTokens,
      finishReason: n.finishReason,
      grounded: n.grounded,
      groundedQueryCount: n.groundedQueryCount,
      functionCalls: n.toolCalls,
      needsWebSearch: n.needsWebSearch,
      interactionId: n.interactionId ?? null,
      attempts: n.attempts ?? [],
    };
  }
  return {
    ok: false,
    kind: n.kind === 'timeout' || n.kind === 'cancelled' ? 'network' : n.kind,
    status: n.status,
    message: n.message,
    needsWebSearch: n.needsWebSearch,
    interactionId: n.interactionId ?? null,
    attempts: n.attempts ?? [],
  };
}
