-- AI Lab 인터넷 검색은 UI 토글만 사용. DB 시스템 프롬프트의 검색 규칙 비활성.
UPDATE public."LLMSystemPrompt"
SET
  "IsActive" = false,
  "UpdateDate" = now(),
  "UpdatedBySerialNo" = 'admin'
WHERE "Title" = 'Google Search 사용 규칙';
