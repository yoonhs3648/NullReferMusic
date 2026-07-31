-- LLMModel: AI Lab 피커 정렬용 preference + 추천 배지 isRecommand
-- + llama-3.3-70b-versatile IsActive=false
-- + preference 1~6 시드 / isRecommand는 gemini-3.5-flash-lite만 true

ALTER TABLE public."LLMModel"
  ADD COLUMN IF NOT EXISTS "preference" integer NULL;

ALTER TABLE public."LLMModel"
  ADD COLUMN IF NOT EXISTS "isRecommand" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."LLMModel"."preference"
IS 'AI Lab LLM 모델 선택 오버레이 정렬 우선순위(낮을수록 상단). NULL이면 기존 IsActive/ModelID 정책만 적용';

COMMENT ON COLUMN public."LLMModel"."isRecommand"
IS 'AI Lab 모델 선택 오버레이에서 모델명 옆 추천 배지 표시 여부';

-- 컬럼 단위 GRANT에 신규 컬럼 포함 (없으면 앱 select 실패)
REVOKE SELECT ON public."LLMModel" FROM anon, authenticated;
GRANT SELECT (
  "ModelID",
  "ProviderID",
  "Type",
  "ModelName",
  "ModelDisplayName",
  "Version",
  "Description",
  "IsActive",
  "RegDate",
  "preference",
  "isRecommand"
) ON public."LLMModel" TO anon, authenticated;

-- 전체 초기화 후 지정 모델만 값 부여 (멱등)
UPDATE public."LLMModel"
SET "preference" = NULL,
    "isRecommand" = false;

UPDATE public."LLMModel" SET "preference" = 1, "isRecommand" = true
WHERE "ModelName" = 'models/gemini-3.5-flash-lite';

UPDATE public."LLMModel" SET "preference" = 2
WHERE "ModelName" = 'models/gemini-3.1-flash-lite';

UPDATE public."LLMModel" SET "preference" = 3
WHERE "ModelName" = 'openai/gpt-oss-120b';

UPDATE public."LLMModel" SET "preference" = 4
WHERE "ModelName" = 'qwen/qwen3.6-27b';

UPDATE public."LLMModel" SET "preference" = 5
WHERE "ModelName" = 'models/gemini-3.6-flash';

UPDATE public."LLMModel" SET "preference" = 6
WHERE "ModelName" = 'models/gemini-3.5-flash';

UPDATE public."LLMModel"
SET "IsActive" = false
WHERE "ModelName" = 'llama-3.3-70b-versatile';
