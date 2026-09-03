-- nrm_user_list: OAuth 로그인 사용자 등록
-- app_name 삭제, app_kind / user_email / is_admin 추가
-- 관리자 판별: serial_no='admin' → is_admin='y' 행 조회

ALTER TABLE public.nrm_user_list
  ADD COLUMN IF NOT EXISTS app_kind TEXT NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS user_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_admin TEXT NOT NULL DEFAULT 'n';

UPDATE public.nrm_user_list
SET is_admin = 'y'
WHERE lower(trim(serial_no)) = 'admin';

ALTER TABLE public.nrm_user_list
  DROP CONSTRAINT IF EXISTS nrm_user_list_app_kind_check,
  DROP CONSTRAINT IF EXISTS nrm_user_list_is_admin_check;

ALTER TABLE public.nrm_user_list
  ADD CONSTRAINT nrm_user_list_app_kind_check
    CHECK (app_kind IN ('google', 'kakao')),
  ADD CONSTRAINT nrm_user_list_is_admin_check
    CHECK (is_admin IN ('y', 'n'));

ALTER TABLE public.nrm_user_list
  DROP COLUMN IF EXISTS app_name;

CREATE UNIQUE INDEX IF NOT EXISTS nrm_user_list_app_kind_email_uidx
  ON public.nrm_user_list (app_kind, lower(user_email))
  WHERE user_email <> '';

COMMENT ON COLUMN public.nrm_user_list.app_kind IS '로그인 플랫폼: google | kakao';
COMMENT ON COLUMN public.nrm_user_list.user_email IS 'Google/Kakao에서 받은 이메일';
COMMENT ON COLUMN public.nrm_user_list.is_admin IS '관리자 여부 y/n. 기본 n. y이면 기존 관리자 기능 전부 사용';
COMMENT ON COLUMN public.nrm_user_list.user_name IS 'Google/Kakao에서 받은 표시 이름';
COMMENT ON COLUMN public.nrm_user_list.serial_no IS '로그인 시 발급하는 UUID. 앱 내 사용자 식별자';

COMMENT ON TABLE public.nrm_user_list IS
  'OAuth 로그인 사용자·디바이스 바인딩. '
  'is_admin=y 행이 관리자. serial_no=admin 행은 레거시 LLM 조회용 placeholder.';

-- 관리자 판별: is_admin='y' (기존 serial_no='admin' 하드코딩 대체)
CREATE OR REPLACE FUNCTION public.nrm_is_admin_caller(p_serial text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nrm_user_list u
    WHERE trim(coalesce(p_serial, '')) <> ''
      AND u.serial_no = trim(p_serial)
      AND u.is_admin = 'y'
  );
$$;

DROP FUNCTION IF EXISTS public.nrm_rpc_insert_user_list(text, text, text, text, date);

CREATE OR REPLACE FUNCTION public.nrm_rpc_register_oauth_user(
  p_app_kind text,
  p_user_name text,
  p_user_email text,
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
  v_name text;
  v_row public.nrm_user_list%ROWTYPE;
BEGIN
  v_kind := lower(trim(coalesce(p_app_kind, '')));
  v_email := lower(trim(coalesce(p_user_email, '')));
  v_name := trim(coalesce(p_user_name, ''));

  IF v_kind NOT IN ('google', 'kakao') THEN
    RAISE EXCEPTION 'invalid app_kind';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;
  IF v_name = '' THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  SELECT * INTO v_row
  FROM public.nrm_user_list
  WHERE app_kind = v_kind
    AND lower(user_email) = v_email
  ORDER BY id DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.nrm_user_list
    SET user_name = v_name,
        version = coalesce(nullif(trim(p_version), ''), version)
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.nrm_user_list (
      app_kind, user_name, user_email, serial_no, version, created_date, is_admin
    )
    VALUES (
      v_kind,
      v_name,
      v_email,
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
    'app_kind', v_row.app_kind,
    'is_admin', v_row.is_admin,
    'version', v_row.version
  );
END;
$$;

DROP FUNCTION IF EXISTS public.nrm_rpc_admin_sync_user_list_row(text, bigint, text, text, text, text, date, text, timestamptz);

CREATE OR REPLACE FUNCTION public.nrm_rpc_admin_sync_user_list_row(
  p_caller_serial text,
  p_id bigint,
  p_app_kind text,
  p_user_name text,
  p_user_email text,
  p_serial_no text,
  p_version text,
  p_created_date date,
  p_device_id text DEFAULT NULL,
  p_last_access_date timestamptz DEFAULT NULL,
  p_is_admin text DEFAULT 'n'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  INSERT INTO public.nrm_user_list (
    id, app_kind, user_name, user_email, serial_no, version, created_date,
    device_id, last_access_date, is_admin
  )
  VALUES (
    p_id, p_app_kind, p_user_name, p_user_email, p_serial_no, p_version, p_created_date,
    p_device_id, p_last_access_date, CASE WHEN lower(trim(coalesce(p_is_admin, 'n'))) = 'y' THEN 'y' ELSE 'n' END
  )
  ON CONFLICT (id) DO UPDATE SET
    app_kind = EXCLUDED.app_kind,
    user_name = EXCLUDED.user_name,
    user_email = EXCLUDED.user_email,
    serial_no = EXCLUDED.serial_no,
    version = EXCLUDED.version,
    created_date = EXCLUDED.created_date,
    device_id = EXCLUDED.device_id,
    last_access_date = EXCLUDED.last_access_date,
    is_admin = EXCLUDED.is_admin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nrm_is_admin_caller(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_register_oauth_user(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_admin_sync_user_list_row(text, bigint, text, text, text, text, text, date, text, timestamptz, text) TO anon, authenticated;
