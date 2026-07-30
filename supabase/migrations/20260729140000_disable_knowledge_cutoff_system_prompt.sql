-- 학습 컷오프/최신정보 규칙은 systemInstruction으로 AI에 전달하지 않음.
UPDATE public."LLMSystemPrompt"
SET
  "IsActive" = false,
  "UpdateDate" = now(),
  "UpdatedBySerialNo" = 'admin'
WHERE "Title" IN ('학습 컷오프 규칙', '학습 범위 규칙');
