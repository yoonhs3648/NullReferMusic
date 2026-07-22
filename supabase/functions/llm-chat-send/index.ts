// AI Lab 채팅 전송 Edge Function.
//
// APK 클라이언트는 이 함수만 호출한다. LLMProvider.ApiKey는 이 함수(서버사이드,
// service_role) 안에서만 읽고 절대 클라이언트로 내려주지 않는다.
//
// 흐름(성능을 위해 DB 왕복을 최소화):
//   1) nrm_rpc_chat_prepare_turn  — 세션 확보/생성 + 사용자 메시지 저장 +
//      provider/permission/quota/history 를 한 번에 조회 (DB 왕복 1회)
//   2) (필요 시) LLM Provider REST API 호출 — DB와 무관한 순수 HTTP
//   3) nrm_rpc_chat_finalize_turn — 응답(assistant/system) 저장 + 세션 갱신 +
//      (요청을 실제로 시도한 경우만) LLMTokenHistory 기록 (DB 왕복 1회)
//   4) LLMUserQuota 누적은 응답을 클라이언트에 돌려준 뒤 백그라운드로 처리
//      (EdgeRuntime.waitUntil) — 사용자는 지연을 전혀 느끼지 않는다.
//
// 멀티 프로바이더 확장: ADAPTERS 맵에 LLMProvider.ProviderName 별 어댑터를 등록한다.
// 지금은 Gemini만 구현. ChatGPT/Claude 등을 추가하려면 새 어댑터를 만들어 맵에
// 등록하기만 하면 된다(아래 나머지 로직은 전혀 건드리지 않아도 됨).
//
// 로깅: 요청마다 requestId(UUID) 하나로 전 구간을 묶는다. Supabase Dashboard →
// Edge Functions → llm-chat-send → Logs (또는 `supabase functions logs
// llm-chat-send`)에서 requestId로 grep 하면 해당 요청의 전체 흐름(각 단계 소요
//시간·성공/실패·최종 outcome)을 한 번에 재구성할 수 있다. ApiKey·전체 대화
// 본문은 절대 로그에 남기지 않는다(메시지는 길이/미리보기만).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_TIMEOUT_MS = 30_000;
const CHAT_HISTORY_LIMIT = 40;
const LOG_PREVIEW_LEN = 60;

const MSG_PERMISSION_DENIED = (modelDisplayName: string) =>
  `${modelDisplayName}의 사용권한이 없습니다. 관리자에게 문의해주세요.`;
const MSG_TOKEN_EXPIRED = '토큰이 만료되었어요. 관리자에게 문의해주세요.';
const MSG_NETWORK_PROBLEM = '네트워크 문제로 요청할 수 없어요. 나중에 다시 시도해 주세요.';
// 개인 할당량(LLMUserPermission.AllocatedToken)이 아니라 모델(LLMProvider) 자체의
// 일일/월간 전체 사용자 합산 한도(DailyLimit/MonthlyLimit)가 소진된 경우 — 관리자에게
// 문의해도 당장 해결되지 않는 성격이라 "토큰 만료" 문구와 구분한다.
const MSG_PROVIDER_LIMIT_REACHED =
  '지금 이 모델을 많은 사용자가 이용하고 있어 잠시 이용이 어려워요. 나중에 다시 시도해 주세요.';

// ── 로깅 ──────────────────────────────────────────────────────────────────
// event: 단계 식별자(스캔·grep 용). data: 그 단계에서만 의미 있는 값만 담는다
// (상위 단계에서 이미 찍은 값은 반복하지 않음 — 중복 로그 방지).

function preview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > LOG_PREVIEW_LEN ? `${t.slice(0, LOG_PREVIEW_LEN)}…` : t;
}

function logLine(
  level: 'info' | 'warn' | 'error',
  requestId: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  const payload = { fn: 'llm-chat-send', requestId, event, ts: new Date().toISOString(), ...data };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logInfo = (requestId: string, event: string, data?: Record<string, unknown>) =>
  logLine('info', requestId, event, data);
const logWarn = (requestId: string, event: string, data?: Record<string, unknown>) =>
  logLine('warn', requestId, event, data);
const logErr = (requestId: string, event: string, err: unknown, data?: Record<string, unknown>) =>
  logLine('error', requestId, event, {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...data,
  });

type ChatTurn = { role: 'user' | 'assistant'; content: string };

type AdapterSuccess = {
  ok: true;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};
type AdapterFailure = {
  ok: false;
  kind: 'auth' | 'network' | 'other';
  message: string;
  /** 실패 원인 HTTP status (있는 경우) — 로깅용 */
  status?: number;
};
type AdapterResult = AdapterSuccess | AdapterFailure;

interface LlmAdapter {
  send(apiKey: string, modelName: string, history: ChatTurn[], userMessage: string): Promise<AdapterResult>;
}

/** Gemini generateContent — 응답에 usageMetadata(prompt/candidates/total)가 포함되어 있어 토큰 집계용 별도 호출이 필요 없다. */
const geminiAdapter: LlmAdapter = {
  async send(apiKey, modelName, history, userMessage) {
    const modelPath = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contents = [
      ...history.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (e) {
      return {
        ok: false,
        kind: 'network',
        message: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      };
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const kind = res.status === 401 || res.status === 403 ? 'auth' : 'other';
      return { ok: false, kind, status: res.status, message: bodyText.slice(0, 500) };
    }

    // deno-lint-ignore no-explicit-any
    const json: any = await res.json().catch(() => null);
    if (!json) {
      return { ok: false, kind: 'other', status: res.status, message: 'gemini: response json parse failed' };
    }
    const blockReason = json?.promptFeedback?.blockReason;
    const parts = json?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p?.text ?? '').join('')
      : '';
    if (!text) {
      return {
        ok: false,
        kind: 'other',
        status: res.status,
        message: blockReason
          ? `gemini: blocked (${blockReason})`
          : `gemini: empty response text (finishReason=${json?.candidates?.[0]?.finishReason ?? 'unknown'})`,
      };
    }

    const usage = json?.usageMetadata ?? {};
    return {
      ok: true,
      text,
      inputTokens: Number(usage.promptTokenCount ?? 0),
      outputTokens: Number(usage.candidatesTokenCount ?? 0),
      totalTokens: Number(usage.totalTokenCount ?? 0),
    };
  },
};

/** LLMProvider.ProviderName → 어댑터. ChatGPT/Claude 등 추가 시 여기만 늘리면 된다. */
const ADAPTERS: Record<string, LlmAdapter> = {
  Gemini: geminiAdapter,
};

function currentTargetMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

type PrepareTurnResult = {
  sessionId: number;
  isNewSession: boolean;
  title: string;
  userMessage: Record<string, unknown>;
  provider: {
    providerId: number;
    providerName: string;
    modelName: string;
    modelDisplayName: string;
    apiKey: string;
    isActive: boolean;
    dailyLimit: number;
    monthlyLimit: number;
    providerDailyUsed: number;
    providerMonthlyUsed: number;
  } | null;
  permission: { isApproved: boolean; allocatedToken: number } | null;
  quotaUsed: number;
  history: Array<{ role: string; content: string }>;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    if (req.method !== 'POST') {
      logWarn(requestId, 'method_not_allowed', { method: req.method });
      return jsonResponse({ error: 'method_not_allowed', requestId }, 405);
    }

    let payload: {
      serialNo?: string;
      providerId?: number;
      sessionId?: number | null;
      message?: string;
    };
    try {
      payload = await req.json();
    } catch (e) {
      logErr(requestId, 'invalid_json', e);
      return jsonResponse({ error: 'invalid_json', requestId }, 400);
    }

    const serialNo = String(payload.serialNo ?? '').trim();
    const providerId = Number(payload.providerId);
    const sessionId = payload.sessionId != null ? Number(payload.sessionId) : null;
    const message = String(payload.message ?? '').trim();

    if (!serialNo || !Number.isFinite(providerId) || !message) {
      logWarn(requestId, 'invalid_params', {
        hasSerialNo: !!serialNo,
        providerId: payload.providerId,
        hasMessage: !!message,
      });
      return jsonResponse({ error: 'invalid_params', requestId }, 400);
    }

    logInfo(requestId, 'request_received', {
      serialNo,
      providerId,
      sessionId: sessionId ?? 'new',
      messageLength: message.length,
      messagePreview: preview(message),
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      logErr(requestId, 'server_misconfigured', new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing'));
      return jsonResponse({ error: 'server_misconfigured', requestId }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const targetMonth = currentTargetMonth();

    const prepareStartedAt = Date.now();
    const { data: prepareData, error: prepareError } = await supabase.rpc('nrm_rpc_chat_prepare_turn', {
      p_serial_no: serialNo,
      p_provider_id: providerId,
      p_session_id: sessionId,
      p_content: message,
      p_target_month: targetMonth,
      p_history_limit: CHAT_HISTORY_LIMIT,
    });
    const prepareElapsedMs = Date.now() - prepareStartedAt;
    if (prepareError || !prepareData) {
      logErr(requestId, 'prepare_turn_failed', prepareError ?? new Error('prepare_turn returned no data'), {
        elapsedMs: prepareElapsedMs,
        serialNo,
        providerId,
        sessionId: sessionId ?? 'new',
      });
      return jsonResponse({ error: 'prepare_failed', requestId, message: prepareError?.message }, 500);
    }
    const prepared = prepareData as PrepareTurnResult;
    const { sessionId: resolvedSessionId, isNewSession, title, userMessage, provider, permission, quotaUsed, history } =
      prepared;

    logInfo(requestId, 'prepare_turn_ok', {
      elapsedMs: prepareElapsedMs,
      sessionId: resolvedSessionId,
      isNewSession,
      providerFound: !!provider,
      providerActive: provider?.isActive ?? null,
      providerName: provider?.providerName ?? null,
      dailyLimit: provider?.dailyLimit ?? null,
      providerDailyUsed: provider?.providerDailyUsed ?? null,
      monthlyLimit: provider?.monthlyLimit ?? null,
      providerMonthlyUsed: provider?.providerMonthlyUsed ?? null,
      hasPermission: !!permission,
      isApproved: permission?.isApproved ?? null,
      allocatedToken: permission?.allocatedToken ?? null,
      quotaUsed,
      historyCount: Array.isArray(history) ? history.length : 0,
    });

    const finalizeSystem = async (
      content: string,
      recordHistory: boolean,
      outcome: string,
    ): Promise<Response> => {
      const finalizeStartedAt = Date.now();
      const { data, error } = await supabase.rpc('nrm_rpc_chat_finalize_turn', {
        p_session_id: resolvedSessionId,
        p_role: 'system',
        p_content: content,
        p_input_token: 0,
        p_output_token: 0,
        p_total_token: 0,
        p_serial_no: serialNo,
        p_provider_id: providerId,
        p_record_history: recordHistory,
        p_is_success: false,
      });
      const finalizeElapsedMs = Date.now() - finalizeStartedAt;
      if (error) {
        logErr(requestId, 'finalize_turn_failed', error, {
          elapsedMs: finalizeElapsedMs,
          sessionId: resolvedSessionId,
          role: 'system',
          outcome,
        });
        logInfo(requestId, 'request_done', {
          outcome: 'finalize_failed',
          totalElapsedMs: Date.now() - startedAt,
          sessionId: resolvedSessionId,
        });
        return jsonResponse({ error: 'finalize_failed', requestId, message: error.message }, 500);
      }
      logInfo(requestId, 'finalize_turn_ok', {
        elapsedMs: finalizeElapsedMs,
        sessionId: resolvedSessionId,
        role: 'system',
        recordHistory,
      });
      logInfo(requestId, 'request_done', {
        outcome,
        totalElapsedMs: Date.now() - startedAt,
        sessionId: resolvedSessionId,
        isNewSession,
      });
      return jsonResponse({ sessionId: resolvedSessionId, isNewSession, title, userMessage, replyMessage: data, requestId });
    };

    if (!provider || !provider.isActive) {
      logWarn(requestId, 'provider_unavailable', { providerId, providerFound: !!provider, isActive: provider?.isActive ?? null });
      logInfo(requestId, 'request_done', { outcome: 'provider_unavailable', totalElapsedMs: Date.now() - startedAt });
      return jsonResponse({ error: 'provider_unavailable', requestId }, 400);
    }

    // 0) 제공자(모델) 단위 일일/월간 전체 사용량 한도 — 개인 AllocatedToken과는 별개.
    // DailyLimit/MonthlyLimit=0은 제한 없음. 사용자 개인 할당량이 남아있어도 모델
    // 자체 한도가 소진되면 AI 요청을 하지 않는다(LLMTokenHistory 미기록).
    if (provider.dailyLimit > 0 && provider.providerDailyUsed >= provider.dailyLimit) {
      logInfo(requestId, 'provider_daily_limit_exceeded', {
        sessionId: resolvedSessionId,
        providerId,
        providerDailyUsed: provider.providerDailyUsed,
        dailyLimit: provider.dailyLimit,
      });
      return await finalizeSystem(MSG_PROVIDER_LIMIT_REACHED, false, 'provider_daily_limit_exceeded');
    }
    if (provider.monthlyLimit > 0 && provider.providerMonthlyUsed >= provider.monthlyLimit) {
      logInfo(requestId, 'provider_monthly_limit_exceeded', {
        sessionId: resolvedSessionId,
        providerId,
        providerMonthlyUsed: provider.providerMonthlyUsed,
        monthlyLimit: provider.monthlyLimit,
      });
      return await finalizeSystem(MSG_PROVIDER_LIMIT_REACHED, false, 'provider_monthly_limit_exceeded');
    }

    // 1) 권한 확인 — AI 요청 전. 실패 시 LLMTokenHistory에는 기록하지 않는다.
    if (!permission || permission.isApproved !== true) {
      logInfo(requestId, 'permission_denied', { sessionId: resolvedSessionId, providerId, hasPermissionRow: !!permission });
      return await finalizeSystem(MSG_PERMISSION_DENIED(provider.modelDisplayName), false, 'permission_denied');
    }

    // 2) 쿼터(할당 토큰) 확인 — AllocatedToken=0 은 무제한. AI 요청 전.
    if (permission.allocatedToken > 0 && quotaUsed >= permission.allocatedToken) {
      logInfo(requestId, 'quota_exceeded', {
        sessionId: resolvedSessionId,
        providerId,
        quotaUsed,
        allocatedToken: permission.allocatedToken,
      });
      return await finalizeSystem(MSG_TOKEN_EXPIRED, false, 'quota_exceeded');
    }

    const adapter = ADAPTERS[provider.providerName];
    if (!adapter) {
      // 아직 구현하지 않은 프로바이더 — 실제 요청을 시도한 것이 아니므로 이력 미기록.
      logErr(requestId, 'adapter_missing', new Error(`no adapter registered for providerName=${provider.providerName}`), {
        providerId,
        providerName: provider.providerName,
      });
      return await finalizeSystem(MSG_NETWORK_PROBLEM, false, 'adapter_missing');
    }

    const chatHistory: ChatTurn[] = (Array.isArray(history) ? history : []).map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content ?? ''),
    }));

    logInfo(requestId, 'llm_call_start', {
      providerName: provider.providerName,
      modelName: provider.modelName,
      historyCount: chatHistory.length,
      messageLength: message.length,
    });
    const llmStartedAt = Date.now();
    const result = await adapter.send(provider.apiKey, provider.modelName, chatHistory, message);
    const llmElapsedMs = Date.now() - llmStartedAt;

    if (!result.ok) {
      logWarn(requestId, 'llm_call_failed', {
        elapsedMs: llmElapsedMs,
        providerName: provider.providerName,
        kind: result.kind,
        status: result.status ?? null,
        message: result.message,
      });
      const replyText = result.kind === 'auth' ? MSG_TOKEN_EXPIRED : MSG_NETWORK_PROBLEM;
      return await finalizeSystem(replyText, true, 'llm_call_failed');
    }

    logInfo(requestId, 'llm_call_ok', {
      elapsedMs: llmElapsedMs,
      providerName: provider.providerName,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      replyLength: result.text.length,
      replyPreview: preview(result.text),
    });

    const finalizeStartedAt = Date.now();
    const { data: finalizeData, error: finalizeError } = await supabase.rpc('nrm_rpc_chat_finalize_turn', {
      p_session_id: resolvedSessionId,
      p_role: 'assistant',
      p_content: result.text,
      p_input_token: result.inputTokens,
      p_output_token: result.outputTokens,
      p_total_token: result.totalTokens,
      p_serial_no: serialNo,
      p_provider_id: providerId,
      p_record_history: true,
      p_is_success: true,
    });
    const finalizeElapsedMs = Date.now() - finalizeStartedAt;
    if (finalizeError) {
      logErr(requestId, 'finalize_turn_failed', finalizeError, {
        elapsedMs: finalizeElapsedMs,
        sessionId: resolvedSessionId,
        role: 'assistant',
      });
      logInfo(requestId, 'request_done', {
        outcome: 'finalize_failed',
        totalElapsedMs: Date.now() - startedAt,
        sessionId: resolvedSessionId,
      });
      return jsonResponse({ error: 'finalize_failed', requestId, message: finalizeError.message }, 500);
    }
    logInfo(requestId, 'finalize_turn_ok', {
      elapsedMs: finalizeElapsedMs,
      sessionId: resolvedSessionId,
      role: 'assistant',
      recordHistory: true,
    });

    const response = jsonResponse({
      sessionId: resolvedSessionId,
      isNewSession,
      title,
      userMessage,
      replyMessage: finalizeData,
      requestId,
    });

    logInfo(requestId, 'request_done', {
      outcome: 'success',
      totalElapsedMs: Date.now() - startedAt,
      sessionId: resolvedSessionId,
      isNewSession,
      totalTokens: result.totalTokens,
    });

    // 3) 사용자 응답 지연 없이 조용히 — Quota 누적은 응답 이후 백그라운드로.
    const quotaTask = supabase
      .rpc('nrm_rpc_increment_llm_user_quota', {
        p_serial_no: serialNo,
        p_provider_id: providerId,
        p_target_month: targetMonth,
        p_input_token: result.inputTokens,
        p_output_token: result.outputTokens,
        p_total_token: result.totalTokens,
      })
      .then(({ error }) => {
        if (error) {
          logErr(requestId, 'quota_increment_failed', error, { serialNo, providerId, targetMonth });
        } else {
          logInfo(requestId, 'quota_increment_ok', { serialNo, providerId, targetMonth, totalTokens: result.totalTokens });
        }
      })
      .catch((e) => logErr(requestId, 'quota_increment_threw', e, { serialNo, providerId, targetMonth }));

    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(quotaTask);
    } else {
      void quotaTask;
    }

    return response;
  } catch (e) {
    logErr(requestId, 'unhandled_error', e, { totalElapsedMs: Date.now() - startedAt });
    return jsonResponse({ error: 'internal', requestId }, 500);
  }
});
