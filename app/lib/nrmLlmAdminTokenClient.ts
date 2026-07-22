/**
 * 관리자페이지 「AI토큰 조회」/「AI토큰 할당」 — 제공자 단위 목록·합산 사용량,
 * 사용자×제공자×월 할당 이력(LLMUserMonthlyAllocation) 조회/설정.
 * 상세: docs/supabase-tables/llm.md
 */
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { getNrmSupabase } from '@/lib/nrmSupabaseClient';
import {
  NRM_SUPABASE_LLM_PROVIDER_QUOTA_FUNCTION,
  NRM_SUPABASE_TABLES,
} from '@/lib/nrmSupabaseConfig';
import type {
  NrmSupabaseLlmProviderAdminRow,
  NrmSupabaseLlmUserMonthlyAllocationRow,
  NrmSupabaseLlmUserQuotaRow,
} from '@/lib/nrmSupabaseDatabase.types';
import { nrmSbMaybeSingle, nrmSbRpc, nrmSbSelect } from '@/lib/nrmSupabaseCrud';

const PROVIDER_ADMIN_SELECT = 'ProviderID,ProviderName,RegDate';

/** 관리자 화면용 — LLMProvider(ApiKey 제외). */

export type NrmLlmAdminProviderOption = {
  providerId: number;
  providerName: string;
  regDate: string;
};

function mapProviderAdminRow(row: NrmSupabaseLlmProviderAdminRow): NrmLlmAdminProviderOption {
  return {
    providerId: row.ProviderID,
    providerName: String(row.ProviderName ?? '').trim() || `Provider ${row.ProviderID}`,
    regDate: String(row.RegDate ?? ''),
  };
}

/** 관리자 AI토큰 화면 — 전체 제공자(ProviderName 가나다순). */

export async function fetchAllLlmProvidersForAdmin(): Promise<NrmLlmAdminProviderOption[]> {
  try {
    const rows = await nrmSbSelect<NrmSupabaseLlmProviderAdminRow>(
      NRM_SUPABASE_TABLES.llmProvider,
      (q) => q.select(PROVIDER_ADMIN_SELECT).order('ProviderName', { ascending: true }),
    );
    const items = rows
      .map(mapProviderAdminRow)
      .sort((a, b) => a.providerName.localeCompare(b.providerName, 'ko-KR', { sensitivity: 'base' }));
    logNrmDev('llmAdminToken.client', { event: 'fetch-providers-ok', count: items.length });
    return items;
  } catch (e) {
    logNrmRunError('llmAdminToken.client', e, { event: 'fetch-providers-failed' });
    return [];
  }
}

/** 특정 제공자 × 특정월(YYYYMM)의 앱 내 합산 사용량 — 전체 사용자. */

export type NrmLlmAdminProviderMonthUsage = {
  providerId: number;
  targetMonth: string;
  totalUsedToken: number;
  userCount: number;
};

export async function fetchProviderAggregateMonthUsage(
  providerId: number,
  targetMonth: string,
): Promise<NrmLlmAdminProviderMonthUsage> {
  try {
    const rows = await nrmSbSelect<Pick<NrmSupabaseLlmUserQuotaRow, 'TotalToken'>>(
      NRM_SUPABASE_TABLES.llmUserQuota,
      (q) => q.select('TotalToken').eq('ProviderID', providerId).eq('TargetMonth', targetMonth),
    );
    let totalUsedToken = 0;
    for (const row of rows) {
      totalUsedToken += row.TotalToken ?? 0;
    }
    logNrmDev('llmAdminToken.client', {
      event: 'fetch-provider-aggregate-ok',
      providerId,
      targetMonth,
      userCount: rows.length,
      totalUsedToken,
    });
    return { providerId, targetMonth, totalUsedToken, userCount: rows.length };
  } catch (e) {
    logNrmRunError('llmAdminToken.client', e, {
      event: 'fetch-provider-aggregate-failed',
      providerId,
      targetMonth,
    });
    return { providerId, targetMonth, totalUsedToken: 0, userCount: 0 };
  }
}

/**
 * Edge Function `llm-provider-quota` 응답 스냅샷.
 * Gemini 등 공식 잔여쿼터 REST가 없으므로 availableToken은 보통 null.
 */

export type NrmLlmProviderQuotaSnapshot = {
  providerId: number;
  targetMonth: string;
  usedToken: number;
  /** null = 확인 불가(AI Studio 등에서만 확인 가능) */
  availableToken: number | null;
  userCount: number;
  apiKeyValid: boolean | null;
  source: 'edge_function' | 'db_aggregate';
};

/**
 * (stub) Edge Function이 준비되면 프로바이더 API 잔여쿼터를 시도한다.
 * 현재 Gemini에는 공식 잔여쿼터 REST가 없어 실패(null)가 정상이며,
 * 호출부는 DB aggregate로 fallback한다.
 */

export async function fetchProviderQuotaFromApi(
  providerId: number,
  targetMonth: string,
): Promise<NrmLlmProviderQuotaSnapshot | null> {
  try {
    const { data, error } = await getNrmSupabase().functions.invoke(
      NRM_SUPABASE_LLM_PROVIDER_QUOTA_FUNCTION,
      { body: { providerId, targetMonth } },
    );
    if (error) {
      logNrmDev('llmAdminToken.client', {
        event: 'fetch-provider-quota-api-failed',
        providerId,
        targetMonth,
        message: error.message,
      });
      return null;
    }
    const raw = data as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    const usedToken = Number(raw.usedToken ?? raw.used_token ?? NaN);
    if (!Number.isFinite(usedToken)) return null;
    const availableRaw = raw.availableToken ?? raw.available_token;
    const availableToken =
      availableRaw == null || availableRaw === ''
        ? null
        : Number.isFinite(Number(availableRaw))
          ? Number(availableRaw)
          : null;
    const userCount = Number(raw.userCount ?? raw.user_count ?? 0);
    const apiKeyValid =
      typeof raw.apiKeyValid === 'boolean'
        ? raw.apiKeyValid
        : typeof raw.api_key_valid === 'boolean'
          ? raw.api_key_valid
          : null;
    logNrmDev('llmAdminToken.client', {
      event: 'fetch-provider-quota-api-ok',
      providerId,
      targetMonth,
      usedToken,
      availableToken,
      apiKeyValid,
    });
    return {
      providerId,
      targetMonth,
      usedToken,
      availableToken,
      userCount: Number.isFinite(userCount) ? userCount : 0,
      apiKeyValid,
      source: 'edge_function',
    };
  } catch (e) {
    logNrmRunError('llmAdminToken.client', e, {
      event: 'fetch-provider-quota-api-threw',
      providerId,
      targetMonth,
    });
    return null;
  }
}

/**
 * 제공자×월 쿼터 스냅샷 — Edge Function 우선, 실패 시 DB aggregate fallback.
 * availableToken=null 이면 UI는 "확인 불가(AI Studio)"로 표시한다.
 */

export async function fetchProviderQuotaSnapshot(
  providerId: number,
  targetMonth: string,
): Promise<NrmLlmProviderQuotaSnapshot> {
  const fromApi = await fetchProviderQuotaFromApi(providerId, targetMonth);
  if (fromApi) return fromApi;
  const agg = await fetchProviderAggregateMonthUsage(providerId, targetMonth);
  logNrmDev('llmAdminToken.client', {
    event: 'fetch-provider-quota-fallback-db',
    providerId,
    targetMonth,
    totalUsedToken: agg.totalUsedToken,
  });
  return {
    providerId,
    targetMonth,
    usedToken: agg.totalUsedToken,
    availableToken: null,
    userCount: agg.userCount,
    apiKeyValid: null,
    source: 'db_aggregate',
  };
}

/** LLMUserMonthlyAllocation 단건 — AI토큰 할당 화면의 "과거 월" 조회(읽기 전용 이력)용. */

export async function fetchLlmUserMonthlyAllocationRecord(
  serialNo: string,
  providerId: number,
  targetMonth: string,
): Promise<NrmSupabaseLlmUserMonthlyAllocationRow | null> {
  const trimmed = serialNo.trim();
  if (!trimmed) return null;
  try {
    const row = await nrmSbMaybeSingle<NrmSupabaseLlmUserMonthlyAllocationRow>(
      NRM_SUPABASE_TABLES.llmUserMonthlyAllocation,
      (q) =>
        q
          .select(
            'AllocationID,SerialNo,ProviderID,TargetMonth,AllocatedToken,UpdatedBySerialNo,RegDate,UpdateDate',
          )
          .eq('SerialNo', trimmed)
          .eq('ProviderID', providerId)
          .eq('TargetMonth', targetMonth)
          .maybeSingle(),
    );
    logNrmDev('llmAdminToken.client', {
      event: 'fetch-monthly-allocation-ok',
      providerId,
      targetMonth,
      found: row != null,
    });
    return row;
  } catch (e) {
    logNrmRunError('llmAdminToken.client', e, {
      event: 'fetch-monthly-allocation-failed',
      providerId,
      targetMonth,
    });
    return null;
  }
}

/** 관리자: 사용자×제공자×월(현재월)의 승인/할당 토큰을 설정. */

export async function setLlmUserTokenAllocation(params: {
  serialNo: string;
  providerId: number;
  targetMonth: string;
  allocatedToken: number;
  isApproved: boolean;
}): Promise<void> {
  const serialNo = params.serialNo.trim();
  if (!serialNo) throw new Error('사용자를 선택하세요.');
  const callerSerial = (await getNrmAppSerialNo()) ?? '';
  logNrmDev('llmAdminToken.client', {
    event: 'set-allocation-start',
    serialNo,
    providerId: params.providerId,
    targetMonth: params.targetMonth,
  });
  try {
    await nrmSbRpc<void>('nrm_rpc_admin_set_llm_user_token_allocation', {
      p_caller_serial: callerSerial,
      p_serial_no: serialNo,
      p_provider_id: params.providerId,
      p_target_month: params.targetMonth,
      p_allocated_token: Math.max(0, Math.trunc(params.allocatedToken)),
      p_is_approved: params.isApproved,
    });
    logNrmDev('llmAdminToken.client', {
      event: 'set-allocation-ok',
      serialNo,
      providerId: params.providerId,
    });
  } catch (e) {
    logNrmRunError('llmAdminToken.client', e, {
      event: 'set-allocation-failed',
      serialNo,
      providerId: params.providerId,
    });
    throw e;
  }
}

