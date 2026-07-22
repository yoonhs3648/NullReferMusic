-- LLMTokenHistory.isSucess 컬럼 보강
--
-- docs/supabase-tables/llm.md에는 이미 문서화되어 있었으나(사용자가 "추가했다"고
-- 알려준 시점 기준), 실제 원격 DB에는 컬럼이 없는 상태였다(nrm_rpc_chat_finalize_turn
-- 실제 호출 시 "column isSucess does not exist" 오류로 확인). 여기서 실제로 추가한다.

ALTER TABLE public."LLMTokenHistory"
  ADD COLUMN IF NOT EXISTS "isSucess" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."LLMTokenHistory"."isSucess"
IS '요청에 대한 응답이 성공인지 여부';
