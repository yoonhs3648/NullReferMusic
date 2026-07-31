import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import type { NrmSupabaseLlmModelPublicRow } from '@/lib/nrmSupabaseDatabase.types';

/** APK 클라이언트에 노출 가능한 LLMModel 필드 (ApiKey는 LLMProvider 소유, 여기 없음). */
export type NrmLlmModelItem = {
  modelId: number;
  providerId: number;
  type: string;
  modelName: string;
  modelDisplayName: string;
  version: string;
  description: string | null;
  isActive: boolean;
  /** AI Lab 피커 정렬 우선순위(낮을수록 상단). null이면 후순위. */
  preference: number | null;
  /** AI Lab 피커 추천 배지. */
  isRecommand: boolean;
};

const LLM_MODEL_PUBLIC_SELECT =
  'ModelID,ProviderID,Type,ModelName,ModelDisplayName,Version,Description,IsActive,preference,isRecommand';

let memoryCache: NrmLlmModelItem[] | null = null;
let inflight: Promise<NrmLlmModelItem[]> | null = null;

function mapLlmModelRow(row: NrmSupabaseLlmModelPublicRow): NrmLlmModelItem {
  const prefRaw = row.preference;
  const preference =
    prefRaw == null || !Number.isFinite(Number(prefRaw)) ? null : Number(prefRaw);
  return {
    modelId: row.ModelID,
    providerId: row.ProviderID,
    type: String(row.Type ?? '').trim(),
    modelName: String(row.ModelName ?? '').trim(),
    modelDisplayName: String(row.ModelDisplayName ?? '').trim(),
    version: String(row.Version ?? '').trim(),
    description: row.Description?.trim() ? row.Description.trim() : null,
    isActive: row.IsActive === true,
    preference,
    isRecommand: row.isRecommand === true,
  };
}

/**
 * Type=LLM 피커 정렬:
 * 1) preference 있는 행 — 숫자 오름차순(1이 최상단)
 * 2) 그다음 기존 정책 — IsActive 우선 → ModelID 내림차순 → ProviderID 내림차순
 */
export function sortLlmModelsForPicker(items: NrmLlmModelItem[]): NrmLlmModelItem[] {
  return [...items].sort((a, b) => {
    const aPref = a.preference;
    const bPref = b.preference;
    const aHas = aPref != null;
    const bHas = bPref != null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && aPref !== bPref) return aPref - bPref;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.modelId !== b.modelId) return b.modelId - a.modelId;
    return b.providerId - a.providerId;
  });
}

export function pickDefaultLlmModelId(items: NrmLlmModelItem[]): number | null {
  const sorted = sortLlmModelsForPicker(items);
  const active = sorted.find((item) => item.isActive);
  return active?.modelId ?? sorted[0]?.modelId ?? null;
}

export async function fetchLlmModelsForAiLab(options?: {
  force?: boolean;
}): Promise<NrmLlmModelItem[]> {
  if (!options?.force && memoryCache) return memoryCache;
  if (!options?.force && inflight) return inflight;

  inflight = (async () => {
    const rows = await nrmSbSelect<NrmSupabaseLlmModelPublicRow>(
      NRM_SUPABASE_TABLES.llmModel,
      (q) =>
        q
          .select(LLM_MODEL_PUBLIC_SELECT)
          .eq('Type', 'LLM')
          .order('IsActive', { ascending: false })
          .order('ModelID', { ascending: false })
          .order('ProviderID', { ascending: false }),
    );
    const items = sortLlmModelsForPicker(rows.map(mapLlmModelRow));
    memoryCache = items;
    return items;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function findLlmModelById(
  items: readonly NrmLlmModelItem[],
  modelId: number | null,
): NrmLlmModelItem | null {
  if (modelId == null) return null;
  return items.find((item) => item.modelId === modelId) ?? null;
}
