-- admin APK LLMUserPermission 시드 RPC (publishable key + caller admin)
-- LLMUserPermission.SerialNo 는 varchar (앱 SerialNo 원문, 예: "admin", "1092452918")

CREATE OR REPLACE FUNCTION public.nrm_rpc_admin_upsert_llm_user_permissions(
  p_caller_serial text,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_count integer := 0;
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public."LLMUserPermission" (
      "SerialNo",
      "ProviderID",
      "IsApproved",
      "AllocatedToken",
      "ApprovedDate",
      "UpdateDate"
    )
    VALUES (
      v_row->>'SerialNo',
      (v_row->>'ProviderID')::bigint,
      COALESCE((v_row->>'IsApproved')::boolean, false),
      COALESCE((v_row->>'AllocatedToken')::bigint, 0),
      COALESCE((v_row->>'ApprovedDate')::timestamptz, now()),
      now()
    )
    ON CONFLICT ("SerialNo", "ProviderID") DO UPDATE SET
      "IsApproved" = EXCLUDED."IsApproved",
      "AllocatedToken" = EXCLUDED."AllocatedToken",
      "ApprovedDate" = EXCLUDED."ApprovedDate",
      "UpdateDate" = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_admin_upsert_llm_user_permissions(text, jsonb)
IS 'admin: LLMUserPermission upsert (SerialNo×ProviderID)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_admin_upsert_llm_user_permissions(text, jsonb)
TO anon, authenticated;
