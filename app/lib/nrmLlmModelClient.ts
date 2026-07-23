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
};

const LLM_MODEL_PUBLIC_SELECT =
  'ModelID,ProviderID,Type,ModelName,ModelDisplayName,Version,Description,IsActive';

let memoryCache: NrmLlmModelItem[] | null = null;
let inflight: Promise<NrmLlmModelItem[]> | null = null;

function mapLlmModelRow(row: NrmSupabaseLlmModelPublicRow): NrmLlmModelItem {
  return {
    modelId: row.ModelID,
    providerId: row.ProviderID,
    type: String(row.Type ?? '').trim(),
    modelName: String(row.ModelName ?? '').trim(),
    modelDisplayName: String(row.ModelDisplayName ?? '').trim(),
    version: String(row.Version ?? '').trim(),
    description: row.Description?.trim() ? row.Description.trim() : null,
    isActive: row.IsActive === true,
  };
}

/** Type=LLM — IsActive 우선 → ModelID 높은 순 → ProviderID 높은 순. */
export function sortLlmModelsForPicker(items: NrmLlmModelItem[]): NrmLlmModelItem[] {
  return [...items].sort((a, b) => {
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
