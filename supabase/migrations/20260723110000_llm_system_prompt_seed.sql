-- LLMSystemPrompt 시드: 기존 Edge Function 하드코딩 시스템 프롬프트를 DB로 이전.
-- (날짜 숫자 자체는 매 요청 코드가 주입 — DB에는 "해석 규칙"만 둔다)
-- 멱등: Title 기준 미존재 시에만 INSERT.

INSERT INTO public."LLMSystemPrompt" (
  "Title", "Content", "SortOrder", "IsActive", "UpdatedBySerialNo", "RegDate", "UpdateDate"
)
SELECT
  '현재 시각 해석 규칙',
  E'서버가 매 요청 systemInstruction 맨 앞에 넣는 [CURRENT_DATETIME] 블록은 요청 순간에 계산한 실제 현재 시각이다(모델 학습 데이터·고정 예시가 아님).\n'
  || E'타임존은 Asia/Seoul(KST, UTC+9)이다.\n'
  || E'"오늘/어제/이번 주/현재" 같은 상대 표현은 그 블록의 날짜·시각을 유일한 기준으로 해석한다.\n'
  || E'날짜·시각만 묻는 질문에는 웹 검색 없이 [CURRENT_DATETIME] 값으로 바로 답한다.\n'
  || E'다른 달력 날짜를 지어내지 않는다.',
  1,
  true,
  'admin',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMSystemPrompt" WHERE "Title" = '현재 시각 해석 규칙'
);

INSERT INTO public."LLMSystemPrompt" (
  "Title", "Content", "SortOrder", "IsActive", "UpdatedBySerialNo", "RegDate", "UpdateDate"
)
SELECT
  'Google Search 사용 규칙',
  E'google_search 도구가 요청에 포함될 수 있다.\n'
  || E'실시간 차트·뉴스·웹 최신 정보가 필요할 때만 검색해 답한다.\n'
  || E'인터넷 검색이 꺼져 있거나 불가능하다고 말하지 않는다.\n'
  || E'검색 결과가 있으면 그 내용을 바탕으로 답하고, 출처가 있으면 함께 안내한다.',
  2,
  true,
  'admin',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMSystemPrompt" WHERE "Title" = 'Google Search 사용 규칙'
);
