/**
 * AI Lab 사용량 조회 — 사용자×**제공자** 할당(`LLMUserPermission`) + 월별 사용량(`LLMUserQuota`).
 * 상세: docs/supabase-tables/llm.md
 */
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_LLM_UNLIMITED_ALLOCATED_TOKEN } from '@/lib/nrmLlmSerialNo';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import type {
  NrmSupabaseLlmProviderRow,
  NrmSupabaseLlmUserPermissionRow,
  NrmSupabaseLlmUserQuotaRow,
} from '@/lib/nrmSupabaseDatabase.types';
import { nrmSbMaybeSingle, nrmSbSelect } from '@/lib/nrmSupabaseCrud';



const PERMISSION_SELECT = 'PermissionID,SerialNo,ProviderID,IsApproved,AllocatedToken';

const QUOTA_SELECT = 'QuotaID,SerialNo,ProviderID,TargetMonth,InputToken,OutputToken,TotalToken';

const PROVIDER_SELECT = 'ProviderID,ProviderName,RegDate';



/** 사용량 조회 화면의 제공자 선택 목록용 — 승인된(IsApproved=true) 제공자만. */

export type NrmLlmUsageProviderOption = {
  providerId: number;
  providerName: string;
  /** 0 = 무제한 (NRM_LLM_UNLIMITED_ALLOCATED_TOKEN) */
  allocatedToken: number;
};



/** 특정 제공자 × 특정월의 사용량 스냅샷 (할당량 + 그 달 누적 사용량). */

export type NrmLlmUsageMonthSnapshot = {
  providerId: number;
  targetMonth: string;
  isApproved: boolean;
  /** 0 = 무제한 (NRM_LLM_UNLIMITED_ALLOCATED_TOKEN) */
  allocatedToken: number;
  usedToken: number;
  inputToken: number;
  outputToken: number;
};



export function isNrmLlmAllocationUnlimited(allocatedToken: number): boolean {
  return allocatedToken === NRM_LLM_UNLIMITED_ALLOCATED_TOKEN;
}



/**
 * serialNo가 승인받은(IsApproved=true) 제공자 목록 — 사용량 조회 화면의 제공자 선택 드롭다운용.
 * LLMUserPermission + LLMProvider(ProviderID,ProviderName,RegDate) join.
 */

export async function fetchLlmUsageProviderOptions(
  serialNo: string,
): Promise<NrmLlmUsageProviderOption[]> {
  const trimmed = serialNo.trim();
  if (!trimmed) return [];



  try {
    const [permissions, providers] = await Promise.all([
      nrmSbSelect<NrmSupabaseLlmUserPermissionRow>(NRM_SUPABASE_TABLES.llmUserPermission, (q) =>
        q.select(PERMISSION_SELECT).eq('SerialNo', trimmed).eq('IsApproved', true),
      ),
      nrmSbSelect<NrmSupabaseLlmProviderRow>(NRM_SUPABASE_TABLES.llmProvider, (q) =>
        q.select(PROVIDER_SELECT),
      ),
    ]);



    const providerById = new Map(providers.map((p) => [p.ProviderID, p]));
    const options: NrmLlmUsageProviderOption[] = [];
    for (const perm of permissions) {
      const provider = providerById.get(perm.ProviderID);
      if (!provider) continue;
      options.push({
        providerId: perm.ProviderID,
        providerName: String(provider.ProviderName ?? '').trim() || `Provider ${perm.ProviderID}`,
        allocatedToken: perm.AllocatedToken,
      });
    }
    options.sort((a, b) =>
      a.providerName.localeCompare(b.providerName, 'ko-KR', { sensitivity: 'base' }),
    );



    logNrmDev('llmUsage.client', {
      event: 'fetch-provider-options-ok',
      serialNo: trimmed,
      count: options.length,
    });
    return options;
  } catch (e) {
    logNrmRunError('llmUsage.client', e, { event: 'fetch-provider-options-failed' });
    return [];
  }
}



/** 특정 제공자 × 특정월(YYYYMM)의 할당량+사용량 스냅샷. */

export async function fetchLlmUsageMonthSnapshot(
  serialNo: string,
  providerId: number,
  targetMonth: string,
): Promise<NrmLlmUsageMonthSnapshot | null> {
  const trimmed = serialNo.trim();
  if (!trimmed) return null;



  try {
    const [permission, quota] = await Promise.all([
      nrmSbMaybeSingle<NrmSupabaseLlmUserPermissionRow>(
        NRM_SUPABASE_TABLES.llmUserPermission,
        (q) =>
          q
            .select(PERMISSION_SELECT)
            .eq('SerialNo', trimmed)
            .eq('ProviderID', providerId)
            .maybeSingle(),
      ),
      nrmSbMaybeSingle<NrmSupabaseLlmUserQuotaRow>(NRM_SUPABASE_TABLES.llmUserQuota, (q) =>
        q
          .select(QUOTA_SELECT)
          .eq('SerialNo', trimmed)
          .eq('ProviderID', providerId)
          .eq('TargetMonth', targetMonth)
          .maybeSingle(),
      ),
    ]);



    logNrmDev('llmUsage.client', {
      event: 'fetch-month-snapshot-ok',
      providerId,
      targetMonth,
      hasPermission: permission != null,
      hasQuota: quota != null,
    });



    return {
      providerId,
      targetMonth,
      isApproved: permission?.IsApproved ?? false,
      allocatedToken: permission?.AllocatedToken ?? NRM_LLM_UNLIMITED_ALLOCATED_TOKEN,
      usedToken: quota?.TotalToken ?? 0,
      inputToken: quota?.InputToken ?? 0,
      outputToken: quota?.OutputToken ?? 0,
    };
  } catch (e) {
    logNrmRunError('llmUsage.client', e, {
      event: 'fetch-month-snapshot-failed',
      providerId,
      targetMonth,
    });
    return null;
  }
}


