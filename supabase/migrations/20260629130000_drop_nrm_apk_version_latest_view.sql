-- nrm_apk_version_latest 뷰 제거 — 테이블에서 order+limit로 최신 1건 조회
DROP VIEW IF EXISTS public.nrm_apk_version_latest;

COMMENT ON TABLE public.nrm_apk_version IS
  'GitHub Releases 공개 APK 버전 (구 data/apkVersion.json). 최신 1건: ORDER BY created_date DESC, id DESC LIMIT 1';
