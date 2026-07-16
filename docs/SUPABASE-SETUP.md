# Supabase 데이터베이스 (NullReferMusic)

GitHub `data/*.json` 5종을 Supabase Postgres + Storage로 이전하기 위한 스키마·시드·적용 절차.

## 프로젝트

| 항목 | 값 |
|------|-----|
| Project URL | `https://bwkiaapffroyveqqjhom.supabase.co` |
| Publishable Key | `app/lib/nrmSupabaseConfig.ts` (APK 클라이언트용) |
| Storage 버킷 | `inquiry-attachments` (문의 첨부, 공개 읽기) |

## 테이블 정의서 (컬럼 주석 SSOT)

Supabase UI에 컬럼 주석이 잘 안 보이므로, **의미·DDL·제약은 MD에 둔다.**

→ [`docs/supabase-tables/README.md`](./supabase-tables/README.md)

| 그룹 | MD |
|------|-----|
| LLM (`LLMProvider`, `LLMUserPermission`, `LLMUserQuota`, `LLMTokenHistory`) | [`supabase-tables/llm.md`](./supabase-tables/llm.md) |
| Chat (`ChatSession`, `ChatMessage`) | [`supabase-tables/chat.md`](./supabase-tables/chat.md) |
| 기존 NRM 코어 | [`supabase-tables/nrm-core.md`](./supabase-tables/nrm-core.md) |

## 테이블 매핑 (GitHub JSON → NRM)

| GitHub JSON | Supabase 테이블 | 비고 |
|-------------|-----------------|------|
| `data/apkVersion.json` | `nrm_apk_version` | 최신 1건: `created_date` 내림차순 + `id` 내림차순, `limit=1` (뷰 없음) |
| `data/alarm.json` | `nrm_alarm` | `date` → `alarm_date` |
| `data/userBanList.json` | `nrm_user_ban_list` | `date` → `ban_date` |
| `data/inquiry.json` | `nrm_inquiry` | `attachedFile` → Storage path |
| `data/custom-apk/userList.json` | `nrm_user_list` | 디바이스 바인딩 |

기존 NRM 컬럼명은 Postgres 관례(`snake_case`). LLM 테이블은 PascalCase quoted 식별자. 앱 타입 매핑은 `app/lib/nrmSupabaseDatabase.types.ts` 참고.

## 파일

| 경로 | 설명 |
|------|------|
| `supabase/migrations/20260629120000_nrm_initial_schema.sql` | 테이블·RLS·Storage 버킷 |
| `supabase/migrations/20260629130000_drop_nrm_apk_version_latest_view.sql` | (이미 스키마 적용한 DB) 뷰 제거 |
| `supabase/migrations/20260629140000_nrm_rls_rpc.sql` | RLS 강화: anon 직접 쓰기 제거, SECURITY DEFINER RPC |
| `supabase/migrations/20260716100000_llm_tables.sql` | LLM 제공자·쿼터·호출 이력 (원격 수동 생성 시 스킵) |
| `supabase/migrations/20260716110000_llm_user_permission.sql` | LLM 사용자 권한·할당 토큰 (원격 수동 생성 시 스킵) |
| `supabase/migrations/20260716120000_chat_session_message.sql` | Chat 세션·메시지 (원격 수동 생성 시 스킵) |
| `supabase/seed.sql` | GitHub JSON 기존 데이터 (재생성: 아래 명령) |
| `scripts/generate-supabase-seed.mjs` | JSON → seed.sql 생성 |
| `scripts/Sync-NrmGithubUserListToSupabase.ps1` | GitHub userList → Supabase 정합성 동기화 |
| `scripts/Apply-NrmSupabaseMigration.ps1` | 원격 DB에 SQL 적용 (service role 필요) |

## 1. 스키마 적용 (최초 1회)

Supabase Dashboard → **SQL Editor** → New query → 아래 파일 내용 붙여넣기 후 Run:

1. `supabase/migrations/20260629120000_nrm_initial_schema.sql`
2. `supabase/seed.sql` (선택 — 기존 GitHub 데이터 이전)
3. `supabase/migrations/20260629140000_nrm_rls_rpc.sql` (**필수** — 앱·빌드 스크립트 RPC 연동 후)

GitHub `userList.json`과 Supabase가 어긋난 경우:

```powershell
.\scripts\Sync-NrmGithubUserListToSupabase.ps1 -RepoRoot . -UpdateLocalJson
```

RLS RPC 마이그레이션 적용 후에는 동기화도 RPC(`nrm_rpc_admin_sync_user_list_row`, caller `admin`)를 사용합니다.

또는 **Database password** 또는 **service_role key**를 제공하면 `Apply-NrmSupabaseMigration.ps1`로 자동 적용 가능.

## 2. seed 재생성

```powershell
node scripts/generate-supabase-seed.mjs
```

GitHub JSON(`data/`) 수정 후 seed를 다시 만들 때 실행.

## 3. RLS 정책 (RPC 강화)

- **SELECT**: `anon` / `authenticated` — 읽기는 기존과 동일 (앱 목록·조회 제약 없음)
- **INSERT/UPDATE/DELETE (테이블 직접)**: `anon` **불가** — publishable key만으로는 임의 행 삽입·수정 불가
- **쓰기**: `nrm_rpc_*` 함수(Security Definer) 경유 — 앱·빌드 스크립트가 동일하게 CRUD
  - 일반 사용자: 본인 `serial_no`로 디바이스 바인딩·문의 등록
  - 관리자(`SerialNo=admin`): 차단·문의 답변·디바이스 초기화·userList 동기화
- **Storage** (`inquiry-attachments`): anon 업로드 유지 (신규 문의 첨부만; 기존 GitHub 첨부는 마이그레이션 안 함)

보안 효과: 키가 유출되어도 PostgREST로 테이블을 직접 덮어쓸 수 없고, RPC에 정의된 연산만 가능합니다. (구 GitHub PAT 내장과 유사한 수준이지만 **무제한 SQL 쓰기**는 막힙니다.)

Edge Function + `service_role`로 더 강화하려면 RPC를 Edge에서만 호출하도록 바꿀 수 있으나, 현재는 앱 CRUD 제약 없이 RPC만으로 운영합니다.

## 4. 앱 연동 (완료)

앱은 `@supabase/supabase-js` + `app/lib/nrmSupabaseConfig.ts`의 publishable key로 CRUD합니다.

- 읽기: `nrmAlarmClient`, `nrmUserBanClient`, `nrmInquiryClient`, `nrmUserListClient`, `nrmApkUpdate`
- 쓰기: `nrmGithub*Register.ts` (이름은 레거시, 구현은 Supabase)
- 문의 첨부: Storage 버킷 `inquiry-attachments`
- APK 릴리스 빌드(do-custom=N): `Publish-NrmApkGithubRelease.ps1`가 `nrm_apk_version`에 INSERT

GitHub `data/*.json`은 더 이상 앱 런타임에서 사용하지 않습니다. (FA 모델·APK 파일은 GitHub Releases 유지)

### 문의 첨부 마이그레이션 (수동)

기존 `data/inquiryAttachFile/` 파일은 Storage에 아직 없을 수 있습니다. GitHub에만 있는 첨부는 다운로드 실패할 수 있으므로, 필요 시 Storage로 업로드하세요.

## 5. 필요한 추가 정보 (사용자 → 에이전트)

| 정보 | 용도 |
|------|------|
| **service_role key** (`sb_secret_...`) | SQL 마이그레이션 자동 적용, 서버/빌드 스크립트 |
| **Database password** | psql / Supabase CLI link |
| (선택) 기존 `inquiryAttachFile/` 파일 | Storage로 일괄 업로드 |

Publishable key만으로는 DDL(테이블 생성)을 실행할 수 없습니다. Dashboard SQL Editor에서 수동 실행하거나 service role을 알려주세요.
