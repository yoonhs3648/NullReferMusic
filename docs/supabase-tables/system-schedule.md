# 시스템 스케줄 (`nrm_system_schedule`)

공통 시스템 스케줄 권위 원장. MusicBrainz 수집·AI Lab 채팅 삭제 등 앱 관리 UI에 노출되는 스케줄은 모두 이 테이블에 등록한다.

## 정책

- **신규 등록**: 마이그레이션 seed만. 앱/관리자 RPC로 INSERT·생성 불가.
- **삭제**: 금지. `BEFORE DELETE` 트리거가 `nrm_system_schedule`·`music_collection_schedule` 모두 거부.
- **관리 UI**: on/off + 실행 주기(매일 시각 / 1~1440분 간격)만.
  MusicBrainz 필터·상한·표시 이름·아티스트 대상 UI는 없음.
  AI Lab 채팅·Track History 삭제는 `retention_days` 추가 편집.
- MusicBrainz 상세 필터·상한은 linked `music_collection_schedule`에 seed로 두고, 시스템 원장이 목록·토글·타이밍의 단일 진입점이다.

마이그레이션:
- `supabase/migrations/20260904150000_nrm_system_schedule.sql`
- `supabase/migrations/20260904151000_system_schedule_timing_only.sql`
- `supabase/migrations/20260904160000_lastfm_artist_pool_schedules.sql` (Last.fm Top 4스케줄·배타 pool)
- `supabase/migrations/20260904161000_track_history_retention.sql` (Track History 180일 삭제)

---

## `nrm_system_schedule`

| 컬럼 | 타입 | 기본값 | NULL | 설명 |
|------|------|--------|------|------|
| `schedule_id` | `uuid` | `gen_random_uuid()` | NO | PK |
| `schedule_key` | `text` | — | NO | 고유 키 (예: `musicbrainz-k-pop-daily`, `ailab-chat-retention`) |
| `display_name` | `text` | — | NO | 관리 UI 표시 이름 |
| `job_kind` | `text` | — | NO | `musicbrainz_collection` \| `ailab_chat_retention` \| `track_history_retention` |
| `is_enabled` | `boolean` | `false` | NO | 활성 여부 |
| `schedule_kind` | `text` | — | NO | `daily` \| `interval` |
| `daily_time_kst` | `time` | — | YES | daily일 때 KST 시각 |
| `interval_minutes` | `integer` | — | YES | interval일 때 1~1440분 |
| `next_run_at` | `timestamptz` | `now()` | NO | 다음 실행 시각 (chat tick이 소비) |
| `config` | `jsonb` | `{}` | NO | job별 설정 |
| `created_at` / `updated_at` | `timestamptz` | `now()` | NO | 생성·수정 |

### `config` 계약

| `job_kind` | 필수 키 | 의미 |
|------------|---------|------|
| `musicbrainz_collection` | `music_schedule_id` (uuid) | linked `music_collection_schedule.schedule_id` |
| `ailab_chat_retention` | `retention_days` (1~3650) | `ChatSession.UpdateDate`·`LLMCallAttemptLog.RegDate`·`LLMTokenHistory.RegDate`가 이 일수보다 오래된 행을 물리 삭제 |
| `track_history_retention` | `retention_days` (1~3650) | `TrackHistory.DownloadDate`가 이 일수보다 오래된 이력을 물리 삭제 |

### 시드 (운영)

| schedule_key | job_kind | 기본 |
|--------------|----------|------|
| `musicbrainz-lastfm-korea-top` | musicbrainz_collection | Last.fm `geo.getTopArtists(Korea, Republic of)` Top 100 → MB 발매예정 |
| `musicbrainz-lastfm-global-top` | musicbrainz_collection | Last.fm `chart.getTopArtists` Top 100 → MB 발매예정 |
| `musicbrainz-lastfm-hiphop-top` | musicbrainz_collection | Last.fm `tag.getTopArtists(hip-hop)` Top 100 → MB 발매예정 |
| `musicbrainz-lastfm-korean-hiphop-top` | musicbrainz_collection | Last.fm `tag.getTopArtists(korean hip hop)` Top 100 → MB 발매예정 |
| `ailab-chat-retention` | ailab_chat_retention | 매일 KST 03:00, `retention_days=30`, 활성 |
| `track-history-retention` | track_history_retention | 매일 KST 08:00, `retention_days=180`, 활성 |

구키 `musicbrainz-k-pop-daily` / `musicbrainz-korean-hip-hop-daily` / `musicbrainz-global-chart-daily`는
`20260904160000_lastfm_artist_pool_schedules.sql`에서 위 Last.fm 키로 이전한다.

향후 스케줄도 **같은 원장에 마이그레이션으로만** 추가하고, 삭제 RPC/UI는 만들지 않는다.

---

## RPC

| 함수 | 호출자 | 역할 |
|------|--------|------|
| `nrm_rpc_system_schedule_list` | admin (anon GRANT + `nrm_is_admin_caller`) | 목록. music 상세·`retention_days` 포함 |
| `nrm_rpc_system_schedule_set_enabled` | admin | on/off. music면 linked 행도 동기화 |
| `nrm_rpc_system_schedule_update` | admin | 기존 `schedule_id`의 주기·on/off(chat는 retention_days)만. create 거부 |
| `nrm_rpc_system_schedule_run_now` | admin | 활성 스케줄 즉시 실행 예약 |
| `nrm_rpc_ailab_chat_retention_run` | cron / service_role | 배치 하드 삭제 |
| `nrm_rpc_track_history_retention_run` | cron / service_role | TrackHistory 배치 하드 삭제 |
| `nrm_rpc_system_schedule_tick` | pg_cron `nrm-system-schedule-tick` (* * * * *) | due된 retention job 실행 후 `next_run_at` 갱신 |

MusicBrainz 수집 실행 자체는 기존 `musicbrainz-sync` dispatcher Cron이 `music_collection_schedule`을 claim한다. 시스템 원장 토글이 music `is_enabled`를 맞춘다.

`music_rpc_admin_schedule_upsert`는 **update-only** (`p_schedule_id` 필수, `schedule_key` 불변). 앱에서 신규 수집 스케줄을 만들 수 없다.

450MB 용량 한계에서는 MusicBrainz 수집 스케줄만 자동 off한다. 채팅·Track History retention은 용량을 줄이는 작업이므로 끄지 않는다.

---

## AI Lab 채팅 삭제

1. 활성 `ailab-chat-retention`의 `retention_days` 읽기
2. 동일 cutoff(`now() - retention_days`)로 배치 물리 삭제:
   - `LLMCallAttemptLog` (`RegDate`)
   - `LLMTokenHistory` (`RegDate`)
   - `ChatSession` (`UpdateDate`) 대상의 `ChatMessage` → `ChatSession`
3. 사용자 소프트 삭제(`nrm_rpc_chat_delete_session`의 `IsDeleted`)와 별개. 보존 기간이 지나면 소프트 삭제된 세션도 포함해 제거

상세: [`chat.md`](./chat.md), [`llm.md`](./llm.md)

---

## Track History 삭제

1. 활성 `track-history-retention`의 `retention_days` 읽기 (기본 180)
2. `TrackHistory.DownloadDate < now() - retention_days` 행을 배치(기본 2000) 물리 DELETE
3. `album-covers` Storage 객체는 곡 단위로 공유되므로 retention에서 삭제하지 않음

상세: [`track-history.md`](./track-history.md)
