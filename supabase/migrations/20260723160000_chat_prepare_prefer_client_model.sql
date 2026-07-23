-- AI Lab: 클라이언트가 고른 모델(p_model_id)을 항상 사용.
-- 기존 세션에 묶인 ModelID보다 우선하며, 세션 행도 같이 갱신한다.

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_prepare_turn(
  p_serial_no text,
  p_model_id bigint,
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
  v_session_provider_id bigint;
  v_session_model_id bigint;
  v_effective_model_id bigint;
  v_model_id bigint;
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
    SELECT "SessionID", "Title", "ProviderID", "ModelID"
    INTO v_session_id, v_title, v_session_provider_id, v_session_model_id
    FROM public."ChatSession"
    WHERE "SessionID" = p_session_id AND "SerialNo" = p_serial_no AND "IsDeleted" = false;
  END IF;

  -- 클라이언트가 보낸 모델을 우선. 없으면(비정상) 세션에 저장된 모델로 폴백.
  v_effective_model_id := COALESCE(p_model_id, v_session_model_id);

  IF v_session_id IS NULL THEN
    v_clean := trim(regexp_replace(coalesce(p_content, ''), '\s+', ' ', 'g'));
    IF v_clean = '' THEN
      v_title := '새 대화';
    ELSIF length(v_clean) > 28 THEN
      v_title := left(v_clean, 28) || '…';
    ELSE
      v_title := v_clean;
    END IF;

    SELECT "ProviderID" INTO v_provider_id FROM public."LLMModel" WHERE "ModelID" = v_effective_model_id;

    INSERT INTO public."ChatSession" ("SerialNo", "ProviderID", "ModelID", "Title")
    VALUES (p_serial_no, v_provider_id, v_effective_model_id, v_title)
    RETURNING "SessionID" INTO v_session_id;
    v_is_new := true;
  ELSIF p_model_id IS NOT NULL AND v_session_model_id IS DISTINCT FROM p_model_id THEN
    -- 같은 대화에서 모델을 바꾼 경우 세션 고정값을 갱신해 이후 tool_continue 등도 동일 모델 사용.
    SELECT "ProviderID" INTO v_provider_id FROM public."LLMModel" WHERE "ModelID" = p_model_id;
    IF v_provider_id IS NOT NULL THEN
      UPDATE public."ChatSession"
      SET "ModelID" = p_model_id,
          "ProviderID" = v_provider_id,
          "UpdateDate" = now()
      WHERE "SessionID" = v_session_id;
      v_effective_model_id := p_model_id;
    END IF;
  END IF;

  INSERT INTO public."ChatMessage" ("SessionID", "Role", "Content")
  VALUES (v_session_id, p_serial_no, p_content)
  RETURNING * INTO v_user_msg;

  UPDATE public."ChatSession" SET "UpdateDate" = now() WHERE "SessionID" = v_session_id;

  SELECT lm."ModelID", lm."ProviderID", lm."ModelName", lm."ModelDisplayName", lm."IsActive",
         lp."ProviderName", lp."ApiKey"
  INTO v_model_id, v_provider_id, v_model_name, v_model_display_name, v_is_active,
       v_provider_name, v_api_key
  FROM public."LLMModel" lm
  JOIN public."LLMProvider" lp ON lp."ProviderID" = lm."ProviderID"
  WHERE lm."ModelID" = v_effective_model_id;

  SELECT "IsApproved", "AllocatedToken"
  INTO v_is_approved, v_allocated_token
  FROM public."LLMUserPermission"
  WHERE "SerialNo" = p_serial_no AND "ProviderID" = v_provider_id;

  SELECT coalesce("TotalToken", 0) INTO v_quota_used
  FROM public."LLMUserQuota"
  WHERE "SerialNo" = p_serial_no AND "ProviderID" = v_provider_id AND "TargetMonth" = p_target_month;

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
    'model', CASE WHEN v_model_id IS NULL THEN NULL ELSE jsonb_build_object(
      'modelId', v_model_id,
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
IS 'AI Lab 채팅 1턴 준비: 세션 확보/생성 + 사용자 메시지 저장 + model/permission/quota/history. 호출 모델은 클라이언트의 p_model_id를 우선하며, 기존 세션이면 ChatSession.ModelID/ProviderID도 그에 맞게 갱신.';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_prepare_turn(text, bigint, bigint, text, varchar, integer)
TO service_role;
