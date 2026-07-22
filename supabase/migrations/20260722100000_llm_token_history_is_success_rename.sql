-- LLMTokenHistory."isSucess" → "isSuccess" 컬럼명 오타 수정
--
-- 사용자 확인(2026-07-22): "isSuccess"가 올바른 표기다. 20260721150000에서 실제
-- 원격 DB에 "isSucess"(오타)로 컬럼을 추가했었는데, 원격에는 이후 "isSuccess"도
-- 생겨 두 컬럼이 공존할 수 있다. 아래는 멱등:
--   1) 둘 다 있으면 오타 컬럼("isSucess")만 DROP
--   2) 오타만 있으면 RENAME → "isSuccess"
--   3) 올바른 컬럼만 있으면 no-op

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'LLMTokenHistory'
      AND a.attname = 'isSucess'
      AND NOT a.attisdropped
  ) AND EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'LLMTokenHistory'
      AND a.attname = 'isSuccess'
      AND NOT a.attisdropped
  ) THEN
    -- 올바른 컬럼이 이미 있으므로 오타 컬럼만 제거 (데이터는 isSuccess에 있음)
    ALTER TABLE public."LLMTokenHistory" DROP COLUMN "isSucess";
  ELSIF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'LLMTokenHistory'
      AND a.attname = 'isSucess'
      AND NOT a.attisdropped
  ) THEN
    ALTER TABLE public."LLMTokenHistory" RENAME COLUMN "isSucess" TO "isSuccess";
  END IF;
END $$;

COMMENT ON COLUMN public."LLMTokenHistory"."isSuccess"
IS '요청에 대한 응답이 성공인지 여부';

-- nrm_rpc_chat_finalize_turn — INSERT 대상 컬럼명만 "isSuccess"로 교정 (나머지 로직 동일)
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
    INSERT INTO public."LLMTokenHistory" ("SerialNo", "ProviderID", "InputToken", "OutputToken", "TotalToken", "isSuccess")
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
