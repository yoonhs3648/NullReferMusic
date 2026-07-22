-- admin APK LLMUserPermission 시드
-- SerialNo='admin' (varchar) — APK text serial 원문 그대로 저장 (bigint 매핑 아님)
-- AllocatedToken=0 → 무제한 (LLMProvider DailyLimit/MonthlyLimit 과 동일 규칙)
-- 대상: IsActive=true 인 models/gemini-2.5-flash, models/gemini-embedding-2
-- 선행: supabase/seed_llm_provider_gemini.sql (LLMProvider) 적용 후 실행

INSERT INTO public."LLMUserPermission" ("SerialNo","ProviderID","IsApproved","AllocatedToken","ApprovedDate")
SELECT 'admin', p."ProviderID", true, 0, now()
FROM public."LLMProvider" p
WHERE p."ModelName" = 'models/gemini-2.5-flash' AND p."IsActive" = true
ON CONFLICT ("SerialNo","ProviderID") DO UPDATE SET
  "IsApproved" = EXCLUDED."IsApproved",
  "AllocatedToken" = EXCLUDED."AllocatedToken",
  "ApprovedDate" = EXCLUDED."ApprovedDate",
  "UpdateDate" = now();

INSERT INTO public."LLMUserPermission" ("SerialNo","ProviderID","IsApproved","AllocatedToken","ApprovedDate")
SELECT 'admin', p."ProviderID", true, 0, now()
FROM public."LLMProvider" p
WHERE p."ModelName" = 'models/gemini-embedding-2' AND p."IsActive" = true
ON CONFLICT ("SerialNo","ProviderID") DO UPDATE SET
  "IsApproved" = EXCLUDED."IsApproved",
  "AllocatedToken" = EXCLUDED."AllocatedToken",
  "ApprovedDate" = EXCLUDED."ApprovedDate",
  "UpdateDate" = now();

-- 기존에 SerialNo=0(bigint 시절 값)으로 잘못 들어간 관리자 행이 있다면 'admin'으로 정정.
-- (varchar 전환 후 남아있는 문자열 '0' 값을 정리)
UPDATE public."LLMUserPermission"
SET "SerialNo" = 'admin', "UpdateDate" = now()
WHERE "SerialNo" = '0';
