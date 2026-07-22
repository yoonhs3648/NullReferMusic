-- AI Lab 채팅 전송 RPC
--
-- 성능을 위해 "메시지 전송 1회"당 Edge Function(llm-chat-send)이 DB를 딱 2번만
-- 왕복하도록 묶었다:
--   1) nrm_rpc_chat_prepare_turn  — 세션 확보/생성 + 사용자 메시지 저장 + 권한/쿼터/
--      대화이력을 한 트랜잭션에서 모두 조회해 반환 (LLM 호출 전 필요한 모든 것)
--   2) nrm_rpc_chat_finalize_turn — LLM 응답(or 시스템 메시지) 저장 + 세션 갱신 +
--      (필요 시) LLMTokenHistory 기록
-- 그 사이에 Gemini 등 외부 LLM API 호출이 끼는데, 이는 Edge Function 안에서
-- Postgres 커넥션을 점유하지 않고 수행된다(HTTP fetch, DB 트랜잭션과 무관).
--
-- LLMUserQuota 누적은 사용자 응답 속도에 영향을 주면 안 되므로(요구사항: "조용히"),
-- Edge Function이 클라이언트에 응답을 준 "다음" 백그라운드로 별도 호출한다
-- (nrm_rpc_increment_llm_user_quota). 이 RPC들은 ApiKey를 반환하므로 anon에는
-- 절대 GRANT하지 않고 service_role(Edge Function 전용)에만 연다.
--
-- 세션 삭제(소프트 삭제)는 앱이 직접 호출하는 유일한 쓰기 경로라 anon/authenticated에도 연다.

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

  SELECT "ProviderID", "ProviderName", "ModelName", "ModelDisplayName", "ApiKey", "IsActive"
  INTO v_provider_id, v_provider_name, v_model_name, v_model_display_name, v_api_key, v_is_active
  FROM public."LLMProvider"
  WHERE "ProviderID" = p_provider_id;

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
      'isActive', v_is_active
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
IS 'AI Lab 채팅 1턴 준비: 세션 확보/생성 + 사용자 메시지 저장 + provider/permission/quota/history 일괄 조회 (service_role 전용, ApiKey 포함 반환)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_prepare_turn(text, bigint, bigint, text, varchar, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_finalize_turn(
  p_session_id bigint,
  p_role varchar,
  p_content text,
  p_input_token integer,
  p_output_token integer,
  p_total_token integer,
  p_serial_no text,
  p_provider_id bigint,
  p_record_history boolean,
  p_is_success boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public."ChatMessage"%ROWTYPE;
BEGIN
  INSERT INTO public."ChatMessage" ("SessionID", "Role", "Content", "InputToken", "OutputToken", "TotalToken")
  VALUES (
    p_session_id,
    p_role,
    p_content,
    coalesce(p_input_token, 0),
    coalesce(p_output_token, 0),
    coalesce(p_total_token, 0)
  )
  RETURNING * INTO v_msg;

  UPDATE public."ChatSession" SET "UpdateDate" = now() WHERE "SessionID" = p_session_id;

  IF p_record_history THEN
    INSERT INTO public."LLMTokenHistory" ("SerialNo", "ProviderID", "InputToken", "OutputToken", "TotalToken", "isSucess")
    VALUES (
      p_serial_no,
      p_provider_id,
      coalesce(p_input_token, 0),
      coalesce(p_output_token, 0),
      coalesce(p_total_token, 0),
      p_is_success
    );
  END IF;

  RETURN to_jsonb(v_msg);
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_chat_finalize_turn(bigint, varchar, text, integer, integer, integer, text, bigint, boolean, boolean)
IS 'AI Lab 채팅 1턴 종료: 응답(assistant/system) 메시지 저장 + 세션 갱신 + (요청 시도한 경우만) LLMTokenHistory 기록 (service_role 전용)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_finalize_turn(bigint, varchar, text, integer, integer, integer, text, bigint, boolean, boolean)
TO service_role;

CREATE OR REPLACE FUNCTION public.nrm_rpc_increment_llm_user_quota(
  p_serial_no text,
  p_provider_id bigint,
  p_target_month varchar,
  p_input_token integer,
  p_output_token integer,
  p_total_token integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."LLMUserQuota" ("SerialNo", "ProviderID", "TargetMonth", "InputToken", "OutputToken", "TotalToken")
  VALUES (
    p_serial_no,
    p_provider_id,
    p_target_month,
    coalesce(p_input_token, 0),
    coalesce(p_output_token, 0),
    coalesce(p_total_token, 0)
  )
  ON CONFLICT ("SerialNo", "ProviderID", "TargetMonth") DO UPDATE SET
    "InputToken" = public."LLMUserQuota"."InputToken" + EXCLUDED."InputToken",
    "OutputToken" = public."LLMUserQuota"."OutputToken" + EXCLUDED."OutputToken",
    "TotalToken" = public."LLMUserQuota"."TotalToken" + EXCLUDED."TotalToken",
    "UpdateDate" = now();
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_increment_llm_user_quota(text, bigint, varchar, integer, integer, integer)
IS '사용자 월별 LLM 토큰 사용량 누적 upsert. 응답 지연에 영향 없게 Edge Function이 응답 이후 백그라운드로 호출 (service_role 전용)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_increment_llm_user_quota(text, bigint, varchar, integer, integer, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_delete_session(
  p_serial_no text,
  p_session_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public."ChatSession"
  SET "IsDeleted" = true, "UpdateDate" = now()
  WHERE "SessionID" = p_session_id AND "SerialNo" = p_serial_no;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owner';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_chat_delete_session(text, bigint)
IS 'ChatSession 소프트 삭제(IsDeleted=true). 앱이 직접 호출(caller가 본인 SerialNo로만 삭제 가능)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_delete_session(text, bigint)
TO anon, authenticated;
