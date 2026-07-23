-- SortOrder는 10단위 강제 아님. 시드 10/20 → 1/2 로 정리(적용 순서만 오름차순이면 됨).

UPDATE public."LLMSystemPrompt"
SET "SortOrder" = 1, "UpdateDate" = now()
WHERE "Title" = '현재 시각 해석 규칙' AND "SortOrder" = 10;

UPDATE public."LLMSystemPrompt"
SET "SortOrder" = 2, "UpdateDate" = now()
WHERE "Title" = 'Google Search 사용 규칙' AND "SortOrder" = 20;
