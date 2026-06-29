-- NullReferMusic Supabase seed (GitHub JSON 마이그레이션)
-- 생성: node scripts/generate-supabase-seed.mjs
BEGIN;

TRUNCATE public.nrm_apk_version, public.nrm_alarm, public.nrm_user_ban_list, public.nrm_inquiry, public.nrm_user_list RESTART IDENTITY CASCADE;

INSERT INTO public.nrm_apk_version (version, created_date) VALUES ('2.5.0', '2026-06-29 10:23:52.406'::timestamptz);

INSERT INTO public.nrm_alarm (id, is_noti, title, content, serial_no, alarm_date) VALUES (1, true, '앱 신규 버전 릴리즈 안내', 'NullReference Music V.2 릴리즈', '', '2026-06-13'::date);
INSERT INTO public.nrm_alarm (id, is_noti, title, content, serial_no, alarm_date) VALUES (2, false, '알림테스트', '테스트
입
니
다

ad

☺

★', '01092452918', '2026-06-25'::date);
INSERT INTO public.nrm_alarm (id, is_noti, title, content, serial_no, alarm_date) VALUES (3, false, '좃재학에게 보내는 메세지', '이건 윤현상의 테
스트
다
.

wic

😌😤😔

☆+:♩★♬', '01064724632', '2026-06-25'::date);
INSERT INTO public.nrm_alarm (id, is_noti, title, content, serial_no, alarm_date) VALUES (4, true, 'v2.4.7 이하 버전 패스트 스크롤러 기능 안내', 'v2.4.7 이하 버전에서는 하단 네비게이션바의 Storage 탭 리스트에서 패스트 스크롤러 인덱스 기능이 일부 안드로이드 기기에서 정상적으로 동작하지 않을 수 있습니다.

해당 문제가 발생하는 경우, 신규 패치 버전으로 업데이트해 주시기 바랍니다. 업데이트가 필요하신 경우 관리자(윤현상)에게 문의해 주세요.', '', '2026-06-26'::date);

INSERT INTO public.nrm_user_ban_list (id, user_name, serial_no, content, is_banned, ban_date) VALUES (1, 'dummydata', 'dummydata', 'dummydata', false, '1970-01-01'::date);
INSERT INTO public.nrm_user_ban_list (id, user_name, serial_no, content, is_banned, ban_date) VALUES (2, '이상용', '01092452918', '테스트', false, '2026-06-25'::date);

INSERT INTO public.nrm_inquiry (id, user_name, serial_no, version, content, attached_file, is_answered, reply_content, created_date) VALUES (1, 'test', 'testserialno', '2.1.4', '테스트', '', true, '테스트 완료', '2026-06-18 10:15:42.080'::timestamptz);

INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (1, 'NullReference Music', '테스트계정1', 'tester1', '2.1.1', '2026-06-01'::date, NULL, NULL);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (2, 'NullReference Sound', '테스트계정2', 'tester2', '2.1.2', '2026-06-02'::date, '', '2026-06-06 12:00:00.000'::timestamptz);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (3, '상용''s Music', '이상용', '01092452918', '2.4.3', '2026-06-25'::date, NULL, NULL);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (4, '상용''s Music', '이상용', '01092452918', '2.4.4', '2026-06-25'::date, NULL, NULL);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (5, '상용''s Musik', '이상용', '01092452918', '2.4.5', '2026-06-25'::date, NULL, NULL);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (6, '상용''s Music', '이상용', '01092452918', '2.4.6', '2026-06-25'::date, NULL, NULL);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (7, '재학''s Music', '한재학', '01064724632', '2.4.7', '2026-06-25'::date, '45cd692a7a40731eeb11968923848f624e4171377a9022d0cb52292c02a81b9f', '2026-06-25 15:13:15.558'::timestamptz);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (8, '상용''s Music', '이상용', '01092452918', '2.4.7', '2026-06-25'::date, '7f027fb5c00e746149616d8a6ba6837e8bcb48f72d2d8adc4a63018f13c2910e', '2026-06-25 19:29:34.705'::timestamptz);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (9, '재학2''s Music', '한재학2', 'templicense01064724632', '2.4.7', '2026-06-25'::date, 'ae588723d26dd745cfef097286c42b891770fb120b95b85e808f8420832e7ebf', '2026-06-27 05:52:10.282'::timestamptz);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (10, '수용''s Music', '장수용', '01051090968', '2.4.7', '2026-06-26'::date, NULL, NULL);
INSERT INTO public.nrm_user_list (id, app_name, user_name, serial_no, version, created_date, device_id, last_access_date) VALUES (11, '주형''s Music', '박주형', '01024147762', '2.4.7', '2026-06-26'::date, 'd3a7191dcc0dfb6c7c28fab0b9bba36c7cd027781bb81d0e0c66a19a2ef73dde', '2026-06-26 13:22:58.736'::timestamptz);

-- IDENTITY 시퀀스 동기화
SELECT setval(pg_get_serial_sequence('public.nrm_alarm', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_alarm), 1));
SELECT setval(pg_get_serial_sequence('public.nrm_user_ban_list', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_user_ban_list), 1));
SELECT setval(pg_get_serial_sequence('public.nrm_inquiry', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_inquiry), 1));
SELECT setval(pg_get_serial_sequence('public.nrm_user_list', 'id'), COALESCE((SELECT MAX(id) FROM public.nrm_user_list), 1));
COMMIT;
