/** AI Lab — ChatSession/ChatMessage 조회·삭제 (읽기는 SELECT 정책, 삭제는 RPC). */

import type { NrmAiLabConversation, NrmAiLabMessage } from '@/lib/nrmAiLabChatUi';
import { nrmAiLabRelativeTimeLabel } from '@/lib/nrmAiLabChatUi';
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
    providerId: Number(row.ProviderID),
    messages: [],
    messagesLoaded: false,
  };
}

export function mapMessageRow(row: NrmSupabaseChatMessageRow): NrmAiLabMessage {
  const role = row.Role === 'assistant' ? 'assistant' : row.Role === 'system' ? 'system' : 'user';
  return {
    id: String(row.MessageID),
    role,
    content: String(row.Content ?? ''),
  };
}

/** 세션 목록 — 최근 대화(UpdateDate) 순. IX_ChatSession_UpdateDate 인덱스 활용. */
export async function fetchChatSessions(serialNo: string): Promise<NrmAiLabConversation[]> {
  if (!serialNo) return [];
  const rows = await nrmSbSelect<NrmSupabaseChatSessionRow>(
    NRM_SUPABASE_TABLES.chatSession,
    (q) =>
      q
        .select('SessionID,SerialNo,ProviderID,Title,IsDeleted,RegDate,UpdateDate')
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
        .select('MessageID,SessionID,Role,Content,InputToken,OutputToken,TotalToken,RegDate')
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
