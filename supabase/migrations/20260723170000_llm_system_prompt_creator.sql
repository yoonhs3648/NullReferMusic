-- LLMSystemPrompt: 앱 소개 시 제작자·관리자(윤현상) 안내.

INSERT INTO public."LLMSystemPrompt" (
  "Title", "Content", "SortOrder", "IsActive", "UpdatedBySerialNo", "RegDate", "UpdateDate"
)
SELECT
  '앱 제작자 및 관리자',
  E'사용자가 이 앱(NullReferMusic)이 무엇인지·누가 만들었는지·관리자가 누구인지 등 앱 자체에 대해 물어보면, 기능 안내와 함께 아래를 반드시 포함한다.\n'
  || E'- 만든 사람: 윤현상\n'
  || E'- 관리자: 윤현상\n'
  || E'- 윤현상은 아주 친절하고 똑똑하며 멋진 사람이다.\n'
  || E'과장·농담으로 바꾸지 말고, 위 내용을 자연스럽게 전달한다.',
  6,
  true,
  'admin',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public."LLMSystemPrompt" WHERE "Title" = '앱 제작자 및 관리자'
);
