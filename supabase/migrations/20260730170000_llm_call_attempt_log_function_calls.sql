-- LLMCallAttemptLog: 다운로드/검색 tool 인자·결과 원문 보관
-- FunctionCallsJson = 해당 시도에서 LLM이 반환한 function call (name/args)
-- ToolResultsJson  = toolContinue 시 클라이언트가 보낸 실행 결과(args+response)

ALTER TABLE public."LLMCallAttemptLog"
  ADD COLUMN IF NOT EXISTS "FunctionCallsJson" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "ToolResultsJson" jsonb NULL;

COMMENT ON COLUMN public."LLMCallAttemptLog"."FunctionCallsJson"
IS 'LLM 응답 function call 원문 [{callId,name,args}, ...]. tool_calls 성공 시 저장';

COMMENT ON COLUMN public."LLMCallAttemptLog"."ToolResultsJson"
IS 'toolContinue 시 클라이언트 실행 결과 [{callId,name,args,response}, ...]. Melon query/hits 추적용';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RequestBodyJson"
IS '요청 body 스냅샷(jsonb). 실패·검색·다운로드 tools·function call 시도에서 저장. 긴 텍스트는 truncate';
