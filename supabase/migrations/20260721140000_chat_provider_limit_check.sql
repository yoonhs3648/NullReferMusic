-- AI Lab 채팅 — 제공자(Provider) 단위 일일/월간 토큰 한도 체크
--
-- 배경: LLMUserPermission.AllocatedToken은 "사용자×제공자" 단위 할당량이고,
-- LLMProvider.DailyLimit/MonthlyLimit은 "제공자" 단위 전체 사용자 합산 한도다.
-- 지금까지 Edge Function(llm-chat-send)은 AllocatedToken만 체크했고
-- DailyLimit/MonthlyLimit은 전혀 체크하지 않았다 — 즉 개별 사용자 할당량이
-- 남아있어도 해당 모델 자체의 일일/월간 한도가 이미 소진된 경우를 걸러내지
-- 못했다. 이 마이그레이션은 nrm_rpc_chat_prepare_turn이 provider의
-- DailyLimit/MonthlyLimit과 "현재까지의 전체 사용자 합산 사용량"을 함께
-- 반환하도록 하여, Edge Function이 LLM 호출 직전에 이를 체크할 수 있게 한다.
--
-- 성능: DailyLimit/MonthlyLimit이 0(제한 없음)인 제공자는 집계 쿼리 자체를
-- 건너뛴다(가장 흔한 케이스에서 추가 비용 없음). 월간 합산은 이미 사용자별로
-- 누적돼 있는 LLMUserQuota를 그대로 SUM 하므로 가볍다. 일일 합산만
-- LLMTokenHistory를 RegDate로 스캔하므로, DailyLimit을 실제로 쓰는 제공자가
-- 있을 때를 대비해 (ProviderID, RegDate) 복합 인덱스를 추가한다.

CREATE INDEX IF NOT EXISTS "IX_LLMTokenHistory_ProviderID_RegDate"
ON public."LLMTokenHistory" ("ProviderID", "RegDate");

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_prepare_turn(
  p_serial_no text,
  p_provider_id bigint,
  p_session_id bigint,
  p_content text,
  p_target_month varchar,
  p_history_limit integer DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id bigint;
  v_is_new boolean := false;
  v_clean text;
  v_title varchar;
  v_user_msg public."ChatMessage"%ROWTYPE;
  v_provider_id bigint;
  v_provider_name varchar;
  v_model_name varchar;
  v_model_display_name text;
  v_api_key text;
  v_is_active boolean;
  v_daily_limit bigint;
  v_monthly_limit bigint;
  v_provider_daily_used bigint := 0;
  v_provider_monthly_used bigint := 0;
  v_is_approved boolean;
  v_allocated_token bigint;
  v_quota_used bigint;
  v_history jsonb;
BEGIN
  IF p_session_id IS NOT NULL THEN
    SELECT "SessionID", "Title" INTO v_session_id, v_title
    FROM public."ChatSession"
    WHERE "SessionID" = p_session_id AND "SerialNo" = p_serial_no AND "IsDeleted" = false;
  END IF;

  IF v_session_id IS NULL THEN
    v_clean := trim(regexp_replace(coalesce(p_content, ''), '\s+', ' ', 'g'));
    IF v_clean = '' THEN
      v_title := '새 대화';
    ELSIF length(v_clean) > 28 THEN
      v_title := left(v_clean, 28) || '…';
    ELSE
      v_title := v_clean;
    END IF;

    INSERT INTO public."ChatSession" ("SerialNo", "ProviderID", "Title")
    VALUES (p_serial_no, p_provider_id, v_title)
    RETURNING "SessionID" INTO v_session_id;
    v_is_new := true;
  END IF;

  INSERT INTO public."ChatMessage" ("SessionID", "Role", "Content")
  VALUES (v_session_id, p_serial_no, p_content)
  RETURNING * INTO v_user_msg;

  UPDATE public."ChatSession" SET "UpdateDate" = now() WHERE "SessionID" = v_session_id;

  SELECT "ProviderID", "ProviderName", "ModelName", "ModelDisplayName", "ApiKey", "IsActive", "DailyLimit", "MonthlyLimit"
  INTO v_provider_id, v_provider_name, v_model_name, v_model_display_name, v_api_key, v_is_active, v_daily_limit, v_monthly_limit
  FROM public."LLMProvider"
  WHERE "ProviderID" = p_provider_id;

  IF v_provider_id IS NOT NULL AND v_daily_limit > 0 THEN
    SELECT coalesce(SUM("TotalToken"), 0) INTO v_provider_daily_used
    FROM public."LLMTokenHistory"
    WHERE "ProviderID" = p_provider_id
      AND "RegDate" >= date_trunc('day', now());
  END IF;

  IF v_provider_id IS NOT NULL AND v_monthly_limit > 0 THEN
    SELECT coalesce(SUM("TotalToken"), 0) INTO v_provider_monthly_used
    FROM public."LLMUserQuota"
    WHERE "ProviderID" = p_provider_id
      AND "TargetMonth" = p_target_month;
  END IF;

  SELECT "IsApproved", "AllocatedToken"
  INTO v_is_approved, v_allocated_token
  FROM public."LLMUserPermission"
  WHERE "SerialNo" = p_serial_no AND "ProviderID" = p_provider_id;

  SELECT coalesce("TotalToken", 0) INTO v_quota_used
  FROM public."LLMUserQuota"
  WHERE "SerialNo" = p_serial_no AND "ProviderID" = p_provider_id AND "TargetMonth" = p_target_month;

  SELECT coalesce(jsonb_agg(jsonb_build_object('role', h."Role", 'content', h."Content") ORDER BY h."MessageID"), '[]'::jsonb)
  INTO v_history
  FROM (
    SELECT "MessageID", "Role", "Content"
    FROM public."ChatMessage"
    WHERE "SessionID" = v_session_id
      AND "Role" <> 'system'
      AND "MessageID" <> v_user_msg."MessageID"
    ORDER BY "MessageID" DESC
    LIMIT p_history_limit
  ) h;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'isNewSession', v_is_new,
    'title', v_title,
    'userMessage', to_jsonb(v_user_msg),
    'provider', CASE WHEN v_provider_id IS NULL THEN NULL ELSE jsonb_build_object(
      'providerId', v_provider_id,
      'providerName', v_provider_name,
      'modelName', v_model_name,
      'modelDisplayName', v_model_display_name,
      'apiKey', v_api_key,
      'isActive', v_is_active,
      'dailyLimit', v_daily_limit,
      'monthlyLimit', v_monthly_limit,
      'providerDailyUsed', v_provider_daily_used,
      'providerMonthlyUsed', v_provider_monthly_used
    ) END,
    'permission', CASE WHEN v_is_approved IS NULL THEN NULL ELSE jsonb_build_object(
      'isApproved', v_is_approved,
      'allocatedToken', v_allocated_token
    ) END,
    'quotaUsed', coalesce(v_quota_used, 0),
    'history', v_history
  );
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_chat_prepare_turn(text, bigint, bigint, text, varchar, integer)
IS 'AI Lab 채팅 1턴 준비: 세션 확보/생성 + 사용자 메시지 저장 + provider(+제공자 단위 일일/월간 누적 사용량)/permission/quota/history 일괄 조회 (service_role 전용, ApiKey 포함 반환)';
