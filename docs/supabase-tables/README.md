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
| 기존 NRM | [`nrm-core.md`](./nrm-core.md) | `nrm_apk_version`, `nrm_alarm`, `nrm_user_ban_list`, `nrm_inquiry`, `nrm_user_list` | 운영 중 |
| 시스템 스케줄 | [`system-schedule.md`](./system-schedule.md) | `nrm_system_schedule`, `nrm_system_schedule_run`, `nrm_system_schedule_log` | 마이그레이션 `20260904150000_*` + `20260908100000_*` + `20260908114000_*` + `20260908125000_*` + `20260908133000_*` + `20260908145000_*`(weekly·Last.fm 태그 갱신) + `20260908150000_*`(monthly·운영 데이터 정리) + `20260910140000_*`(매일/매주/매월/1회 타이밍) + `20260910160000_*`(매분 N분) + `20260910161000_*`(MusicBrainz 503 재시도) + `20260910170000_*`(실행 상세 성공/실패·503 재시도 실패 분류) + `20260910180000_*`(catalog Last.fm 필터·연도 쿼터) + `20260910181000_*`(실패 목록 job_status) + `20260911100000_*`(모든 스케줄 off·수집 데이터 전량 삭제) |
| Track 이력 | [`track-history.md`](./track-history.md) | `TrackHistory` (+ Storage `album-covers`) | 원격 생성됨 |
| 음악 동기화·벡터 | [`musicbrainz-lastfm-vector.md`](./musicbrainz-lastfm-vector.md) | MusicBrainz 원장, Last.fm Top 아티스트 발매예정 4스케줄, Last.fm Top Tracks catalog 4스케줄·배타 Recording·동적 용량, 매주 전곡 Last.fm 태그 갱신, MusicBrainz 503 재시도 큐, `music_upcoming_release` 스테이징, allowlist·용량·purge, Last.fm 태그 원장, outbox/inbox, `lastfm_recording_embedding` | 프로젝트 1 수집 DB·Last.fm artist/track pool·태그 갱신 worker·관리자 계약. catalog·주간 갱신은 `track.getTopTags` 원장만 저장. 벡터 projection worker는 미구현. **빈 테이블이라도 계약상 DROP 금지**(§5.12). `music_mb_transient_retry`만 성공 시 DELETE 허용. |

설정·적용 절차는 [`docs/SUPABASE-SETUP.md`](../SUPABASE-SETUP.md) 참고.
