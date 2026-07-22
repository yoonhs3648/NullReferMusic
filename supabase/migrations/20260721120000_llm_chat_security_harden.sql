-- LLM/Chat 테이블 보안 강화
--
-- 배경: LLMProvider/LLMUserQuota/LLMTokenHistory/LLMUserPermission/ChatSession/ChatMessage 는
-- 생성 시(20260716100000/110000/120000) RLS를 켜지 않았다. RLS가 꺼진 테이블은 role 단위
-- GRANT만으로 접근이 결정되는데, Supabase 프로젝트는 기본적으로 anon/authenticated에
-- public 스키마 테이블 권한을 광범위하게 부여하는 경우가 많아 "쓰기는 RPC로만" 이라는
-- 이 저장소의 원칙(docs/SUPABASE-SETUP.md §3)이 이 테이블들에는 적용되지 않고 있었다.
--
-- 이 마이그레이션은:
-- 1) 위 6개 테이블에 RLS를 켜고, SELECT만 anon/authenticated에 허용한다(쓰기는 전부
--    SECURITY DEFINER RPC 경유 — nrm_rpc_chat_* 참고).
-- 2) LLMProvider."ApiKey" 컬럼을 anon/authenticated로부터 컬럼 단위로 차단한다
--    (RLS는 row 단위라 컬럼을 숨기지 못하므로 별도 컬럼 GRANT/REVOKE로 방어).
-- 3) LLMUserPermission.SerialNo 가 varchar 전환 전 bigint 값('0')으로 남아있으면
--    'admin' 문자열로 정정한다(멱등 — 대상 없으면 0행 UPDATE).

ALTER TABLE public."ChatSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LLMUserPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LLMUserQuota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LLMTokenHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LLMProvider" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_session_select_anon ON public."ChatSession";
CREATE POLICY chat_session_select_anon
  ON public."ChatSession" FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS chat_message_select_anon ON public."ChatMessage";
CREATE POLICY chat_message_select_anon
  ON public."ChatMessage" FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS llm_user_permission_select_anon ON public."LLMUserPermission";
CREATE POLICY llm_user_permission_select_anon
  ON public."LLMUserPermission" FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS llm_user_quota_select_anon ON public."LLMUserQuota";
CREATE POLICY llm_user_quota_select_anon
  ON public."LLMUserQuota" FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS llm_token_history_select_anon ON public."LLMTokenHistory";
CREATE POLICY llm_token_history_select_anon
  ON public."LLMTokenHistory" FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS llm_provider_select_anon ON public."LLMProvider";
CREATE POLICY llm_provider_select_anon
  ON public."LLMProvider" FOR SELECT TO anon, authenticated
  USING (true);

-- ApiKey는 RLS(row 단위)로 못 숨기므로 컬럼 단위로 차단.
-- 앱은 이미 ApiKey를 select 하지 않지만(app/lib/nrmLlmProviderClient.ts), DB 레벨에서도 강제한다.
REVOKE SELECT ON public."LLMProvider" FROM anon, authenticated;
GRANT SELECT (
  "ProviderID",
  "ProviderName",
  "Type",
  "ModelName",
  "ModelDisplayName",
  "Version",
  "Description",
  "IsActive",
  "DailyLimit",
  "MonthlyLimit",
  "RegDate"
) ON public."LLMProvider" TO anon, authenticated;

-- 과거 bigint 시절 admin=0 으로 들어간 잔여 행 정정 (varchar 전환 후)
UPDATE public."LLMUserPermission"
SET "SerialNo" = 'admin', "UpdateDate" = now()
WHERE "SerialNo" = '0';
