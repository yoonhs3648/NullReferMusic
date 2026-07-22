-- AI Lab 채팅 — LLM 생성 제목으로 세션 제목 갱신
--
-- 배경: nrm_rpc_chat_prepare_turn은 새 세션 생성 시 "채팅 원문을 28자로 자른" 임시
-- 제목을 즉시 넣는다(세션 INSERT에는 Title NOT NULL이 필요하고, 사용자 응답 속도에
-- 영향을 주면 안 되므로 여기서는 LLM을 호출하지 않는다).
--
-- 실제 "이 대화가 어떤 질문인지"를 요약한 품질 좋은 제목은 Edge Function
-- (llm-chat-send)이 사용자 응답을 이미 스트리밍/반환한 "뒤" 백그라운드로
-- (EdgeRuntime.waitUntil) 짧은 LLM 호출 1회를 더 실행해 만들고, 이 RPC로 덮어쓴다.
-- 응답 지연에는 전혀 영향이 없다(quota 증가 RPC와 동일한 패턴).
--
-- service_role 전용 — 앱이 직접 호출하지 않는다(제목은 서버가 생성한 값만 허용).

CREATE OR REPLACE FUNCTION public.nrm_rpc_chat_update_session_title(
  p_session_id bigint,
  p_serial_no text,
  p_title varchar
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public."ChatSession"
  SET "Title" = p_title
  WHERE "SessionID" = p_session_id AND "SerialNo" = p_serial_no AND "IsDeleted" = false;
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_chat_update_session_title(bigint, text, varchar)
IS 'AI Lab 대화 제목을 LLM이 생성한 제목으로 갱신 (최초 메시지 응답 후 백그라운드로 호출, service_role 전용)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_chat_update_session_title(bigint, text, varchar)
TO service_role;
