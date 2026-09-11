-- 문의 등록 시 알림 수신자를 serial_no='admin' 한 명이 아니라
-- nrm_user_list.is_admin='y' 인 모든 계정으로 팬아웃한다.

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
  v_title text;
  v_content text;
  v_alarm_date date;
  v_name text;
BEGIN
  INSERT INTO public.nrm_inquiry (
    user_name, serial_no, version, content, attached_file, is_answered, reply_content, created_date
  )
  VALUES (
    p_user_name, p_serial_no, p_version, p_content, coalesce(p_attached_file, ''),
    false, '', p_created_date
  )
  RETURNING id INTO v_id;

  v_name := btrim(coalesce(p_user_name, ''));
  v_title := CASE WHEN v_name = '' THEN '문의' ELSE v_name || ' 님의 문의' END;
  v_content := to_char(
    timezone('Asia/Seoul', coalesce(p_created_date, now())),
    'YYYY-MM-DD HH24:MI:SS.MS'
  );
  v_alarm_date := (timezone('Asia/Seoul', coalesce(p_created_date, now())))::date;

  INSERT INTO public.nrm_alarm (is_noti, title, content, serial_no, alarm_date)
  SELECT false, v_title, v_content, admin_serial, v_alarm_date
  FROM (
    SELECT DISTINCT btrim(u.serial_no) AS admin_serial
    FROM public.nrm_user_list u
    WHERE u.is_admin = 'y'
      AND btrim(u.serial_no) <> ''
      AND lower(btrim(u.serial_no)) <> 'admin'
  ) admins;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.nrm_rpc_insert_inquiry(text, text, text, text, text, timestamptz) IS
  '문의 1건 INSERT 후 is_admin=y 로그인 계정마다 nrm_alarm 행을 넣는다(serial_no=admin placeholder 제외). 메인 우측 상단 알림은 각 관리자 serial_no로 수신한다.';
