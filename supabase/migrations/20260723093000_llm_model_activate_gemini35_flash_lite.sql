-- models/gemini-3.5-flash-lite(ModelID=55) IsActive=true
-- 기존 활성(gemini-3.1-flash-lite / gemini-3.5-flash / gemini-3.6-flash)은 유지.

UPDATE public."LLMModel"
SET "IsActive" = true
WHERE "ModelName" = 'models/gemini-3.5-flash-lite';
