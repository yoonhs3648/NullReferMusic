/**
 * AI Lab — 채팅 전송 (Edge Function `llm-chat-send` 호출, NDJSON 스트리밍).
 *
 * 프로토콜:
 *   meta        → 세션/사용자 메시지 확정
 *   delta       → 어시스턴트 답변 조각
 *   tool_request→ 클라이언트가 실행할 function call
 *   tool_turn_end → tool_request 후 스트림 종료(이어서 toolResults로 재호출)
 *                 (+ optional previousInteractionId: Gemini Interactions FC)
 *   final       → 최종 메시지 (+ optional choices 칩)
 *   error       → 복구 불가 오류
 */

import { fetch as expoFetch } from 'expo/fetch';

import { mapMessageRow } from '@/lib/nrmChatClient';
import type { NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import type { NrmAiLabChoice } from '@/lib/nrmAiLabDownloadTools';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import {
  NRM_SUPABASE_PUBLISHABLE_KEY,
  getNrmSupabaseFunctionUrl,
  NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION,
} from '@/lib/nrmSupabaseConfig';
import type { NrmSupabaseChatMessageRow } from '@/lib/nrmSupabaseDatabase.types';

const LOG_TAG = 'ailab.llmSend';

export type NrmLlmChatSendErrorCode = 'fetch_error' | 'http_error' | 'stream_error' | 'no_final';

export class NrmLlmChatSendError extends Error {
  readonly code: NrmLlmChatSendErrorCode;
  constructor(code: NrmLlmChatSendErrorCode, message: string) {
    super(message);
    this.name = 'NrmLlmChatSendError';
    this.code = code;
  }
}

export type NrmLlmChatMetaEvent = {
  type: 'meta';
  requestId: string;
  sessionId: string;
  isNewSession: boolean;
  title: string;
  userMessage: NrmAiLabMessage;
};

export type NrmLlmChatFinalEvent = {
  type: 'final';
  requestId: string;
  sessionId: string;
  isNewSession: boolean;
  title: string;
  message: NrmAiLabMessage;
  choices?: NrmAiLabChoice[];
  /** Edge final.diag (agentResponse.ui / evaluation) */
  diag?: unknown;
};

export type NrmLlmToolRequestEvent = {
  type: 'tool_request';
  requestId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

export type NrmLlmToolResultPayload = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  response: Record<string, unknown>;
};

export type NrmLlmChatSendHandlers = {
  onMeta?: (event: NrmLlmChatMetaEvent) => void;
  onDelta?: (text: string) => void;
  onToolRequest?: (event: NrmLlmToolRequestEvent) => void;
  onFinal?: (event: NrmLlmChatFinalEvent) => void;
  /** 새 세션 LLM 요약 제목 — 좌측 대화 목록 갱신 */
  onTitleUpdated?: (event: { sessionId: string; title: string }) => void;
};

type ParseType = 'meta' | 'delta' | 'final' | 'error' | 'tool_request' | 'tool_turn_end' | 'title_updated';

function parseLine(line: string): { type: ParseType; raw: Record<string, unknown> } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    if (raw && typeof raw.type === 'string') {
      return { type: raw.type as ParseType, raw };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function sendLlmChatMessageStream(
  params: {
    serialNo: string;
    modelId: number;
    sessionId: string | null;
    message: string;
    /** @deprecated 서버 Intent가 검색을 결정. 전송 body에 넣지 않음. */
    enableWebSearch?: boolean;
    toolContinue?: boolean;
    toolResults?: NrmLlmToolResultPayload[];
    /** Gemini Interactions: toolContinue 시 previous_interaction_id */
    previousInteractionId?: string | null;
    /** AI Lab 선택/명시 음악 플랫폼 */
    musicPlatformId?: string;
    musicPlatformLabel?: string;
    musicPlatformBlocked?: boolean;
    musicPlatformExplicit?: boolean;
  },
  handlers: NrmLlmChatSendHandlers,
): Promise<{
  kind: 'final' | 'tool_turn';
  requestId?: string;
  /** tool_turn 시 Gemini Interactions previous_interaction_id */
  previousInteractionId?: string | null;
}> {
  const {
    serialNo,
    modelId,
    sessionId,
    message,
    toolContinue,
    toolResults,
    previousInteractionId,
    musicPlatformId,
    musicPlatformLabel,
    musicPlatformBlocked,
    musicPlatformExplicit,
  } = params;
  const startedAt = Date.now();
  const isToolContinue = toolContinue === true && (toolResults?.length ?? 0) > 0;

  logNrmDev(LOG_TAG, {
    phase: 'start',
    modelId,
    sessionId: sessionId ?? 'new',
    messageLength: message.length,
    toolContinue: isToolContinue,
    toolResultCount: toolResults?.length ?? 0,
  });

  if (!isToolContinue && !message.trim()) {
    throw new NrmLlmChatSendError('stream_error', 'llm-chat-send: empty_message');
  }
  if (isToolContinue && (sessionId == null || sessionId === '')) {
    throw new NrmLlmChatSendError('stream_error', 'llm-chat-send: tool_continue_needs_session');
  }

  const url = getNrmSupabaseFunctionUrl(NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION);
  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NRM_SUPABASE_PUBLISHABLE_KEY}`,
        apikey: NRM_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        serialNo,
        modelId,
        sessionId: sessionId != null ? Number(sessionId) : null,
        message: isToolContinue ? '' : message,
        toolContinue: isToolContinue,
        toolResults: isToolContinue ? toolResults : undefined,
        previousInteractionId:
          isToolContinue && previousInteractionId ? previousInteractionId : undefined,
        musicPlatformId: musicPlatformId ?? null,
        musicPlatformLabel: musicPlatformLabel ?? null,
        musicPlatformBlocked: musicPlatformBlocked === true,
        musicPlatformExplicit: musicPlatformExplicit === true,
      }),
    });
  } catch (e) {
    logNrmRunError(LOG_TAG, e instanceof Error ? e : new Error(String(e)), {
      phase: 'fetch_error',
      modelId,
      sessionId: sessionId ?? 'new',
      elapsedMs: Date.now() - startedAt,
    });
    throw new NrmLlmChatSendError(
      'fetch_error',
      `llm-chat-send: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    let requestId: string | undefined;
    let errMessage = bodyText;
    try {
      const parsed = JSON.parse(bodyText) as { error?: string; message?: string; requestId?: string };
      requestId = parsed.requestId;
      errMessage = parsed.message ?? parsed.error ?? bodyText;
    } catch {
      // ignore
    }
    logNrmRunError(LOG_TAG, new Error(errMessage || `http_${res.status}`), {
      phase: 'server_error',
      modelId,
      sessionId: sessionId ?? 'new',
      requestId,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
    });
    throw new NrmLlmChatSendError(
      'http_error',
      `llm-chat-send: ${errMessage || `http_${res.status}`}`,
    );
  }

  if (!res.body) {
    throw new NrmLlmChatSendError('stream_error', 'llm-chat-send: no_response_body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawFinal = false;
  let sawToolTurnEnd = false;
  let gotAnyEvent = false;
  let finalRequestId: string | undefined;
  let toolTurnPreviousInteractionId: string | null = null;

  const dispatch = (parsed: { type: ParseType; raw: Record<string, unknown> }) => {
    gotAnyEvent = true;
    if (parsed.type === 'meta') {
      const raw = parsed.raw;
      handlers.onMeta?.({
        type: 'meta',
        requestId: String(raw.requestId ?? ''),
        sessionId: String(raw.sessionId ?? ''),
        isNewSession: Boolean(raw.isNewSession),
        title: String(raw.title ?? '새 대화'),
        userMessage: mapMessageRow(raw.userMessage as NrmSupabaseChatMessageRow),
      });
      return;
    }
    if (parsed.type === 'delta') {
      const text = String(parsed.raw.text ?? '');
      if (text) handlers.onDelta?.(text);
      return;
    }
    if (parsed.type === 'tool_request') {
      const raw = parsed.raw;
      finalRequestId = String(raw.requestId ?? finalRequestId ?? '');
      let args: Record<string, unknown> = {};
      const rawArgs = raw.args;
      if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
        args = rawArgs as Record<string, unknown>;
      } else if (typeof rawArgs === 'string') {
        try {
          args = JSON.parse(rawArgs) as Record<string, unknown>;
        } catch {
          args = {};
        }
      }
      handlers.onToolRequest?.({
        type: 'tool_request',
        requestId: finalRequestId,
        callId: String(raw.callId ?? ''),
        name: String(raw.name ?? ''),
        args,
      });
      return;
    }
    if (parsed.type === 'tool_turn_end') {
      sawToolTurnEnd = true;
      finalRequestId = String(parsed.raw.requestId ?? finalRequestId ?? '');
      const pid = String(parsed.raw.previousInteractionId ?? '').trim();
      toolTurnPreviousInteractionId = pid || null;
      return;
    }
    if (parsed.type === 'title_updated') {
      const sid = String(parsed.raw.sessionId ?? '').trim();
      const title = String(parsed.raw.title ?? '').trim();
      if (sid && title) {
        handlers.onTitleUpdated?.({ sessionId: sid, title });
      }
      return;
    }
    if (parsed.type === 'final') {
      sawFinal = true;
      const raw = parsed.raw;
      finalRequestId = String(raw.requestId ?? '');
      const message = mapMessageRow(raw.message as NrmSupabaseChatMessageRow);
      const choicesRaw = raw.choices;
      const choices: NrmAiLabChoice[] | undefined = Array.isArray(choicesRaw)
        ? choicesRaw
            .map((c) => {
              if (!c || typeof c !== 'object') return null;
              const row = c as { id?: unknown; label?: unknown };
              const id = String(row.id ?? '').trim();
              const label = String(row.label ?? '').trim();
              if (!id || !label) return null;
              return { id, label };
            })
            .filter((c): c is NrmAiLabChoice => c != null)
        : undefined;
      handlers.onFinal?.({
        type: 'final',
        requestId: finalRequestId,
        sessionId: String(raw.sessionId ?? ''),
        isNewSession: Boolean(raw.isNewSession),
        title: String(raw.title ?? '새 대화'),
        message,
        choices,
        diag: raw.diag ?? null,
      });
      logNrmDev(LOG_TAG, {
        phase: 'final',
        modelId,
        sessionId: sessionId ?? 'new',
        requestId: finalRequestId,
        role: message.role,
        contentPreview: String(message.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        choiceCount: choices?.length ?? 0,
        agentUi: (raw.diag as { agentResponse?: { ui?: unknown } } | null)?.agentResponse?.ui ?? null,
        evaluation:
          (raw.diag as { agentResponse?: { evaluation?: unknown } } | null)?.agentResponse?.evaluation ??
          null,
        diag: raw.diag ?? null,
      });
      return;
    }
    if (parsed.type === 'error') {
      finalRequestId = String(parsed.raw.requestId ?? finalRequestId ?? '');
      throw new NrmLlmChatSendError(
        'stream_error',
        `llm-chat-send: ${String(parsed.raw.message ?? 'unknown_stream_error')}`,
      );
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const parsed = parseLine(line);
        if (parsed) dispatch(parsed);
      }
    }
    const trailing = parseLine(buffer);
    if (trailing) dispatch(trailing);
  } catch (e) {
    void reader.cancel().catch(() => {});
    const err =
      e instanceof NrmLlmChatSendError
        ? e
        : new NrmLlmChatSendError(
            'stream_error',
            e instanceof Error ? e.message : String(e),
          );
    logNrmRunError(LOG_TAG, err, {
      phase: 'stream_error',
      modelId,
      sessionId: sessionId ?? 'new',
      requestId: finalRequestId,
      elapsedMs: Date.now() - startedAt,
    });
    throw err;
  }

  if (!sawFinal && !sawToolTurnEnd) {
    const err = new NrmLlmChatSendError(
      'no_final',
      `llm-chat-send: stream_ended_without_final${gotAnyEvent ? '' : '_no_events'}`,
    );
    logNrmRunError(LOG_TAG, err, {
      phase: 'no_final',
      modelId,
      sessionId: sessionId ?? 'new',
      requestId: finalRequestId,
      elapsedMs: Date.now() - startedAt,
    });
    throw err;
  }

  logNrmDev(LOG_TAG, {
    phase: 'ok',
    modelId,
    sessionId: sessionId ?? 'new',
    requestId: finalRequestId,
    elapsedMs: Date.now() - startedAt,
    kind: sawToolTurnEnd && !sawFinal ? 'tool_turn' : 'final',
  });

  return {
    kind: sawToolTurnEnd && !sawFinal ? 'tool_turn' : 'final',
    requestId: finalRequestId,
    previousInteractionId:
      sawToolTurnEnd && !sawFinal ? toolTurnPreviousInteractionId : undefined,
  };
}
