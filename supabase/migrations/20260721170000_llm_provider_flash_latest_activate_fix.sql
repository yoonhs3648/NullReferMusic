-- 20260721160000의 INSERT는 'models/gemini-flash-latest' 행이 이미 존재해서
-- (과거 전체 모델 시드 때 IsActive=false로 미리 들어가 있었음) NOT EXISTS 조건에
-- 걸려 스킵됐다 — 즉 IsActive=true 반영이 안 됐다. 여기서 실제로 활성화한다.

UPDATE public."LLMProvider"
SET "IsActive" = true
WHERE "ModelName" = 'models/gemini-flash-latest';
