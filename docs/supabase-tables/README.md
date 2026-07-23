# Supabase 테이블 정의서 (컬럼 주석 포함)

Supabase Dashboard는 테이블/컬럼 `COMMENT`를 UI에서 잘 보여주지 않는다.  
**스키마·컬럼 의미의 단일 출처(SSOT)** 는 이 폴더의 MD다.

## 유지 규칙

1. Supabase에 테이블을 **추가·변경**하면 **같은 작업 안에서** 이 폴더 MD를 갱신한다.
2. DDL(SQL)과 MD가 어긋나면 **MD를 실제 DB에 맞춘다.** (이미 원격에 적용된 스키마가 우선)
3. AI/개발자는 LLM·쿼터·토큰·벡터 등 DB 연동 작업 전에 **관련 MD를 먼저 읽는다.**
4. 마이그레이션 SQL은 `supabase/migrations/`에 두고, 컬럼 의미·관계·제약 설명은 여기에 둔다.

## 테이블 목록

| 그룹 | MD | 테이블 | 상태 |
|------|-----|--------|------|
| LLM | [`llm.md`](./llm.md) | `LLMProvider`, `LLMModel`, `LLMSystemPrompt`, `LLMUserPermission`, `LLMUserQuota`, `LLMTokenHistory`, `LLMUserMonthlyAllocation`, `LLMCallAttemptLog`, `LLMAiLabSuggestionCategory`, `LLMAiLabSuggestionPrompt` | 원격 생성됨 (Suggestion 2026-07-23) |
| Chat | [`chat.md`](./chat.md) | `ChatSession`, `ChatMessage` | 원격 생성됨 |
| 기존 NRM | [`nrm-core.md`](./nrm-core.md) | `nrm_apk_version`, `nrm_alarm`, `nrm_user_ban_list`, `nrm_inquiry`, `nrm_user_list`, `nrm_music_list` | 운영 중 |
| Track 이력 | [`track-history.md`](./track-history.md) | `TrackHistory` (+ Storage `album-covers`) | 원격 생성됨 |

설정·적용 절차는 [`docs/SUPABASE-SETUP.md`](../SUPABASE-SETUP.md) 참고.
