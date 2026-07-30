-- 웹 검색 전면 비활성(2026-07-29)
-- 1) LLMSystemPrompt 「Google Search 사용 규칙」 비활성·보존(삭제하지 않음)
-- 2) AnswerMode=web_search 추천 칩(upcoming_release 등) 비활성 — 최신성 질문 유도 방지

UPDATE public."LLMSystemPrompt"
SET
  "IsActive" = false,
  "UpdateDate" = now(),
  "UpdatedBySerialNo" = 'admin'
WHERE "Title" = 'Google Search 사용 규칙';

UPDATE public."LLMAiLabSuggestionCategory"
SET
  "IsActive" = false
WHERE "AnswerMode" = 'web_search';

COMMENT ON COLUMN public."LLMSystemPrompt"."Content"
IS '모델에 전달할 본문. Google Search 사용 규칙(SortOrder=2)은 웹 검색 비활성으로 IsActive=false 유지.';
