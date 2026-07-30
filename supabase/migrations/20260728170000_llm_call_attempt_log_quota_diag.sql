-- LLMCallAttemptLog: 429/실패 진단 — 확인된 사실(헤더·본문·요청 스냅샷)과 쿼타 분류 분리.
-- Grounding은 응답에 근거가 있을 때만 QuotaClass='grounding'. 추정이면 'unknown'.

ALTER TABLE public."LLMCallAttemptLog"
  ADD COLUMN IF NOT EXISTS "WithTools" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ProviderRequestID" varchar NULL,
  ADD COLUMN IF NOT EXISTS "RetryAfterHeader" varchar NULL,
  ADD COLUMN IF NOT EXISTS "ResponseHeadersJson" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "RateLimitHeadersJson" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "ResponseBodyText" text NULL,
  ADD COLUMN IF NOT EXISTS "RequestBodyJson" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "RequestBodySha256" varchar NULL,
  ADD COLUMN IF NOT EXISTS "RequestBodyBytes" integer NULL,
  ADD COLUMN IF NOT EXISTS "RequestBodyTruncated" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "QuotaClass" varchar NULL,
  ADD COLUMN IF NOT EXISTS "QuotaId" varchar NULL,
  ADD COLUMN IF NOT EXISTS "QuotaMetric" varchar NULL,
  ADD COLUMN IF NOT EXISTS "QuotaEvidence" varchar NULL;

COMMENT ON COLUMN public."LLMCallAttemptLog"."WithTools"
IS '요청 body에 tools 배열 포함 여부(사실)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."ProviderRequestID"
IS '제공자 응답 헤더 request id (x-goog-request-id / x-request-id / x-groq-id 등)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RetryAfterHeader"
IS '응답 Retry-After 헤더 원문(없으면 NULL)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."ResponseHeadersJson"
IS '제공자 HTTP 응답 헤더 전체(jsonb)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RateLimitHeadersJson"
IS 'x-ratelimit* / Retry-After / quota 관련 헤더만 추출';

COMMENT ON COLUMN public."LLMCallAttemptLog"."ResponseBodyText"
IS '실패 시 응답 본문(429는 최대 ~32KB, 그 외 ~8KB). 성공 시 보통 NULL';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RequestBodyJson"
IS '요청 body 스냅샷(jsonb). 실패 또는 검색(tools) 시도에서만 저장. 긴 텍스트는 truncate';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RequestBodySha256"
IS 'truncate 전 요청 body JSON의 SHA-256(hex). 중복·비교용';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RequestBodyBytes"
IS 'truncate 전 요청 body JSON 바이트(문자) 수';

COMMENT ON COLUMN public."LLMCallAttemptLog"."RequestBodyTruncated"
IS 'RequestBodyJson이 soft-max로 잘렸으면 true';

COMMENT ON COLUMN public."LLMCallAttemptLog"."QuotaClass"
IS '429 시 분류: grounding|rpm|tpm|rpd|unknown. 응답 근거 없으면 unknown(검색 사용만으로 grounding 추정 금지)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."QuotaId"
IS '응답 JSON quotaId (있으면)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."QuotaMetric"
IS '응답 JSON quotaMetric (있으면)';

COMMENT ON COLUMN public."LLMCallAttemptLog"."QuotaEvidence"
IS '분류 근거 요약(quotaId=… 등). unknown이면 NULL';

COMMENT ON COLUMN public."LLMCallAttemptLog"."ErrorMessage"
IS '실패 메시지 요약(호환용). 전문은 ResponseBodyText 참고';

CREATE INDEX IF NOT EXISTS "IX_LLMCallAttemptLog_QuotaClass_RegDate"
ON public."LLMCallAttemptLog" ("QuotaClass", "RegDate" DESC)
WHERE "QuotaClass" IS NOT NULL;
