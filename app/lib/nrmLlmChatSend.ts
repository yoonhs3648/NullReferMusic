/** AI Lab — 채팅 전송 (Edge Function `llm-chat-send` 호출). ApiKey는 서버에서만 사용. */

import { mapMessageRow } from '@/lib/nrmChatClient';
import type { NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION } from '@/lib/nrmSupabaseConfig';
import { getNrmSupabase } from '@/lib/nrmSupabaseClient';
import type { NrmSupabaseChatMessageRow } from '@/lib/nrmSupabaseDatabase.types';

export type NrmLlmChatSendResult = {
  sessionId: string;
  isNewSession: boolean;
  title: string;
  userMessage: NrmAiLabMessage;
  replyMessage: NrmAiLabMessage;
};

const LOG_TAG = 'ailab.llmSend';

export async function sendLlmChatMessage(params: {
  serialNo: string;
  providerId: number;
  sessionId: string | null;
  message: string;
}): Promise<NrmLlmChatSendResult> {
  const { serialNo, providerId, sessionId, message } = params;
  const startedAt = Date.now();

  logNrmDev(LOG_TAG, {
    phase: 'start',
    providerId,
    sessionId: sessionId ?? 'new',
    messageLength: message.length,
  });

  const { data, error } = await getNrmSupabase().functions.invoke(
    NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION,
    {
      body: {
        serialNo,
        providerId,
        sessionId: sessionId != null ? Number(sessionId) : null,
        message,
      },
    },
  );

  const elapsedMs = Date.now() - startedAt;

  if (error) {
    // Edge Function에 아예 도달 못한 경우(오프라인 등) — 서버 로그에는 없음, 여기가 유일한 기록.
    logNrmRunError(LOG_TAG, new Error(error.message), {
      phase: 'invoke_error',
      providerId,
      sessionId: sessionId ?? 'new',
      elapsedMs,
    });
    throw new Error(`llm-chat-send: ${error.message}`);
  }
  if (!data || data.error) {
    // Edge Function이 응답했지만 에러 반환 — requestId로 서버 로그와 대조 가능.
    logNrmRunError(LOG_TAG, new Error(data?.error ?? 'unknown_error'), {
      phase: 'server_error',
      providerId,
      sessionId: sessionId ?? 'new',
      requestId: data?.requestId,
      elapsedMs,
    });
    throw new Error(`llm-chat-send: ${data?.error ?? 'unknown_error'}`);
  }

  const userRow = data.userMessage as NrmSupabaseChatMessageRow;
  const replyRow = data.replyMessage as NrmSupabaseChatMessageRow;

  logNrmDev(LOG_TAG, {
    phase: 'ok',
    sessionId: data.sessionId,
    isNewSession: Boolean(data.isNewSession),
    replyRole: replyRow?.Role,
    requestId: data.requestId,
    elapsedMs,
  });

  return {
    sessionId: String(data.sessionId),
    isNewSession: Boolean(data.isNewSession),
    title: String(data.title ?? '새 대화'),
    userMessage: mapMessageRow(userRow),
    replyMessage: mapMessageRow(replyRow),
  };
}
