-- OAuth 원본 이름과 사용자가 직접 지정한 표시 이름을 계정별로 분리한다.

ALTER TABLE public.nrm_user_list
  ADD COLUMN IF NOT EXISTS user_custom_name TEXT;

COMMENT ON COLUMN public.nrm_user_list.user_custom_name IS
  '사용자가 앱 설정에서 지정한 계정별 표시 이름. NULL이면 OAuth 원본 user_name 사용';

DROP FUNCTION IF EXISTS public.nrm_rpc_register_oauth_user(text, text, text, text);

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
    'user_custom_name', v_row.user_custom_name,
    'user_email', v_row.user_email,
    'oauth_user_id', v_row.oauth_user_id,
    'app_kind', v_row.app_kind,
    'is_admin', v_row.is_admin,
    'version', v_row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_set_user_custom_name(
  p_serial_no text,
  p_user_custom_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial_no text;
  v_custom_name text;
  v_row public.nrm_user_list%ROWTYPE;
BEGIN
  v_serial_no := trim(coalesce(p_serial_no, ''));
  v_custom_name := nullif(trim(coalesce(p_user_custom_name, '')), '');

  IF v_serial_no = '' THEN
    RAISE EXCEPTION 'serial_no required';
  END IF;
  IF v_custom_name IS NOT NULL AND char_length(v_custom_name) > 30 THEN
    RAISE EXCEPTION 'user_custom_name too long';
  END IF;

  UPDATE public.nrm_user_list
  SET user_custom_name = v_custom_name
  WHERE id = (
    SELECT id
    FROM public.nrm_user_list
    WHERE serial_no = v_serial_no
    ORDER BY id DESC
    LIMIT 1
  )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'user_list row not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'serial_no', v_row.serial_no,
    'user_name', v_row.user_name,
    'user_custom_name', v_row.user_custom_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nrm_rpc_set_user_custom_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_set_user_custom_name(text, text)
  TO anon, authenticated;
