import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import type { NrmSupabaseLlmProviderPublicRow } from '@/lib/nrmSupabaseDatabase.types';

/** APK 클라이언트에 노출 가능한 LLMProvider 필드 (ApiKey 제외). */
export type NrmLlmProviderItem = {
  providerId: number;
  providerName: string;
  type: string;
  modelName: string;
  modelDisplayName: string;
  version: string;
  description: string | null;
  isActive: boolean;
};

const LLM_PROVIDER_PUBLIC_SELECT =
  'ProviderID,ProviderName,Type,ModelName,ModelDisplayName,Version,Description,IsActive';

let memoryCache: NrmLlmProviderItem[] | null = null;
let inflight: Promise<NrmLlmProviderItem[]> | null = null;

function mapLlmProviderRow(row: NrmSupabaseLlmProviderPublicRow): NrmLlmProviderItem {
  return {
    providerId: row.ProviderID,
    providerName: String(row.ProviderName ?? '').trim(),
    type: String(row.Type ?? '').trim(),
    modelName: String(row.ModelName ?? '').trim(),
    modelDisplayName: String(row.ModelDisplayName ?? '').trim(),
    version: String(row.Version ?? '').trim(),
    description: row.Description?.trim() ? row.Description.trim() : null,
    isActive: row.IsActive === true,
  };
}

/** Type=LLM — IsActive 우선, ModelDisplayName 가나다순. */
export function sortLlmProvidersForPicker(items: NrmLlmProviderItem[]): NrmLlmProviderItem[] {
  return [...items].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.modelDisplayName.localeCompare(b.modelDisplayName, 'ko-KR', { sensitivity: 'base' });
  });
}

export function pickDefaultLlmProviderId(items: NrmLlmProviderItem[]): number | null {
  const sorted = sortLlmProvidersForPicker(items);
  const active = sorted.find((item) => item.isActive);
  return active?.providerId ?? sorted[0]?.providerId ?? null;
}

export async function fetchLlmProvidersForAiLab(options?: {
  force?: boolean;
}): Promise<NrmLlmProviderItem[]> {
  if (!options?.force && memoryCache) return memoryCache;
  if (!options?.force && inflight) return inflight;

  inflight = (async () => {
    const rows = await nrmSbSelect<NrmSupabaseLlmProviderPublicRow>(
      NRM_SUPABASE_TABLES.llmProvider,
      (q) =>
        q
          .select(LLM_PROVIDER_PUBLIC_SELECT)
          .eq('Type', 'LLM')
          .order('IsActive', { ascending: false })
          .order('ModelDisplayName', { ascending: true }),
    );
    const items = sortLlmProvidersForPicker(rows.map(mapLlmProviderRow));
    memoryCache = items;
    return items;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function findLlmProviderById(
  items: readonly NrmLlmProviderItem[],
  providerId: number | null,
): NrmLlmProviderItem | null {
  if (providerId == null) return null;
  return items.find((item) => item.providerId === providerId) ?? null;
}
