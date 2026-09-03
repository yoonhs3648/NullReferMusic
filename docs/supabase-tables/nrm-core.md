# 기존 NRM 코어 테이블

GitHub `data/*.json`에서 이전한 운영 테이블.  
컬럼명은 Postgres `snake_case`. 상세 DDL·RLS는 `supabase/migrations/` 참고.

앱 타입 매핑: `app/lib/nrmSupabaseDatabase.types.ts`  
적용 절차: [`docs/SUPABASE-SETUP.md`](../SUPABASE-SETUP.md)

| 테이블 | 출처 JSON | 요약 |
|--------|-----------|------|
| `nrm_apk_version` | `data/apkVersion.json` | 공개 APK 최신 버전 |
| `nrm_alarm` | `data/alarm.json` | 인앱 알림·공지 |
| `nrm_user_ban_list` | `data/userBanList.json` | 기기(`device_id`) 단위 차단·해제 |
| `nrm_inquiry` | `data/inquiry.json` | 문의하기 (+ Storage 첨부) |
| `nrm_user_list` | `data/custom-apk/userList.json` | 디바이스 바인딩·사용자 목록 (관리자 placeholder 포함) |
| `nrm_music_list` | (앱 음악 목록) | 마이그레이션 `20260629150000_*` 등 |

### LLM 연동 시 주의

| 항목 | NRM | LLM 테이블 |
|------|-----|------------|
| 사용자 식별 | `nrm_user_list.serial_no` (**text**) | `LLMUserQuota` / `LLMTokenHistory`.`SerialNo` (**varchar**, 동일 문자열) |

연동 시 `serial_no` 문자열을 그대로 사용한다. 신규 사용자는 OAuth 등록 시 UUID가 발급되고, 레거시 `admin` placeholder 행은 LLM 조회용으로 남을 수 있다.

### `nrm_user_list` 컬럼

| 컬럼 | 타입 | 의미 |
|------|------|------|
| `id` | bigint | PK |
| `app_kind` | text | 로그인 플랫폼 `google` \| `kakao` |
| `user_name` | text | Google/Kakao에서 받은 표시 이름 |
| `user_email` | text | Google/Kakao에서 받은 이메일 |
| `serial_no` | text | 로그인 시 발급하는 UUID. 앱 내 사용자 식별자(문의·LLM·디바이스 바인딩) |
| `version` | text | 등록 시점 앱 버전 |
| `created_date` | date | 최초 등록일 |
| `device_id` | text null | ANDROID_ID SHA-256. 최초 설치 기기 바인딩 |
| `last_access_date` | timestamptz null | 마지막 앱 실행 |
| `is_admin` | text | 관리자 여부 `y`/`n`. 기본 `n`. `y`이면 기존 관리자 기능 전부 사용 |
| `inserted_at` / `updated_at` | timestamptz | 행 생성·수정 |

유니크: `(app_kind, lower(user_email))` (`user_email <> ''`).  
앱 최초 실행: Google/Kakao 로그인 → 이용약관 → `nrm_rpc_register_oauth_user`로 upsert.

### 레거시 `serial_no = admin` placeholder

| 컬럼 | 값 | 비고 |
|------|-----|------|
| `user_name` | `관리자` | 관리자 UI 사용자 피커 표시 |
| `serial_no` | `admin` | 기존 LLM 쿼타 등과 동일 식별자 |
| `is_admin` | `y` | 마이그레이션이 `serial_no=admin` 행을 `y`로 승격 |
| `device_id`, `last_access_date` | `NULL` | 디바이스 바인딩·접속 추적 미사용 |

시드: `supabase/migrations/20260722170000_nrm_user_list_admin_seed.sql` (중복 `admin` 행은 삽입하지 않음).  
스키마 변경: `supabase/migrations/20260824120000_nrm_user_list_oauth.sql` (`app_name` 삭제, `app_kind`/`user_email`/`is_admin` 추가).

### `nrm_user_ban_list` 컬럼

| 컬럼 | 타입 | 의미 |
|------|------|------|
| `id` | bigint | PK. 같은 기기는 **최신 id** 행이 적용됨 |
| `user_name` | text | 차단 등록 시점의 표시 이름 스냅샷 |
| `serial_no` | text | 차단 등록 시점의 계정 `serial_no` 스냅샷. **판정 키가 아님** |
| `device_id` | text | 차단 대상 기기. `nrm_user_list.device_id`(ANDROID_ID SHA-256)와 동일 |
| `content` | text | 차단·해제 사유 |
| `is_banned` | boolean | 해당 행이 그 기기의 최신이면 앱 이용 차단 |
| `ban_date` | date | 기록 등록일 |
| `inserted_at` / `updated_at` | timestamptz | 행 생성·수정 |

앱은 로그인 플랫폼·계정과 무관하게 **기기 `device_id`만** 본다. Google/Kakao를 바꿔도, 이후 로그아웃을 넣어도 같은 기기면 동일하게 막힌다.  
기기 미등록(`nrm_user_list.device_id` 없음) 사용자는 관리자가 차단 등록할 수 없다.  
스키마 변경: `supabase/migrations/20260824140000_nrm_user_ban_device_id.sql`.
