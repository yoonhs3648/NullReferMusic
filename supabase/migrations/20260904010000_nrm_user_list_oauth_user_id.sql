-- OAuth 이메일이 제공되지 않는 공급자도 고유 사용자 ID로 등록한다.

ALTER TABLE public.nrm_user_list
  ADD COLUMN IF NOT EXISTS oauth_user_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS nrm_user_list_app_kind_oauth_user_id_uidx
  ON public.nrm_user_list (app_kind, oauth_user_id)
  WHERE oauth_user_id <> '';

COMMENT ON COLUMN public.nrm_user_list.oauth_user_id IS
  'OAuth 공급자가 발급한 사용자 고유 ID. 이메일 미제공 계정의 로그인 식별자';
COMMENT ON COLUMN public.nrm_user_list.user_email IS
  'OAuth 공급자가 제공한 이메일. 동의 항목에 따라 빈 문자열일 수 있음';

CREATE OR REPLACE FUNCTION public.nrm_rpc_register_oauth_user(
  p_app_kind text,
  p_user_name text,
  p_user_email text,
  p_oauth_user_id text,
  p_version text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_email text;
  v_oauth_user_id text;
  v_name text;
  v_row public.nrm_user_list%ROWTYPE;
BEGIN
  v_kind := lower(trim(coalesce(p_app_kind, '')));
  v_email := lower(trim(coalesce(p_user_email, '')));
  v_oauth_user_id := trim(coalesce(p_oauth_user_id, ''));
  v_name := trim(coalesce(p_user_name, ''));

  IF v_kind NOT IN ('google', 'kakao') THEN
    RAISE EXCEPTION 'invalid app_kind';
  END IF;
  IF v_email = '' AND v_oauth_user_id = '' THEN
    RAISE EXCEPTION 'oauth user identifier required';
  END IF;
  IF v_name = '' THEN
    v_name := CASE
      WHEN v_email <> '' THEN split_part(v_email, '@', 1)
      WHEN v_kind = 'kakao' THEN '카카오 사용자'
      ELSE 'Google 사용자'
    END;
  END IF;

  IF v_oauth_user_id <> '' THEN
    SELECT * INTO v_row
    FROM public.nrm_user_list
    WHERE app_kind = v_kind
      AND oauth_user_id = v_oauth_user_id
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  -- 기존 이메일 기반 계정은 첫 로그인 때 공급자 ID를 연결한다.
  IF v_row.id IS NULL AND v_email <> '' THEN
    SELECT * INTO v_row
    FROM public.nrm_user_list
    WHERE app_kind = v_kind
      AND lower(user_email) = v_email
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  IF v_row.id IS NOT NULL THEN
    UPDATE public.nrm_user_list
    SET user_name = v_name,
        user_email = CASE WHEN v_email <> '' THEN v_email ELSE user_email END,
        oauth_user_id = CASE
          WHEN v_oauth_user_id <> '' THEN v_oauth_user_id
          ELSE oauth_user_id
        END,
        version = coalesce(nullif(trim(p_version), ''), version)
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.nrm_user_list (
      app_kind,
      user_name,
      user_email,
      oauth_user_id,
      serial_no,
      version,
      created_date,
      is_admin
    )
    VALUES (
      v_kind,
      v_name,
      v_email,
      v_oauth_user_id,
      gen_random_uuid()::text,
      coalesce(trim(p_version), ''),
      CURRENT_DATE,
      'n'
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'serial_no', v_row.serial_no,
    'user_name', v_row.user_name,
    'user_email', v_row.user_email,
    'oauth_user_id', v_row.oauth_user_id,
    'app_kind', v_row.app_kind,
    'is_admin', v_row.is_admin,
    'version', v_row.version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.nrm_rpc_register_oauth_user(text, text, text, text, text)
  TO anon, authenticated;
