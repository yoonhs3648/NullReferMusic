-- 사용자 차단을 serial_no(계정)가 아니라 device_id(기기) 기준으로 적용
-- 같은 기기에서 Google/Kakao 계정을 바꿔도 차단 유지

ALTER TABLE public.nrm_user_ban_list
  ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.nrm_user_ban_list.device_id IS
  '차단 대상 기기. nrm_user_list.device_id(ANDROID_ID SHA-256)와 동일. 빈 문자열은 레거시 행(미백필)';
COMMENT ON COLUMN public.nrm_user_ban_list.serial_no IS
  '차단 등록 시점의 계정 serial_no 스냅샷. 판정 키는 device_id';
COMMENT ON COLUMN public.nrm_user_ban_list.user_name IS
  '차단 등록 시점의 표시 이름 스냅샷';
COMMENT ON TABLE public.nrm_user_ban_list IS
  '기기(device_id) 단위 차단·해제 이력. 최신 id 행의 is_banned가 해당 기기에 적용됨';

UPDATE public.nrm_user_ban_list b
SET device_id = u.device_id
FROM (
  SELECT DISTINCT ON (serial_no)
    serial_no,
    device_id
  FROM public.nrm_user_list
  WHERE device_id IS NOT NULL
    AND trim(device_id) <> ''
  ORDER BY serial_no, id DESC
) u
WHERE b.serial_no = u.serial_no
  AND trim(b.device_id) = '';

CREATE INDEX IF NOT EXISTS nrm_user_ban_list_device_id_idx
  ON public.nrm_user_ban_list (device_id, id DESC)
  WHERE device_id <> '';

DROP FUNCTION IF EXISTS public.nrm_rpc_insert_user_ban(text, text, text, text, date);

CREATE OR REPLACE FUNCTION public.nrm_rpc_insert_user_ban(
  p_caller_serial text,
  p_user_name text,
  p_serial_no text,
  p_device_id text,
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
  v_device text;
BEGIN
  IF NOT public.nrm_is_admin_caller(p_caller_serial) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  v_device := trim(coalesce(p_device_id, ''));
  IF v_device = '' THEN
    RAISE EXCEPTION 'device_id required';
  END IF;
  INSERT INTO public.nrm_user_ban_list (
    user_name, serial_no, device_id, content, is_banned, ban_date
  )
  VALUES (
    trim(coalesce(p_user_name, '')),
    trim(coalesce(p_serial_no, '')),
    v_device,
    coalesce(p_content, ''),
    true,
    p_ban_date
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nrm_rpc_insert_user_ban(text, text, text, text, text, date)
  TO anon, authenticated;
