-- ChatMessage UI 복원용 jsonb + 앱 직접 append/patch RPC
-- 배경: 칩·YouTube 미리듣기·로컬 말풍선이 Role/Content만으로는 복원되지 않음.

ALTER TABLE public."ChatMessage"
  ADD COLUMN IF NOT EXISTS "UiMeta" jsonb NULL;

COMMENT ON COLUMN public."ChatMessage"."UiMeta"
IS 'AI Lab UI 복원 메타(choices/agentUi/youtubeConfirm 스냅샷). NULL이면 텍스트만';

-- ── append: 로컬 칩·미리듣기 턴을 세션에 저장 (세션 없으면 생성) ─────────────────

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_append_ui_messages(
  p_serial_no text,
  p_session_id bigint,
  p_model_id bigint,
  p_messages jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial text := trim(coalesce(p_serial_no, ''));
  v_session_id bigint := p_session_id;
  v_provider_id bigint;
  v_title varchar;
  v_msg jsonb;
  v_role varchar;
  v_content text;
  v_ui jsonb;
  v_row public."ChatMessage"%ROWTYPE;
  v_out jsonb := '[]'::jsonb;
  v_first_user text := NULL;
BEGIN
  IF v_serial = '' THEN
    RAISE EXCEPTION 'serial_no required';
  END IF;
  IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' OR jsonb_array_length(p_messages) = 0 THEN
    RAISE EXCEPTION 'messages required';
  END IF;

  IF v_session_id IS NULL THEN
    IF p_model_id IS NULL THEN
      RAISE EXCEPTION 'model_id required for new session';
    END IF;
    SELECT m."ProviderID" INTO v_provider_id
    FROM public."LLMModel" m
    WHERE m."ModelID" = p_model_id;
    IF v_provider_id IS NULL THEN
      RAISE EXCEPTION 'model not found';
    END IF;

    FOR v_msg IN SELECT * FROM jsonb_array_elements(p_messages)
    LOOP
      IF lower(trim(coalesce(v_msg->>'role', ''))) = 'user' THEN
        v_first_user := left(trim(coalesce(v_msg->>'content', '')), 28);
        EXIT;
      END IF;
    END LOOP;
    v_title := coalesce(nullif(v_first_user, ''), '새 대화');

    INSERT INTO public."ChatSession" ("SerialNo", "ProviderID", "ModelID", "Title")
    VALUES (v_serial, v_provider_id, p_model_id, v_title)
    RETURNING "SessionID" INTO v_session_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public."ChatSession" s
      WHERE s."SessionID" = v_session_id
        AND s."SerialNo" = v_serial
        AND s."IsDeleted" = false
    ) THEN
      RAISE EXCEPTION 'session not found or not owner';
    END IF;
  END IF;

  FOR v_msg IN SELECT * FROM jsonb_array_elements(p_messages)
  LOOP
    v_role := lower(trim(coalesce(v_msg->>'role', '')));
    v_content := coalesce(v_msg->>'content', '');
    v_ui := v_msg->'uiMeta';
    IF v_ui IS NOT NULL AND jsonb_typeof(v_ui) = 'null' THEN
      v_ui := NULL;
    END IF;

    IF v_role = 'user' THEN
      v_role := v_serial;
    ELSIF v_role NOT IN ('assistant', 'system') THEN
      RAISE EXCEPTION 'invalid role: %', v_role;
    END IF;

    INSERT INTO public."ChatMessage" ("SessionID", "Role", "Content", "UiMeta")
    VALUES (v_session_id, v_role, v_content, v_ui)
    RETURNING * INTO v_row;

    v_out := v_out || jsonb_build_array(to_jsonb(v_row));
  END LOOP;

  UPDATE public."ChatSession"
  SET "UpdateDate" = now()
  WHERE "SessionID" = v_session_id;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'messages', v_out
  );
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_chat_append_ui_messages(text, bigint, bigint, jsonb)
IS 'AI Lab UI 턴(칩/미리듣기 등) 저장. 본인 세션만. p_session_id NULL이면 새 세션 생성';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_append_ui_messages(text, bigint, bigint, jsonb)
TO anon, authenticated;

-- ── patch: 기존 메시지 UiMeta 갱신(칩 제거·choices/agentUi 부착) ──────────────────

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_patch_message_ui_meta(
  p_serial_no text,
  p_session_id bigint,
  p_message_id bigint,
  p_ui_meta jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial text := trim(coalesce(p_serial_no, ''));
  v_row public."ChatMessage"%ROWTYPE;
BEGIN
  IF v_serial = '' OR p_session_id IS NULL OR p_message_id IS NULL THEN
    RAISE EXCEPTION 'serial_no, session_id, message_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."ChatSession" s
    WHERE s."SessionID" = p_session_id
      AND s."SerialNo" = v_serial
      AND s."IsDeleted" = false
  ) THEN
    RAISE EXCEPTION 'session not found or not owner';
  END IF;

  UPDATE public."ChatMessage" m
  SET "UiMeta" = CASE
    WHEN p_ui_meta IS NULL OR jsonb_typeof(p_ui_meta) = 'null' THEN NULL
    ELSE p_ui_meta
  END
  WHERE m."MessageID" = p_message_id
    AND m."SessionID" = p_session_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  UPDATE public."ChatSession"
  SET "UpdateDate" = now()
  WHERE "SessionID" = p_session_id;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_chat_patch_message_ui_meta(text, bigint, bigint, jsonb)
IS 'AI Lab 메시지 UiMeta 갱신/제거. 본인 세션만';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_patch_message_ui_meta(text, bigint, bigint, jsonb)
TO anon, authenticated;
