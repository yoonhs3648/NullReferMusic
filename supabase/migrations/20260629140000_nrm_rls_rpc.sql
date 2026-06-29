-- RLS 강화: anon 직접 INSERT/UPDATE/DELETE 제거 → SECURITY DEFINER RPC 경유
-- 읽기(SELECT)는 기존과 동일하게 anon 허용. 앱·빌드 스크립트는 RPC로 쓰기.

CREATE OR REPLACE FUNCTION public.nrm_is_admin_caller(p_serial text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(coalesce(p_serial, '')) = 'admin';
$$;

-- ── user_list ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nrm_rpc_insert_user_list(
  p_app_name text,
  p_user_name text,
  p_serial_no text,
  p_version text,
  p_created_date date DEFAULT CURRENT_DATE
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.nrm_user_list (app_name, user_name, serial_no, version, created_date)
  VALUES (p_app_name, p_user_name, p_serial_no, p_version, p_created_date)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_update_user_list_device(
  p_entry_id bigint,
  p_serial_no text,
  p_device_id text DEFAULT NULL,
  p_last_access_date timestamptz DEFAULT NULL,
  p_bind_device boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_bind_device THEN
    UPDATE public.nrm_user_list
    SET device_id = p_device_id,
        last_access_date = p_last_access_date
    WHERE id = p_entry_id
      AND serial_no = p_serial_no
      AND (device_id IS NULL OR device_id = '');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'device bind failed';
    END IF;
    RETURN;
  END IF;

  UPDATE public.nrm_user_list
  SET last_access_date = p_last_access_date
  WHERE id = p_entry_id
    AND serial_no = p_serial_no
    AND (
      device_id IS NULL
      OR device_id = ''
      OR device_id = p_device_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_reset_user_list_device(
  p_caller_serial text,
  p_entry_id bigint
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
  UPDATE public.nrm_user_list
  SET device_id = ''
  WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_list row not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_admin_sync_user_list_row(
  p_caller_serial text,
  p_id bigint,
  p_app_name text,
  p_user_name text,
  p_serial_no text,
  p_version text,
  p_created_date date,
  p_device_id text DEFAULT NULL,
  p_last_access_date timestamptz DEFAULT NULL
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
    id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date
  )
  VALUES (
    p_id, p_app_name, p_user_name, p_serial_no, p_version, p_created_date, p_device_id, p_last_access_date
  )
  ON CONFLICT (id) DO UPDATE SET
    app_name = EXCLUDED.app_name,
    user_name = EXCLUDED.user_name,
    serial_no = EXCLUDED.serial_no,
    version = EXCLUDED.version,
    created_date = EXCLUDED.created_date,
    device_id = EXCLUDED.device_id,
    last_access_date = EXCLUDED.last_access_date;
END;
$$;

-- ── inquiry / alarm ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nrm_rpc_insert_inquiry(
  p_user_name text,
  p_serial_no text,
  p_version text,
  p_content text,
  p_attached_file text DEFAULT '',
  p_created_date timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.nrm_inquiry (
    user_name, serial_no, version, content, attached_file, is_answered, reply_content, created_date
  )
  VALUES (
    p_user_name, p_serial_no, p_version, p_content, coalesce(p_attached_file, ''),
    false, '', p_created_date
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_reply_inquiry(
  p_caller_serial text,
  p_inquiry_id bigint,
  p_reply_content text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial text;
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  SELECT serial_no INTO v_serial
  FROM public.nrm_inquiry
  WHERE id = p_inquiry_id AND is_answered = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inquiry not found or already answered';
  END IF;
  UPDATE public.nrm_inquiry
  SET reply_content = p_reply_content,
      is_answered = true
  WHERE id = p_inquiry_id;
  RETURN trim(v_serial);
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_insert_alarm(
  p_is_noti boolean,
  p_title text,
  p_content text,
  p_serial_no text,
  p_alarm_date date DEFAULT CURRENT_DATE
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.nrm_alarm (is_noti, title, content, serial_no, alarm_date)
  VALUES (p_is_noti, p_title, coalesce(p_content, ''), coalesce(p_serial_no, ''), p_alarm_date)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── user_ban ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nrm_rpc_insert_user_ban(
  p_caller_serial text,
  p_user_name text,
  p_serial_no text,
  p_content text,
  p_ban_date date DEFAULT CURRENT_DATE
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  INSERT INTO public.nrm_user_ban_list (user_name, serial_no, content, is_banned, ban_date)
  VALUES (p_user_name, p_serial_no, p_content, true, p_ban_date)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nrm_rpc_unban_user(
  p_caller_serial text,
  p_ban_id bigint
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
  UPDATE public.nrm_user_ban_list
  SET is_banned = false
  WHERE id = p_ban_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ban row not found';
  END IF;
END;
$$;

-- ── apk_version (릴리스 빌드 스크립트) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nrm_rpc_insert_apk_version(
  p_version text,
  p_created_date timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.nrm_apk_version (version, created_date)
  VALUES (p_version, p_created_date)
  ON CONFLICT (version) DO UPDATE SET created_date = EXCLUDED.created_date
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── RPC 실행 권한 (anon = publishable key) ───────────────────────────────────

GRANT EXECUTE ON FUNCTION public.nrm_rpc_insert_user_list(text, text, text, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_update_user_list_device(bigint, text, text, timestamptz, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_reset_user_list_device(text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_admin_sync_user_list_row(text, bigint, text, text, text, text, date, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_insert_inquiry(text, text, text, text, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_reply_inquiry(text, bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_insert_alarm(boolean, text, text, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_insert_user_ban(text, text, text, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_unban_user(text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nrm_rpc_insert_apk_version(text, timestamptz) TO anon, authenticated;

-- ── anon 직접 테이블 쓰기 정책 제거 ─────────────────────────────────────────

DROP POLICY IF EXISTS nrm_apk_version_insert_anon ON public.nrm_apk_version;
DROP POLICY IF EXISTS nrm_apk_version_update_anon ON public.nrm_apk_version;
DROP POLICY IF EXISTS nrm_alarm_insert_anon ON public.nrm_alarm;
DROP POLICY IF EXISTS nrm_alarm_update_anon ON public.nrm_alarm;
DROP POLICY IF EXISTS nrm_alarm_delete_anon ON public.nrm_alarm;
DROP POLICY IF EXISTS nrm_user_ban_list_insert_anon ON public.nrm_user_ban_list;
DROP POLICY IF EXISTS nrm_user_ban_list_update_anon ON public.nrm_user_ban_list;
DROP POLICY IF EXISTS nrm_inquiry_insert_anon ON public.nrm_inquiry;
DROP POLICY IF EXISTS nrm_inquiry_update_anon ON public.nrm_inquiry;
DROP POLICY IF EXISTS nrm_user_list_insert_anon ON public.nrm_user_list;
DROP POLICY IF EXISTS nrm_user_list_update_anon ON public.nrm_user_list;

-- Storage: 문의 첨부 업로드는 anon 유지 (첨부 마이그레이션 없음, 신규 업로드만)
