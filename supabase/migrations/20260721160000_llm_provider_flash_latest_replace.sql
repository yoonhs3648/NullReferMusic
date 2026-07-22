-- models/gemini-2.5-flash 는 Google이 신규 호출을 막아(404 "no longer available to
-- new users") 더 이상 동작하지 않는다(2026-07-21 llm-chat-send 로그로 확인).
-- 기존 행은 이력 보존을 위해 삭제하지 않고 IsActive=false로만 변경하고,
-- 실제 동작 확인(테스트 성공)한 models/gemini-flash-latest를 새 행으로 추가해
-- IsActive=true로 켠다. ApiKey/Type/Description/DailyLimit/MonthlyLimit은
-- 기존 gemini-2.5-flash 행 값을 그대로 재사용(서브쿼리로 복사, 값 재입력 없음).

UPDATE public."LLMProvider"
SET "IsActive" = false
WHERE "ModelName" = 'models/gemini-2.5-flash';

INSERT INTO public."LLMProvider"
  ("ProviderName", "Type", "ModelName", "ModelDisplayName", "Version", "Description", "ApiKey", "IsActive", "DailyLimit", "MonthlyLimit")
SELECT
  "ProviderName",
  "Type",
  'models/gemini-flash-latest',
  'Gemini Flash (Latest)',
  'latest',
  'Google이 자동으로 최신 Flash 모델을 매핑하는 별칭(2026-07-21 기준 gemini-3.5-flash). models/gemini-2.5-flash가 신규 호출 차단(404)되어 대체.',
  "ApiKey",
  true,
  "DailyLimit",
  "MonthlyLimit"
FROM public."LLMProvider"
WHERE "ModelName" = 'models/gemini-2.5-flash'
  AND NOT EXISTS (
    SELECT 1 FROM public."LLMProvider" WHERE "ModelName" = 'models/gemini-flash-latest'
  );

-- admin APK 전체 사용 허용(무제한) — 기존 gemini-2.5-flash 권한 세팅과 동일 패턴.
INSERT INTO public."LLMUserPermission" ("SerialNo", "ProviderID", "IsApproved", "AllocatedToken", "ApprovedDate")
SELECT 'admin', p."ProviderID", true, 0, now()
FROM public."LLMProvider" p
WHERE p."ModelName" = 'models/gemini-flash-latest'
ON CONFLICT ("SerialNo", "ProviderID") DO UPDATE SET
  "IsApproved" = EXCLUDED."IsApproved",
  "AllocatedToken" = EXCLUDED."AllocatedToken",
  "ApprovedDate" = EXCLUDED."ApprovedDate",
  "UpdateDate" = now();
