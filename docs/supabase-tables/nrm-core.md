# 기존 NRM 코어 테이블

GitHub `data/*.json`에서 이전한 운영 테이블.  
컬럼명은 Postgres `snake_case`. 상세 DDL·RLS는 `supabase/migrations/` 참고.

앱 타입 매핑: `app/lib/nrmSupabaseDatabase.types.ts`  
적용 절차: [`docs/SUPABASE-SETUP.md`](../SUPABASE-SETUP.md)

| 테이블 | 출처 JSON | 요약 |
|--------|-----------|------|
| `nrm_apk_version` | `data/apkVersion.json` | 공개 APK 최신 버전 |
| `nrm_alarm` | `data/alarm.json` | 인앱 알림·공지 |
| `nrm_user_ban_list` | `data/userBanList.json` | 사용자 차단·해제 |
| `nrm_inquiry` | `data/inquiry.json` | 문의하기 (+ Storage 첨부) |
| `nrm_user_list` | `data/custom-apk/userList.json` | 디바이스 바인딩·사용자 목록 (관리자 placeholder 포함) |
| `nrm_music_list` | (앱 음악 목록) | 마이그레이션 `20260629150000_*` 등 |

### LLM 연동 시 주의

| 항목 | NRM | LLM 테이블 |
|------|-----|------------|
| 사용자 식별 | `nrm_user_list.serial_no` (**text**) | `LLMUserQuota` / `LLMTokenHistory`.`SerialNo` (**varchar**, 동일 문자열) |

연동 시 `serial_no` 문자열을 그대로 사용 (`admin` 포함).

### `nrm_user_list` 관리자 placeholder

| 컬럼 | 값 | 비고 |
|------|-----|------|
| `user_name` | `관리자` | 관리자 UI 사용자 피커 표시 |
| `serial_no` | `admin` | `LLMUserQuota` 등과 동일 식별자 |
| `app_name`, `version` | `''` (기본) | 기록 불필요 |
| `device_id`, `last_access_date` | `NULL` | 디바이스 바인딩·접속 추적 미사용 |
| `created_date` | 마이그레이션 적용일 | `NOT NULL` 제약 |

시드: `supabase/migrations/20260722170000_nrm_user_list_admin_seed.sql` (중복 `admin` 행은 삽입하지 않음).
