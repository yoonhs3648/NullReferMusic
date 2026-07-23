/**
 * AI Lab 빈 화면 추천 질문.
 * - DB: LLMAiLabSuggestionCategory / LLMAiLabSuggestionPrompt
 * - 벡터 카테고리(vector_*)는 플래그 false면 절대 노출하지 않음(사용자가 켤 때 다시 요청).
 */

import { getNrmSupabase } from '@/lib/nrmSupabaseClient';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import type {
  NrmAiLabSuggestionAnswerMode,
  NrmAiLabSuggestionChip,
  NrmSupabaseLlmAiLabSuggestionCategoryRow,
  NrmSupabaseLlmAiLabSuggestionPromptRow,
} from '@/lib/nrmSupabaseDatabase.types';

/** 벡터DB 연동 전 — true로 바꾸기 전까지 vector_* 카테고리 미노출 */
export const NRM_AI_LAB_VECTOR_SUGGESTIONS_ENABLED = false;

const LOG_TAG = 'ailab.suggestions';

type CategoryWithPrompts = NrmSupabaseLlmAiLabSuggestionCategoryRow & {
  prompts: NrmSupabaseLlmAiLabSuggestionPromptRow[];
};

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function isCategoryEligible(
  mode: NrmAiLabSuggestionAnswerMode,
  webSearchEnabled: boolean,
): boolean {
  if (mode === 'plain') return true;
  if (mode === 'web_search') return webSearchEnabled;
  if (mode === 'vector_plain' || mode === 'vector_web') {
    if (!NRM_AI_LAB_VECTOR_SUGGESTIONS_ENABLED) return false;
    if (mode === 'vector_web') return webSearchEnabled;
    return true;
  }
  return false;
}

/** 활성 카테고리+프롬프트 전부 로드(앱이 게이트·랜덤 선정). */
export async function fetchAiLabSuggestionCatalog(): Promise<CategoryWithPrompts[]> {
  const sb = getNrmSupabase();
  const { data: cats, error: catErr } = await sb
    .from(NRM_SUPABASE_TABLES.llmAiLabSuggestionCategory)
    .select('CategoryID,CategoryCode,Title,AnswerMode,SortOrder,IsActive')
    .eq('IsActive', true)
    .order('SortOrder', { ascending: true })
    .order('CategoryID', { ascending: true });
  if (catErr) {
    console.warn(LOG_TAG, 'category_fetch_failed', catErr.message);
    return [];
  }
  const categories = (cats ?? []) as NrmSupabaseLlmAiLabSuggestionCategoryRow[];
  if (categories.length === 0) return [];

  const { data: prompts, error: promptErr } = await sb
    .from(NRM_SUPABASE_TABLES.llmAiLabSuggestionPrompt)
    .select('PromptID,CategoryID,PromptText,SortOrder,IsActive')
    .eq('IsActive', true)
    .order('SortOrder', { ascending: true })
    .order('PromptID', { ascending: true });
  if (promptErr) {
    console.warn(LOG_TAG, 'prompt_fetch_failed', promptErr.message);
    return [];
  }
  const byCat = new Map<number, NrmSupabaseLlmAiLabSuggestionPromptRow[]>();
  for (const p of (prompts ?? []) as NrmSupabaseLlmAiLabSuggestionPromptRow[]) {
    const list = byCat.get(p.CategoryID) ?? [];
    list.push(p);
    byCat.set(p.CategoryID, list);
  }
  return categories
    .map((c) => ({
      ...c,
      prompts: byCat.get(c.CategoryID) ?? [],
    }))
    .filter((c) => c.prompts.length > 0);
}

/**
 * 적격 카테고리에서 최대 3개(카테고리당 1질문) 무작위 선정.
 * webSearchEnabled / 벡터 플래그에 따라 후보가 달라진다.
 */
export function pickAiLabSuggestionChips(
  catalog: CategoryWithPrompts[],
  webSearchEnabled: boolean,
  maxCount = 3,
): NrmAiLabSuggestionChip[] {
  const eligible = catalog.filter((c) =>
    isCategoryEligible(c.AnswerMode as NrmAiLabSuggestionAnswerMode, webSearchEnabled),
  );
  if (eligible.length === 0) return [];

  const pickedCats = shuffleInPlace([...eligible]).slice(0, Math.max(1, maxCount));
  // 화면에서는 SortOrder 순으로 안정적으로 나열
  pickedCats.sort((a, b) => a.SortOrder - b.SortOrder || a.CategoryID - b.CategoryID);

  const chips: NrmAiLabSuggestionChip[] = [];
  for (const cat of pickedCats) {
    const prompts = [...cat.prompts];
    if (prompts.length === 0) continue;
    const prompt = prompts[Math.floor(Math.random() * prompts.length)]!;
    chips.push({
      promptId: prompt.PromptID,
      categoryId: cat.CategoryID,
      categoryCode: cat.CategoryCode,
      categoryTitle: cat.Title,
      answerMode: cat.AnswerMode as NrmAiLabSuggestionAnswerMode,
      promptText: prompt.PromptText,
    });
  }
  return chips;
}
