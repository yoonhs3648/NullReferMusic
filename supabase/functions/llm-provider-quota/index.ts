// 관리자 AI토큰 조회 — 제공자×월 쿼터 스냅샷.
//
// Gemini 등 Google Generative Language API에는 공식 "잔여 쿼터" REST가 없다.
// 이 함수는:
//   1) LLMProvider.ApiKey로 models 목록을 호출해 키 유효성만 확인
//   2) LLMUserQuota에서 ProviderID+TargetMonth SUM(TotalToken) = usedToken
//   3) availableToken: null, source: 'db_aggregate'
//
// 인증: publishable key (Authorization Bearer / apikey) — llm-chat-send와 동일 패턴.
// ApiKey는 service_role로만 읽고 클라이언트에 내려주지 않는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function logInfo(event: string, data?: Record<string, unknown>): void {
  console.log(JSON.stringify({ fn: 'llm-provider-quota', event, ts: new Date().toISOString(), ...data }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const providerId = Number(body.providerId);
  const targetMonth = String(body.targetMonth ?? '').trim();
  if (!Number.isFinite(providerId) || providerId <= 0 || !/^\d{6}$/.test(targetMonth)) {
    return jsonResponse({ error: 'invalid_params' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: provider, error: providerError } = await admin
    .from('LLMProvider')
    .select('ProviderID,ProviderName,ApiKey')
    .eq('ProviderID', providerId)
    .maybeSingle();

  if (providerError || !provider) {
    logInfo('provider_not_found', { providerId, message: providerError?.message });
    return jsonResponse({ error: 'provider_not_found', providerId }, 404);
  }

  const apiKey = String((provider as { ApiKey?: string }).ApiKey ?? '').trim();
  const providerName = String((provider as { ProviderName?: string }).ProviderName ?? '').trim();

  let apiKeyValid = false;
  if (apiKey) {
    try {
      const res = await fetch(`${GEMINI_MODELS_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: 'GET',
      });
      apiKeyValid = res.ok;
      logInfo('api_key_check', { providerId, providerName, status: res.status, apiKeyValid });
    } catch (e) {
      logInfo('api_key_check_failed', {
        providerId,
        message: e instanceof Error ? e.message : String(e),
      });
      apiKeyValid = false;
    }
  }

  const { data: quotaRows, error: quotaError } = await admin
    .from('LLMUserQuota')
    .select('TotalToken')
    .eq('ProviderID', providerId)
    .eq('TargetMonth', targetMonth);

  if (quotaError) {
    logInfo('quota_query_failed', { providerId, targetMonth, message: quotaError.message });
    return jsonResponse({ error: 'quota_query_failed', message: quotaError.message }, 500);
  }

  let usedToken = 0;
  const rows = (quotaRows ?? []) as { TotalToken?: number }[];
  for (const row of rows) {
    usedToken += Number(row.TotalToken ?? 0) || 0;
  }

  logInfo('ok', {
    providerId,
    targetMonth,
    usedToken,
    userCount: rows.length,
    apiKeyValid,
  });

  return jsonResponse({
    providerId,
    targetMonth,
    usedToken,
    availableToken: null,
    userCount: rows.length,
    apiKeyValid,
    source: 'db_aggregate',
  });
});
