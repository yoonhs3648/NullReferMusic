-- 사용자 요청: Gemini 3.1 Flash Lite + Gemini 3.5 Flash 모델만 활성화, 나머지 LLM(채팅) 모델은 비활성화.
-- Type='LLM'(채팅) 범위만 대상으로 한다 - Embedding/TTS/Image/Video 등 다른 용도 모델(Type<>'LLM')은
-- 이 요청과 무관하므로 건드리지 않는다.

UPDATE public."LLMProvider"
SET "IsActive" = false
WHERE "Type" = 'LLM'
  AND "ModelName" NOT IN ('models/gemini-3.1-flash-lite', 'models/gemini-3.5-flash');

UPDATE public."LLMProvider"
SET "IsActive" = true
WHERE "Type" = 'LLM'
  AND "ModelName" IN ('models/gemini-3.1-flash-lite', 'models/gemini-3.5-flash');
