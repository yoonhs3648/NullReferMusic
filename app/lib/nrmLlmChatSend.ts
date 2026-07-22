/**
 * AI Lab — 채팅 전송 (Edge Function `llm-chat-send` 호출, NDJSON 스트리밍).
 *
 * ApiKey는 서버에서만 사용한다. 응답을 "타이핑 효과"로 보여주기 위해 실제 LLM
 * 스트리밍 조각을 그대로 릴레이받는데, `@supabase/supabase-js`의
 * `functions.invoke()`는 React Native 기본 fetch로 응답을 통째로 버퍼링해서
 * 스트리밍을 못 쓴다. 그래서 이 호출만 `expo/fetch`(진짜 스트리밍 body를 지원하는
 * 네이티브 구현)로 직접 Edge Function URL을 호출한다.
 *
 * 프로토콜(서버: `supabase/functions/llm-chat-send/index.ts` 상단 주석 참고) —
 * 줄바꿈으로 구분된 JSON(NDJSON) 이벤트:
 *   meta  → 세션/사용자 메시지 확정 (가장 먼저, 권한 체크 전)
 *   delta → 어시스턴트 답변 조각(0회 이상) — 타이핑 효과
 *   final → 이번 턴의 최종 메시지(assistant 또는 system) 확정, 스트림 종료
 *   error → 복구 불가 오류(최종 메시지 없이 종료될 수 있음)
 */

import { fetch as expoFetch } from 'expo/fetch';

import { mapMessageRow } from '@/lib/nrmChatClient';
import type { NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import {
  NRM_SUPABASE_PUBLISHABLE_KEY,
  getNrmSupabaseFunctionUrl,
  NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION,
} from '@/lib/nrmSupabaseConfig';
import type { NrmSupabaseChatMessageRow } from '@/lib/nrmSupabaseDatabase.types';

const LOG_TAG = 'ailab.llmSend';

/**
 * 실패 원인 분류 — 클라이언트가 예전엔 모든 실패를 동일한 "네트워크 문제" 문구로
 * 뭉뚱그려 보여줬다. 실제로는 fetch 자체가 안 된 것/서버가 에러를 준 것/스트리밍
 * 중간에 연결이 끊긴 것이 전혀 다른 상황이라, 호출자(UI)가 구분해서 안내할 수
 * 있도록 에러에 code를 붙인다.
 *
 *   fetch_error  — expo/fetch 호출 자체가 실패(진짜 네트워크/연결 문제)
 *   http_error   — 서버가 비-2xx 응답(게이트웨이/인증/5xx 등)
 *   stream_error — 스트림 읽기 중 예외 또는 서버가 NDJSON error 이벤트를 보냄
 *   no_final     — 스트림은 끝났는데 final 이벤트를 못 받음(중간에 연결 끊김)
 */
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
};

export type NrmLlmChatSendHandlers = {
  onMeta?: (event: NrmLlmChatMetaEvent) => void;
  onDelta?: (text: string) => void;
  onFinal?: (event: NrmLlmChatFinalEvent) => void;
};

function parseLine(
  line: string,
): { type: 'meta' | 'delta' | 'final' | 'error'; raw: Record<string, unknown> } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    if (raw && typeof raw.type === 'string') {
      return { type: raw.type as 'meta' | 'delta' | 'final' | 'error', raw };
    }
  } catch {
    // 손상된 줄(네트워크 조각 경계 등)은 조용히 무시 — 다음 줄부터 계속 처리.
  }
  return null;
}

export async function sendLlmChatMessageStream(
  params: {
    serialNo: string;
    modelId: number;
    sessionId: string | null;
    message: string;
  },
  handlers: NrmLlmChatSendHandlers,
): Promise<void> {
  const { serialNo, modelId, sessionId, message } = params;
  const startedAt = Date.now();

  logNrmDev(LOG_TAG, {
    phase: 'start',
    modelId,
    sessionId: sessionId ?? 'new',
    messageLength: message.length,
  });

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
        message,
      }),
    });
  } catch (e) {
    const elapsedMs = Date.now() - startedAt;
    logNrmRunError(LOG_TAG, e instanceof Error ? e : new Error(String(e)), {
      phase: 'fetch_error',
      modelId,
      sessionId: sessionId ?? 'new',
      elapsedMs,
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
      // JSON이 아니면 원문 그대로 사용
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
  let gotAnyEvent = false;
  let finalRequestId: string | undefined;

  const dispatch = (parsed: { type: 'meta' | 'delta' | 'final' | 'error'; raw: Record<string, unknown> }) => {
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
    if (parsed.type === 'final') {
      sawFinal = true;
      const raw = parsed.raw;
      finalRequestId = String(raw.requestId ?? '');
      handlers.onFinal?.({
        type: 'final',
        requestId: finalRequestId,
        sessionId: String(raw.sessionId ?? ''),
        isNewSession: Boolean(raw.isNewSession),
        title: String(raw.title ?? '새 대화'),
        message: mapMessageRow(raw.message as NrmSupabaseChatMessageRow),
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

  if (!sawFinal) {
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
  });
}
