/**
 * AI Lab 로컬 UI 턴(칩·미리듣기) DB persist 헬퍼.
 */
import type { NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import {
  youtubeConfirmSnapshotFromSession,
  type AiLabYoutubeConfirmPersistSnapshot,
  type NrmAiLabChatUiMeta,
} from '@/lib/nrmAiLabChatUiMeta';
import {
  getAiLabYoutubeConfirmPersistSnapshot,
  getAiLabYoutubeConfirmSession,
} from '@/lib/nrmAiLabYoutubeConfirm';
import {
  appendUiChatMessages,
  patchChatMessageUiMeta,
  type AppendUiChatMessageInput,
} from '@/lib/nrmChatClient';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

function resolveYoutubeSnapshot(
  ytId: string | undefined,
): AiLabYoutubeConfirmPersistSnapshot | undefined {
  const id = ytId?.trim();
  if (!id) return undefined;
  const fromCache = getAiLabYoutubeConfirmPersistSnapshot(id);
  if (fromCache) return fromCache as AiLabYoutubeConfirmPersistSnapshot;
  const live = getAiLabYoutubeConfirmSession(id);
  if (live) return youtubeConfirmSnapshotFromSession(live);
  return undefined;
}

function uiMetaForMessage(msg: NrmAiLabMessage): NrmAiLabChatUiMeta | null {
  const choices =
    msg.choices && msg.choices.length > 0
      ? msg.choices.map((c) => ({ id: c.id, label: c.label }))
      : undefined;
  const agentUi = msg.agentUi;
  const ytId = msg.youtubeConfirm?.sessionId?.trim();
  const youtubeConfirm = resolveYoutubeSnapshot(ytId);
  if (ytId && !youtubeConfirm) {
    logNrmRunError('ailab.chatPersist', new Error('youtube_session_missing'), {
      event: 'ui_meta_skip_youtube',
      ytId,
    });
  }
  if (!choices && !agentUi && !youtubeConfirm) return null;
  return { choices, agentUi, youtubeConfirm };
}

function isDbMessageId(id: string): boolean {
  return /^\d+$/.test(id.trim());
}

function youtubeOnlyUiMetaFromMessage(
  msg: NrmAiLabMessage | undefined,
): NrmAiLabChatUiMeta | null {
  const ytId = msg?.youtubeConfirm?.sessionId?.trim();
  if (!ytId) return null;
  const youtubeConfirm = resolveYoutubeSnapshot(ytId);
  if (!youtubeConfirm) return null;
  if (youtubeConfirm.confirmed || youtubeConfirm.exhausted) return null;
  return { youtubeConfirm };
}

async function resolveYoutubeSnapshotWithRetry(
  ytId: string,
): Promise<AiLabYoutubeConfirmPersistSnapshot | undefined> {
  let snap = resolveYoutubeSnapshot(ytId);
  if (snap) return snap;
  for (const ms of [30, 80, 150]) {
    await new Promise((r) => setTimeout(r, ms));
    snap = resolveYoutubeSnapshot(ytId);
    if (snap) return snap;
  }
  return undefined;
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
  /** 칩/미리듣기를 제거·갱신할 이전 메시지 MessageID(숫자) */
  clearInteractiveMessageIds?: string[];
  /**
   * `all`(기본): UiMeta 전체 null — 맞다/아니다 후.
   * `choices`: choices/agentUi만 제거하고 youtubeConfirm 스냅샷은 유지.
   */
  clearInteractiveMode?: 'all' | 'choices';
  /** mode=choices 일 때 youtubeConfirm 유지용 원본 말풍선 */
  clearInteractiveSourceMessages?: NrmAiLabMessage[];
}): Promise<{ sessionId: string; messages: NrmAiLabMessage[] } | null> {
  const { serialNo, modelId } = params;
  if (!serialNo || !Number.isFinite(modelId)) return null;
  const clearMode = params.clearInteractiveMode ?? 'all';

  try {
    for (const id of params.clearInteractiveMessageIds ?? []) {
      if (!isDbMessageId(id) || !params.sessionId) continue;
      let uiMeta: NrmAiLabChatUiMeta | null = null;
      if (clearMode === 'choices') {
        const src = (params.clearInteractiveSourceMessages ?? []).find(
          (m) => m.id === id || m.persistId === id,
        );
        uiMeta = youtubeOnlyUiMetaFromMessage(src);
      }
      await patchChatMessageUiMeta({
        serialNo,
        sessionId: params.sessionId,
        messageId: id,
        uiMeta,
      });
    }

    const payload: AppendUiChatMessageInput[] = [];
    for (const m of params.messages) {
      const ytId = m.youtubeConfirm?.sessionId?.trim();
      let uiMeta = uiMetaForMessage(m);
      if (ytId && !uiMeta?.youtubeConfirm) {
        const snap = await resolveYoutubeSnapshotWithRetry(ytId);
        if (snap) {
          uiMeta = {
            ...(uiMeta ?? {}),
            youtubeConfirm: snap,
          };
        }
      }
      if (ytId && !uiMeta?.youtubeConfirm) {
        logNrmRunError('ailab.chatPersist', new Error('youtube_snapshot_unavailable'), {
          event: 'persist_youtube_meta_missing',
          ytId,
          contentLen: (m.content || '').trim().length,
        });
        // 플레이어 메타 없이 안내 문구만 넣으면 재진입 시 복구 불가 — 스킵
        continue;
      }
      payload.push({
        role: m.role,
        content: m.content,
        uiMeta,
      });
    }
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
    const missingYt = out.messages.some((saved, i) => {
      const wanted = payload[i]?.uiMeta?.youtubeConfirm?.sessionId;
      return Boolean(wanted) && !saved.youtubeConfirm?.sessionId;
    });
    if (missingYt) {
      logNrmRunError('ailab.chatPersist', new Error('youtube_meta_not_echoed'), {
        event: 'append_ui_meta_lost',
        sessionId: out.sessionId,
      });
      // append 응답에 없어도 DB에는 들어갔을 수 있음 — 각 행에 patch 재시도
      for (let i = 0; i < out.messages.length; i += 1) {
        const saved = out.messages[i];
        const wanted = payload[i]?.uiMeta;
        if (!wanted?.youtubeConfirm || saved.youtubeConfirm?.sessionId) continue;
        if (!isDbMessageId(saved.id)) continue;
        await patchChatMessageUiMeta({
          serialNo,
          sessionId: out.sessionId,
          messageId: saved.id,
          uiMeta: wanted,
        });
      }
    } else {
      logNrmDev('ailab.chatPersist', {
        event: 'append_ui_ok',
        sessionId: out.sessionId,
        count: out.messages.length,
        withYoutube: payload.filter((p) => p.uiMeta?.youtubeConfirm).length,
      });
    }
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
  const ytId = params.message.youtubeConfirm?.sessionId?.trim();
  let uiMeta = uiMetaForMessage(params.message);
  if (ytId && !uiMeta?.youtubeConfirm) {
    const snap = await resolveYoutubeSnapshotWithRetry(ytId);
    if (snap) {
      uiMeta = { ...(uiMeta ?? {}), youtubeConfirm: snap };
    }
  }
  if (!uiMeta) return;
  if (ytId && !uiMeta.youtubeConfirm) {
    logNrmRunError('ailab.chatPersist', new Error('youtube_snapshot_unavailable'), {
      event: 'patch_assistant_youtube_missing',
      sessionId: params.sessionId,
      messageId: params.messageId,
      ytId,
    });
    return;
  }
  try {
    const patched = await patchChatMessageUiMeta({
      serialNo: params.serialNo,
      sessionId: params.sessionId,
      messageId: params.messageId,
      uiMeta,
    });
    if (ytId && !patched?.youtubeConfirm?.sessionId) {
      logNrmRunError('ailab.chatPersist', new Error('youtube_meta_patch_lost'), {
        event: 'patch_assistant_ui_echo_missing',
        sessionId: params.sessionId,
        messageId: params.messageId,
        ytId,
      });
    } else {
      logNrmDev('ailab.chatPersist', {
        event: 'patch_assistant_ui_ok',
        sessionId: params.sessionId,
        messageId: params.messageId,
        hasYoutube: Boolean(uiMeta.youtubeConfirm),
      });
    }
  } catch (e) {
    logNrmRunError('ailab.chatPersist', e, {
      event: 'patch_assistant_ui_failed',
      sessionId: params.sessionId,
      messageId: params.messageId,
    });
  }
}

/**
 * 미리듣기 말풍선 저장.
 * - 이미 DB MessageID면 UiMeta PATCH (중복 INSERT 방지)
 * - temp id면 append
 */
export async function persistAiLabYoutubeConfirmHost(params: {
  serialNo: string;
  sessionId: string | null;
  modelId: number;
  hostMsg: NrmAiLabMessage;
}): Promise<{ sessionId: string; messages: NrmAiLabMessage[] } | null> {
  const ytId = params.hostMsg.youtubeConfirm?.sessionId?.trim();
  if (!ytId) return null;
  const dbId =
    (params.hostMsg.persistId && isDbMessageId(params.hostMsg.persistId)
      ? params.hostMsg.persistId
      : null) ||
    (isDbMessageId(params.hostMsg.id) ? params.hostMsg.id : null);

  if (dbId && params.sessionId && isDbMessageId(params.sessionId)) {
    await persistAiLabAssistantUiMeta({
      serialNo: params.serialNo,
      sessionId: params.sessionId,
      messageId: dbId,
      message: params.hostMsg,
    });
    return {
      sessionId: params.sessionId,
      messages: [
        {
          ...params.hostMsg,
          id: dbId,
          persistId: dbId,
          youtubeConfirm: { sessionId: ytId },
        },
      ],
    };
  }

  return persistAiLabLocalMessages({
    serialNo: params.serialNo,
    sessionId: params.sessionId,
    modelId: params.modelId,
    messages: [params.hostMsg],
  });
}
