-- LLMProvider admin 시드 RPC (publishable key + caller admin)

CREATE OR REPLACE FUNCTION public.nrm_rpc_admin_replace_llm_providers(
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

  DELETE FROM public."LLMProvider";

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public."LLMProvider" (
      "ProviderName",
      "Type",
      "ModelName",
      "ModelDisplayName",
      "Version",
      "Description",
      "ApiKey",
      "IsActive",
      "DailyLimit",
      "MonthlyLimit"
    )
    VALUES (
      v_row->>'ProviderName',
      v_row->>'Type',
      v_row->>'ModelName',
      v_row->>'ModelDisplayName',
      v_row->>'Version',
      NULLIF(v_row->>'Description', ''),
      v_row->>'ApiKey',
      COALESCE((v_row->>'IsActive')::boolean, false),
      COALESCE((v_row->>'DailyLimit')::bigint, 0),
      COALESCE((v_row->>'MonthlyLimit')::bigint, 0)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_admin_replace_llm_providers(text, jsonb)
IS 'admin: LLMProvider 전체 교체 시드 (Gemini 모델 목록 등)';

GRANT EXECUTE ON FUNCTION public.nrm_rpc_admin_replace_llm_providers(text, jsonb)
TO anon, authenticated;
