/**
 * AI Lab 로컬 UI 턴(칩·미리듣기) DB persist 헬퍼.
 */
import type { NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import {
  youtubeConfirmSnapshotFromSession,
  type NrmAiLabChatUiMeta,
} from '@/lib/nrmAiLabChatUiMeta';
import { getAiLabYoutubeConfirmSession } from '@/lib/nrmAiLabYoutubeConfirm';
import {
  appendUiChatMessages,
  patchChatMessageUiMeta,
  type AppendUiChatMessageInput,
} from '@/lib/nrmChatClient';
import { logNrmRunError } from '@/lib/nrmDevLog';

function uiMetaForMessage(msg: NrmAiLabMessage): NrmAiLabChatUiMeta | null {
  const choices =
    msg.choices && msg.choices.length > 0
      ? msg.choices.map((c) => ({ id: c.id, label: c.label }))
      : undefined;
  const agentUi = msg.agentUi;
  const ytId = msg.youtubeConfirm?.sessionId?.trim();
  const ytSession = ytId ? getAiLabYoutubeConfirmSession(ytId) : null;
  const youtubeConfirm = ytSession
    ? youtubeConfirmSnapshotFromSession(ytSession)
    : undefined;
  if (!choices && !agentUi && !youtubeConfirm) return null;
  return { choices, agentUi, youtubeConfirm };
}

function isDbMessageId(id: string): boolean {
  return /^\d+$/.test(id.trim());
}

/**
 * 로컬로 붙인 말풍선들을 DB에 저장하고, 저장된 메시지(실제 MessageID)를 반환한다.
 * 세션이 없으면 생성한다.
 */
export async function persistAiLabLocalMessages(params: {
  serialNo: string;
  sessionId: string | null;
  modelId: number;
  messages: NrmAiLabMessage[];
  /** 칩/미리듣기를 제거한 이전 메시지 MessageID(숫자) */
  clearInteractiveMessageIds?: string[];
}): Promise<{ sessionId: string; messages: NrmAiLabMessage[] } | null> {
  const { serialNo, modelId } = params;
  if (!serialNo || !Number.isFinite(modelId)) return null;

  try {
    for (const id of params.clearInteractiveMessageIds ?? []) {
      if (!isDbMessageId(id) || !params.sessionId) continue;
      await patchChatMessageUiMeta({
        serialNo,
        sessionId: params.sessionId,
        messageId: id,
        uiMeta: null,
      });
    }

    const payload: AppendUiChatMessageInput[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
      uiMeta: uiMetaForMessage(m),
    }));
    if (payload.length === 0) {
      return params.sessionId
        ? { sessionId: params.sessionId, messages: [] }
        : null;
    }

    const out = await appendUiChatMessages({
      serialNo,
      sessionId: params.sessionId,
      modelId,
      messages: payload,
    });
    return out;
  } catch (e) {
    logNrmRunError('ailab.chatPersist', e, {
      event: 'persist_local_failed',
      sessionId: params.sessionId,
      count: params.messages.length,
    });
    return null;
  }
}

/** Edge finalize 직후 — 이미 저장된 assistant 행에 choices/agentUi/youtubeConfirm를 붙인다. */
export async function persistAiLabAssistantUiMeta(params: {
  serialNo: string;
  sessionId: string;
  messageId: string;
  message: NrmAiLabMessage;
}): Promise<void> {
  if (!isDbMessageId(params.messageId)) return;
  const uiMeta = uiMetaForMessage(params.message);
  if (!uiMeta) return;
  try {
    await patchChatMessageUiMeta({
      serialNo: params.serialNo,
      sessionId: params.sessionId,
      messageId: params.messageId,
      uiMeta,
    });
  } catch (e) {
    logNrmRunError('ailab.chatPersist', e, {
      event: 'patch_assistant_ui_failed',
      sessionId: params.sessionId,
      messageId: params.messageId,
    });
  }
}
