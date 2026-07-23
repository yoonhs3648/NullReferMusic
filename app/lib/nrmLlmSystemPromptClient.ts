/**
 * 관리자페이지 「AI 시스템 프롬프트 설정」—
 * LLMSystemPrompt CRUD (모든 LLM 모델에 동일 적용되는 전역 프롬프트).
 */
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbRpc, nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import type { NrmSupabaseLlmSystemPromptRow } from '@/lib/nrmSupabaseDatabase.types';

export type NrmLlmSystemPromptItem = {
  promptId: number;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
  updatedBySerialNo: string | null;
  regDate: string;
  updateDate: string;
};

const SELECT_COLS =
  'PromptID,Title,Content,SortOrder,IsActive,UpdatedBySerialNo,RegDate,UpdateDate';

function mapRow(row: NrmSupabaseLlmSystemPromptRow): NrmLlmSystemPromptItem {
  return {
    promptId: row.PromptID,
    title: String(row.Title ?? '').trim(),
    content: String(row.Content ?? ''),
    sortOrder: Number(row.SortOrder ?? 0),
    isActive: row.IsActive === true,
    updatedBySerialNo: row.UpdatedBySerialNo?.trim() ? row.UpdatedBySerialNo.trim() : null,
    regDate: String(row.RegDate ?? ''),
    updateDate: String(row.UpdateDate ?? ''),
  };
}

/** 관리자 목록 — 전체(비활성 포함), SortOrder → PromptID 오름차순. */
export async function fetchLlmSystemPromptsForAdmin(): Promise<NrmLlmSystemPromptItem[]> {
  logNrmDev('llmSystemPrompt.client', { event: 'fetch-start' });
  try {
    const rows = await nrmSbSelect<NrmSupabaseLlmSystemPromptRow>(
      NRM_SUPABASE_TABLES.llmSystemPrompt,
      (q) =>
        q
          .select(SELECT_COLS)
          .order('SortOrder', { ascending: true })
          .order('PromptID', { ascending: true }),
    );
    const items = rows.map(mapRow);
    logNrmDev('llmSystemPrompt.client', { event: 'fetch-ok', count: items.length });
    return items;
  } catch (e) {
    logNrmRunError('llmSystemPrompt.client', e, { event: 'fetch-failed' });
    throw e;
  }
}

export async function upsertLlmSystemPrompt(params: {
  promptId?: number | null;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
}): Promise<number> {
  const title = params.title.trim();
  const content = params.content.trim();
  if (!title) throw new Error('제목을 입력하세요.');
  if (!content) throw new Error('본문을 입력하세요.');

  const callerSerial = (await getNrmAppSerialNo()) ?? '';
  logNrmDev('llmSystemPrompt.client', {
    event: 'upsert-start',
    promptId: params.promptId ?? null,
  });
  try {
    const id = await nrmSbRpc<number>('nrm_rpc_admin_upsert_llm_system_prompt', {
      p_caller_serial: callerSerial,
      p_prompt_id: params.promptId ?? null,
      p_title: title,
      p_content: content,
      p_sort_order: Math.trunc(params.sortOrder),
      p_is_active: params.isActive,
    });
    logNrmDev('llmSystemPrompt.client', { event: 'upsert-ok', promptId: id });
    return Number(id);
  } catch (e) {
    logNrmRunError('llmSystemPrompt.client', e, {
      event: 'upsert-failed',
      promptId: params.promptId ?? null,
    });
    throw e;
  }
}

export async function deleteLlmSystemPrompt(promptId: number): Promise<void> {
  const callerSerial = (await getNrmAppSerialNo()) ?? '';
  logNrmDev('llmSystemPrompt.client', { event: 'delete-start', promptId });
  try {
    await nrmSbRpc<void>('nrm_rpc_admin_delete_llm_system_prompt', {
      p_caller_serial: callerSerial,
      p_prompt_id: promptId,
    });
    logNrmDev('llmSystemPrompt.client', { event: 'delete-ok', promptId });
  } catch (e) {
    logNrmRunError('llmSystemPrompt.client', e, { event: 'delete-failed', promptId });
    throw e;
  }
}
