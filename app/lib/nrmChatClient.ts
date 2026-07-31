/** AI Lab — ChatSession/ChatMessage 조회·삭제·UI 메타 persist (읽기는 SELECT, 쓰기는 RPC). */

import type { NrmAiLabConversation, NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import { nrmAiLabRelativeTimeLabel } from '@/lib/nrmAiLabChatUi';
import {
  parseAiLabChatUiMeta,
  type NrmAiLabChatUiMeta,
} from '@/lib/nrmAiLabChatUiMeta';
import { stripNrmAiLabSourcesMarker } from '@/lib/nrmAiLabWebSources';
import { sanitizeAiLabUserVisibleContent } from '@/lib/nrmAiLabVisibleContent';
import { hydrateAiLabYoutubeConfirmFromSnapshot } from '@/lib/nrmAiLabYoutubeConfirm';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbRpc, nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import type {
  NrmSupabaseChatMessageRow,
  NrmSupabaseChatSessionRow,
} from '@/lib/nrmSupabaseDatabase.types';

const CHAT_SESSION_LIST_LIMIT = 200;

function mapSessionRow(row: NrmSupabaseChatSessionRow): NrmAiLabConversation {
  const updatedAtIso = String(row.UpdateDate ?? row.RegDate ?? '');
  return {
    id: String(row.SessionID),
    title: String(row.Title ?? '').trim() || '새 대화',
    updatedAtLabel: nrmAiLabRelativeTimeLabel(updatedAtIso),
    updatedAtIso,
    modelId: Number(row.ModelID),
    messages: [],
    messagesLoaded: false,
  };
}

export function mapMessageRow(row: NrmSupabaseChatMessageRow): NrmAiLabMessage {
  const role = row.Role === 'assistant' ? 'assistant' : row.Role === 'system' ? 'system' : 'user';
  const uiMeta = parseAiLabChatUiMeta(row.UiMeta);
  const youtubeSnap = uiMeta?.youtubeConfirm;
  if (youtubeSnap) {
    try {
      hydrateAiLabYoutubeConfirmFromSnapshot(youtubeSnap);
    } catch (e) {
      logNrmRunError('ailab.chatUiMeta', e, {
        event: 'hydrate_youtube_failed',
        sessionId: youtubeSnap.sessionId,
      });
    }
  }
  return {
    id: String(row.MessageID),
    role,
    content: sanitizeAiLabUserVisibleContent(
      stripNrmAiLabSourcesMarker(String(row.Content ?? '')),
    ),
    choices: uiMeta?.choices,
    agentUi: uiMeta?.agentUi,
    youtubeConfirm: youtubeSnap ? { sessionId: youtubeSnap.sessionId } : undefined,
  };
}

/** 세션 목록 — 최근 대화(UpdateDate) 순. IX_ChatSession_UpdateDate 인덱스 활용. */
export async function fetchChatSessions(serialNo: string): Promise<NrmAiLabConversation[]> {
  if (!serialNo) return [];
  const rows = await nrmSbSelect<NrmSupabaseChatSessionRow>(
    NRM_SUPABASE_TABLES.chatSession,
    (q) =>
      q
        .select('SessionID,SerialNo,ProviderID,ModelID,Title,IsDeleted,RegDate,UpdateDate')
        .eq('SerialNo', serialNo)
        .eq('IsDeleted', false)
        .order('UpdateDate', { ascending: false })
        .limit(CHAT_SESSION_LIST_LIMIT),
  );
  return rows.map(mapSessionRow);
}

/** 특정 세션의 전체 메시지 — MessageID(=시간) 오름차순. IX_ChatMessage_SessionID 인덱스 활용. */
export async function fetchChatMessages(sessionId: string): Promise<NrmAiLabMessage[]> {
  const rows = await nrmSbSelect<NrmSupabaseChatMessageRow>(
    NRM_SUPABASE_TABLES.chatMessage,
    (q) =>
      q
        .select(
          'MessageID,SessionID,Role,Content,InputToken,OutputToken,TotalToken,RegDate,UiMeta',
        )
        .eq('SessionID', Number(sessionId))
        .order('MessageID', { ascending: true }),
  );
  return rows.map(mapMessageRow);
}

export async function deleteChatSession(serialNo: string, sessionId: string): Promise<void> {
  await nrmSbRpc<void>('nrm_rpc_chat_delete_session', {
    p_serial_no: serialNo,
    p_session_id: Number(sessionId),
  });
}

export type AppendUiChatMessageInput = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  uiMeta?: NrmAiLabChatUiMeta | null;
};

export type AppendUiChatMessagesResult = {
  sessionId: string;
  messages: NrmAiLabMessage[];
};

/**
 * 칩·미리듣기 등 로컬 UI 턴을 DB에 저장한다.
 * sessionId가 없으면(새 대화) modelId로 세션을 만들고 반환한다.
 */
export async function appendUiChatMessages(params: {
  serialNo: string;
  sessionId: string | null;
  modelId: number;
  messages: AppendUiChatMessageInput[];
}): Promise<AppendUiChatMessagesResult> {
  const payload = params.messages.map((m) => ({
    role: m.role,
    content: m.content,
    uiMeta: m.uiMeta ?? null,
  }));
  const raw = await nrmSbRpc<{
    sessionId?: number | string;
    messages?: NrmSupabaseChatMessageRow[];
  }>('nrm_rpc_chat_append_ui_messages', {
    p_serial_no: params.serialNo,
    p_session_id: params.sessionId ? Number(params.sessionId) : null,
    p_model_id: params.modelId,
    p_messages: payload,
  });
  const sessionId = String(raw?.sessionId ?? params.sessionId ?? '').trim();
  const rows = Array.isArray(raw?.messages) ? raw.messages : [];
  return {
    sessionId,
    messages: rows.map(mapMessageRow),
  };
}

/** 기존 메시지 UiMeta 갱신(칩 제거 / choices·youtubeConfirm 부착). */
export async function patchChatMessageUiMeta(params: {
  serialNo: string;
  sessionId: string;
  messageId: string;
  uiMeta: NrmAiLabChatUiMeta | null;
}): Promise<NrmAiLabMessage | null> {
  const idNum = Number(params.messageId);
  if (!Number.isFinite(idNum)) return null;
  const row = await nrmSbRpc<NrmSupabaseChatMessageRow>(
    'nrm_rpc_chat_patch_message_ui_meta',
    {
      p_serial_no: params.serialNo,
      p_session_id: Number(params.sessionId),
      p_message_id: idNum,
      p_ui_meta: params.uiMeta,
    },
  );
  return row ? mapMessageRow(row) : null;
}
