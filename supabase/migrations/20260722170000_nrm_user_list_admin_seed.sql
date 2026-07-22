-- nrm_user_list: 관리자 AI 토큰 조회용 placeholder (serial_no = admin)
-- device_id / version / app_name 은 사용하지 않음. NOT NULL 컬럼만 기본값으로 채움.

INSERT INTO public.nrm_user_list (
  app_name,
  user_name,
  serial_no,
  version,
  created_date,
  device_id,
  last_access_date
)
SELECT
  '',
  '관리자',
  'admin',
  '',
  CURRENT_DATE,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.nrm_user_list u
  WHERE lower(trim(u.serial_no)) = 'admin'
);

COMMENT ON TABLE public.nrm_user_list IS
  '커스텀 APK 등록·디바이스 바인딩 (구 data/custom-apk/userList.json). '
  'serial_no=admin 행은 관리자 LLM 사용량 조회용 placeholder (디바이스 바인딩 없음).';
