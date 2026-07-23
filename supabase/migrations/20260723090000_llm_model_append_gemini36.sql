-- Gemini 모델 목록 갱신(2026-07-23): 기존 LLMModel 행은 유지하고, 신규만 INSERT.
-- 추가분:
--   - models/gemini-3.5-flash-lite → IsActive=false
--   - models/gemini-3.6-flash     → IsActive=true
-- 기존 활성(gemini-3.1-flash-lite / gemini-3.5-flash / gemini-embedding-2 등)은 그대로 둔다.
-- ProviderID=1 (Google). ModelName 중복 시 no-op (멱등).

INSERT INTO public."LLMModel" (
  "ProviderID",
  "Type",
  "ModelName",
  "ModelDisplayName",
  "Version",
  "Description",
  "IsActive"
)
SELECT
  1,
  'LLM',
  'models/gemini-3.5-flash-lite',
  'Gemini 3.5 Flash Lite',
  '3.5-flash-lite-07-2026',
  'Gemini 3.5 Flash Lite',
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMModel" WHERE "ModelName" = 'models/gemini-3.5-flash-lite'
);

INSERT INTO public."LLMModel" (
  "ProviderID",
  "Type",
  "ModelName",
  "ModelDisplayName",
  "Version",
  "Description",
  "IsActive"
)
SELECT
  1,
  'LLM',
  'models/gemini-3.6-flash',
  'Gemini 3.6 Flash',
  '3.6-flash-07-2026',
  'Gemini 3.6 Flash',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMModel" WHERE "ModelName" = 'models/gemini-3.6-flash'
);
