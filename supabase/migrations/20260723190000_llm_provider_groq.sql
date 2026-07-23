-- Groq 제공자 + 모델 목록 시드 (2026-07-23)
-- ProviderID=2, ProviderName='Groq'
-- AI Lab 피커 정렬은 ModelID DESC → 활성 3종에 높은 ModelID 부여:
--   1002 openai/gpt-oss-120b
--   1001 qwen/qwen3.6-27b
--   1000 llama-3.3-70b-versatile
-- ApiKey는 이 파일에 넣지 않는다. 배포 후: scripts/set-groq-api-key.mjs
INSERT INTO public."LLMProvider" ("ProviderID", "ProviderName", "ApiKey", "RegDate")
OVERRIDING SYSTEM VALUE
VALUES (
  2,
  'Groq',
  '',
  now()
)
ON CONFLICT ("ProviderID") DO UPDATE
SET
  "ProviderName" = EXCLUDED."ProviderName",
  "ApiKey" = CASE
    WHEN NULLIF(trim(EXCLUDED."ApiKey"), '') IS NULL THEN public."LLMProvider"."ApiKey"
    ELSE EXCLUDED."ApiKey"
  END;

SELECT setval(
  pg_get_serial_sequence('public."LLMProvider"', 'ProviderID'),
  GREATEST((SELECT MAX("ProviderID") FROM public."LLMProvider"), 2)
);

-- admin 권한(제공자 단위, 무제한 AllocatedToken=0)
INSERT INTO public."LLMUserPermission" (
  "SerialNo", "ProviderID", "IsApproved", "AllocatedToken", "ApprovedDate", "RegDate", "UpdateDate"
)
SELECT
  'admin',
  2,
  true,
  0,
  now(),
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMUserPermission"
  WHERE "SerialNo" = 'admin' AND "ProviderID" = 2
);

-- 비활성 모델(자동 ModelID) — 이미 있으면 스킵
INSERT INTO public."LLMModel" (
  "ProviderID", "Type", "ModelName", "ModelDisplayName", "Version", "Description", "IsActive"
)
SELECT 2, v."Type", v."ModelName", v."ModelDisplayName", v."Version", v."Description", false
FROM (
  VALUES
    ('LLM', 'meta-llama/llama-prompt-guard-2-86m', 'Prompt Guard 2 86M', '1', 'Meta Prompt Guard 2 86M'),
    ('LLM', 'groq/compound', 'Compound', '1', 'Groq Compound'),
    ('TTS', 'canopylabs/orpheus-v1-english', 'Canopy Labs Orpheus V1 English', '1', 'Orpheus V1 English (speech)'),
    ('LLM', 'groq/compound-mini', 'Compound Mini', '1', 'Groq Compound Mini'),
    ('LLM', 'meta-llama/llama-prompt-guard-2-22m', 'Llama Prompt Guard 2 22M', '1', 'Meta Prompt Guard 2 22M'),
    ('LLM', 'allam-2-7b', 'ALLaM-2-7b', '1', 'ALLaM 2 7B'),
    ('LLM', 'llama-3.1-8b-instant', 'Llama 3.1 8B', '1', 'Llama 3.1 8B Instant'),
    ('TTS', 'canopylabs/orpheus-arabic-saudi', 'Canopy Labs Orpheus Arabic Saudi', '1', 'Orpheus Arabic Saudi (speech)'),
    ('LLM', 'openai/gpt-oss-20b', 'GPT OSS 20B', '1', 'OpenAI GPT OSS 20B'),
    ('TTS', 'whisper-large-v3-turbo', 'Whisper Large V3 Turbo', '1', 'Whisper Large V3 Turbo (transcription)'),
    ('TTS', 'whisper-large-v3', 'Whisper', '1', 'Whisper Large V3 (transcription)'),
    ('LLM', 'openai/gpt-oss-safeguard-20b', 'Safety GPT OSS 20B', '1', 'OpenAI GPT OSS Safeguard 20B')
) AS v("Type", "ModelName", "ModelDisplayName", "Version", "Description")
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMModel" m WHERE m."ModelName" = v."ModelName" AND m."ProviderID" = 2
);

-- 활성 3종이 다른 ModelID로 있으면 제거 후 재삽입(피커 순서 고정)
DELETE FROM public."LLMModel"
WHERE "ProviderID" = 2
  AND "ModelName" IN (
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'llama-3.3-70b-versatile'
  )
  AND "ModelID" NOT IN (1000, 1001, 1002);

-- 활성 우선순위 3종 — 명시 ModelID (피커 ModelID DESC)
INSERT INTO public."LLMModel" (
  "ModelID", "ProviderID", "Type", "ModelName", "ModelDisplayName", "Version", "Description", "IsActive"
)
OVERRIDING SYSTEM VALUE
VALUES
  (1002, 2, 'LLM', 'openai/gpt-oss-120b', 'GPT OSS 120B', '1', 'OpenAI GPT OSS 120B (Groq)', true),
  (1001, 2, 'LLM', 'qwen/qwen3.6-27b', 'Qwen3.6 27B', '1', 'Qwen 3.6 27B (Groq)', true),
  (1000, 2, 'LLM', 'llama-3.3-70b-versatile', 'Llama 3.3 70B', '1', 'Llama 3.3 70B Versatile (Groq)', true)
ON CONFLICT ("ModelID") DO UPDATE
SET
  "ProviderID" = EXCLUDED."ProviderID",
  "Type" = EXCLUDED."Type",
  "ModelName" = EXCLUDED."ModelName",
  "ModelDisplayName" = EXCLUDED."ModelDisplayName",
  "Version" = EXCLUDED."Version",
  "Description" = EXCLUDED."Description",
  "IsActive" = EXCLUDED."IsActive";

-- ModelName 기준 멱등(다른 ModelID로 이미 들어갔을 때 정리)
UPDATE public."LLMModel" m
SET
  "IsActive" = true,
  "ModelDisplayName" = CASE m."ModelName"
    WHEN 'openai/gpt-oss-120b' THEN 'GPT OSS 120B'
    WHEN 'qwen/qwen3.6-27b' THEN 'Qwen3.6 27B'
    WHEN 'llama-3.3-70b-versatile' THEN 'Llama 3.3 70B'
    ELSE m."ModelDisplayName"
  END
WHERE m."ProviderID" = 2
  AND m."ModelName" IN (
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'llama-3.3-70b-versatile'
  );

SELECT setval(
  pg_get_serial_sequence('public."LLMModel"', 'ModelID'),
  GREATEST((SELECT MAX("ModelID") FROM public."LLMModel"), 1002)
);
