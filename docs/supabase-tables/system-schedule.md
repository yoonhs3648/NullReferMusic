# 시스템 스케줄 (`nrm_system_schedule`)

공통 시스템 스케줄 권위 원장. MusicBrainz 수집·AI Lab 채팅 삭제 등 앱 관리 UI에 노출되는 스케줄은 모두 이 테이블에 등록한다.

## 정책

- **신규 등록**: 마이그레이션 seed만. 앱/관리자 RPC로 INSERT·생성 불가.
- **삭제**: 금지. `BEFORE DELETE` 트리거가 `nrm_system_schedule`·`music_collection_schedule` 모두 거부.
- **관리 UI**: on/off + 실행 주기만. 주기는 **매일 / 매주 / 매월 / 단 1회 / 매분(N분)** 이며 날짜·시각(KST) 또는 분 간격을 지정한다.
  job(호출 기능)은 스케줄마다 seed로 고정이고 UI에서 바꾸지 않는다.
  MusicBrainz 필터·상한·표시 이름·아티스트 대상 UI는 없음.
  AI Lab 채팅·Track History 삭제는 `retention_days` 추가 편집.
- MusicBrainz 상세 필터·상한은 linked `music_collection_schedule`에 seed로 두고, 시스템 원장이 목록·토글·타이밍의 단일 진입점이다.

마이그레이션:
- `supabase/migrations/20260904150000_nrm_system_schedule.sql`
- `supabase/migrations/20260904151000_system_schedule_timing_only.sql`
- `supabase/migrations/20260904160000_lastfm_artist_pool_schedules.sql` (Last.fm Top 4스케줄·배타 pool)
- `supabase/migrations/20260904161000_track_history_retention.sql` (Track History 180일 삭제)
- `supabase/migrations/20260908100000_system_schedule_log_and_dispatch.sql` (실행 원장·진단 로그·worker 즉시 호출)
- `supabase/migrations/20260908113000_historical_catalog_schedules.sql` (이미 발매된 곡 catalog 4스케줄)
- `supabase/migrations/20260909130000_catalog_serial_phases.sql` (Last.fm 완료 후 MB 한 곡씩, 전역 직렬 보강)
- `supabase/migrations/20260909140000_korea_catalog_korean_only.sql` (korea-catalog/korea-top은 한국 작품만. geo 인기 ≠ 한국노래)
- `supabase/migrations/20260908114000_schedule_owner_grants_and_claim_fix.sql` (`nrm_music_rpc_owner`가 시스템 원장 `next_run_at`을 동기화하도록 GRANT·RLS. claim/즉시 실행 42501 수정)
- `supabase/migrations/20260908145000_weekly_lastfm_tag_refresh.sql` ~ `20260908145500_*` (weekly 주기, Last.fm 전곡 태그 갱신 시드)
- `supabase/migrations/20260908150000_monthly_ops_cleanup.sql` ~ `20260908150200_*` (monthly 주기, 운영 데이터 정리)
- `supabase/migrations/20260910140000_schedule_flexible_timing.sql` (매일/매주/매월/1회, 매월 일자, 단 1회 날짜)
- `supabase/migrations/20260910160000_schedule_interval_minutes.sql` (매분 N분 `interval`)
- `supabase/migrations/20260910161000_mb_transient_retry.sql` (MusicBrainz 503 재시도 큐·스케줄)
- `supabase/migrations/20260910170000_admin_run_success_failure_ui.sql` (실행 상세 성공/실패·503 재시도 실패 분류)
- `supabase/migrations/20260910180000_catalog_lastfm_filter_year_quota.sql` (Last.fm 리스트 한국/글로벌·힙합 필터, 연도 쿼터)
- `supabase/migrations/20260910181000_admin_failure_job_status.sql` (실패 목록에 dead/quarantined 상태)
- `supabase/migrations/20260911100000_disable_all_schedulers_and_wipe_collected_data.sql` (모든 스케줄 off + 수집 원장·파이프라인 전량 삭제. 정의는 유지)

---

## `nrm_system_schedule`

| 컬럼 | 타입 | 기본값 | NULL | 설명 |
|------|------|--------|------|------|
| `schedule_id` | `uuid` | `gen_random_uuid()` | NO | PK |
| `schedule_key` | `text` | — | NO | 고유 키 (예: `musicbrainz-k-pop-daily`, `ailab-chat-retention`) |
| `display_name` | `text` | — | NO | 관리 UI 표시 이름 |
| `job_kind` | `text` | — | NO | `musicbrainz_collection` \| `ailab_chat_retention` \| `track_history_retention` \| `ops_cleanup` |
| `is_enabled` | `boolean` | `false` | NO | 활성 여부 |
| `schedule_kind` | `text` | — | NO | `daily` \| `weekly` \| `monthly` \| `once` \| `interval` |
| `daily_time_kst` | `time` | — | YES | daily/weekly/monthly/once의 KST 시각. interval은 NULL |
| `interval_minutes` | `integer` | — | YES | interval일 때 1~10080분. 예: 60이면 1시간마다 |
| `weekly_weekday` | `smallint` | — | YES | weekly일 때 0=일요일 … 6=토요일 (KST) |
| `monthly_day` | `smallint` | — | YES | monthly일 때 1~31. 해당 월에 없는 날짜는 말일 |
| `once_on_date` | `date` | — | YES | once일 때 KST 날짜. 실행 후 `is_enabled=false` |
| `next_run_at` | `timestamptz` | `now()` | NO | 다음 실행 시각 (chat tick·수집 claim이 소비) |
| `config` | `jsonb` | `{}` | NO | job별 설정 |
| `created_at` / `updated_at` | `timestamptz` | `now()` | NO | 생성·수정 |

### `config` 계약

| `job_kind` | 필수 키 | 의미 |
|------------|---------|------|
| `musicbrainz_collection` | `music_schedule_id` (uuid) | linked `music_collection_schedule.schedule_id` |
| `ailab_chat_retention` | `retention_days` (1~3650) | `ChatSession.UpdateDate`·`LLMCallAttemptLog.RegDate`·`LLMTokenHistory.RegDate`가 이 일수보다 오래된 행을 물리 삭제 |
| `track_history_retention` | `retention_days` (1~3650) | `TrackHistory.DownloadDate`가 이 일수보다 오래된 이력을 물리 삭제 |
| `ops_cleanup` | (없음, 고정 정책) | 로그·Storage 1개월, 스케줄 실행 이력 3개월. 앱에서 기간 편집 없음 |

### 시드 (운영)

| schedule_key | job_kind | 기본 |
|--------------|----------|------|
| `musicbrainz-lastfm-korea-top` | musicbrainz_collection | Last.fm `geo.getTopArtists(Korea, Republic of)` → **한국 아티스트만** 발매예정 스테이징 |
| `musicbrainz-lastfm-global-top` | musicbrainz_collection | Last.fm `chart.getTopArtists` Top 100 → 발매예정. **한국 아티스트 skip** |
| `musicbrainz-lastfm-hiphop-top` | musicbrainz_collection | Last.fm `tag.getTopArtists(hip-hop)` Top 100 → 발매예정. **한국 아티스트 skip** |
| `musicbrainz-lastfm-korean-hiphop-top` | musicbrainz_collection | Last.fm `tag.getTopArtists(korean hip hop)` → **한국 아티스트만** 발매예정 스테이징 |
| `musicbrainz-lastfm-korea-catalog` | musicbrainz_collection | Last.fm `tag.getTopTracks(k-pop)` → **한국 작품만** 원장 catalog (KST 00:00). Last.fm 리스트 단계에서 한글·k-pop 태그로 거르고 MusicBrainz 전에 외국곡을 넣지 않는다 |
| `musicbrainz-lastfm-global-catalog` | musicbrainz_collection | Last.fm `chart.getTopTracks` → catalog. **한국 작품은 skip** |
| `musicbrainz-lastfm-korean-hiphop-catalog` | musicbrainz_collection | Last.fm `tag.getTopTracks(korean hip hop)` → **한국 작품만** catalog (KST 02:00) |
| `musicbrainz-lastfm-hiphop-catalog` | musicbrainz_collection | Last.fm `tag.getTopTracks(hip-hop)` → catalog. **한국 작품은 skip** |
| `musicbrainz-lastfm-tag-refresh` | musicbrainz_collection | 원장 전곡 Last.fm `track.getTopTags` **upsert**. 매주 일요일 12:00 KST |
| `musicbrainz-mb-503-retry` | musicbrainz_collection | MusicBrainz 일시 HTTP 실패(503 등) 재시도. 기본 매 60분 |
| `ops-monthly-cleanup` | ops_cleanup | 로그·Storage **1개월**, 스케줄 실행 이력 **3개월** 물리 삭제. 매월 1일 00:00 KST |

발매예정 일일 검증(`mb_upcoming_verify`)은 별도 `nrm_system_schedule` 행이 아니라
`musicbrainz-sync` worker tick에서 `music_rpc_enqueue_upcoming_verify_batch`로 큐잉한다.
확정 발매만 원장 promote. 상세는 [`musicbrainz-lastfm-vector.md` §5.10](./musicbrainz-lastfm-vector.md).

이미 발매된 곡 catalog 4스케줄은 발매예정과 별도다. Last.fm Top Tracks를 페이지로 받아
**한국/글로벌·힙합 필터를 Last.fm 리스트 단계에서 적용한 뒤** 원장 Recording에 넣는다.
스케줄 간 Recording은 배타다. 곡 수는 연도 쿼터(2000 미만 100, 2000–2010년 100/년,
2011–2020년 300/년, 2021–현재 500/년)와 450MB 잔여 중 작은 값이다.
상세는 [`musicbrainz-lastfm-vector.md` §5.13](./musicbrainz-lastfm-vector.md).

| `ailab-chat-retention` | ailab_chat_retention | 매일 KST 03:00, `retention_days=30` |
| `track-history-retention` | track_history_retention | 매일 KST 08:00, `retention_days=180` |

`20260911100000_disable_all_schedulers_and_wipe_collected_data.sql` 이후 운영 기본은
**전부 `is_enabled=false`**. 수집 원장·파이프라인·Last.fm 태그·503 재시도 큐도 비운다.
스케줄 정의는 남기고, 관리 UI에서 다시 on 할 때까지 Cron은 no-op이다.

구키 `musicbrainz-k-pop-daily` / `musicbrainz-korean-hip-hop-daily` / `musicbrainz-global-chart-daily`는
`20260904160000_lastfm_artist_pool_schedules.sql`에서 위 Last.fm 키로 이전한다.

향후 스케줄도 **같은 원장에 마이그레이션으로만** 추가하고, 삭제 RPC/UI는 만들지 않는다.
실행 주기는 기존·신규 모두 `daily`/`weekly`/`monthly`/`once`/`interval`만 쓴다. job_kind와 무관하게
`nrm_rpc_system_schedule_update`가 같은 timing 컬럼을 받는다. interval은 `interval_minutes`(1~10080)만
요구하고 `daily_time_kst`는 NULL이다.

---

## `nrm_system_schedule_run`

모든 `job_kind`의 내부 실행 이력. retention 행은 `music_rpc_admin_overview`가 실행/실패 탭에 같이 보여 준다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `system_run_id` | `uuid` | PK |
| `schedule_id` | `uuid` | `nrm_system_schedule` FK |
| `job_kind` | `text` | 스케줄과 동일 |
| `run_status` | `text` | `running` \| `completed` \| `partial` \| `failed` \| `cancelled` |
| `music_schedule_run_id` | `uuid` | 수집 job이면 `music_schedule_run` FK. retention은 NULL |
| `started_at` / `finished_at` | timestamptz | 시작·종료 |
| `error_message` | `text` | 실패 메시지 |
| `result` | `jsonb` | retention 결과 또는 수집 집계 스냅샷 |

MusicBrainz 수집은 `music_schedule_run` INSERT/UPDATE 트리거가 이 테이블로 미러한다.
retention tick은 직접 INSERT한다.

## `nrm_system_schedule_log`

Edge·Cron·RPC 진단 로그. 관리 UI 비노출. 에이전트는 Postgres `RAISE LOG`(접두 `nrm-schedule`)와
Edge `console.log`(fn=`musicbrainz-sync`)를 본다. 토큰·API key는 넣지 않는다. **1개월** 또는 최근 4000행만 유지.

| 컬럼 | 설명 |
|------|------|
| `source` | `rpc` \| `cron` \| `edge` \| `pg_net` \| `trigger` |
| `event` | 예: `run_now_started`, `dispatcher_skipped`, `worker_job_failed` |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `detail` | 이벤트별 JSON (busy 이유, vault 유무, SQLSTATE 등) |

---

## RPC

| 함수 | 호출자 | 역할 |
|------|--------|------|
| `nrm_rpc_system_schedule_list` | admin (anon GRANT + `nrm_is_admin_caller`) | 목록. music 상세·`retention_days` 포함 |
| `nrm_rpc_system_schedule_set_enabled` | admin | on/off. music면 linked 행도 동기화 |
| `nrm_rpc_system_schedule_update` | admin | 기존 `schedule_id`의 주기·on/off(chat는 retention_days)만. create 거부. 주기는 `daily`/`weekly`/`monthly`/`once`/`interval` + 해당 부가 컬럼 |
| `nrm_rpc_system_schedule_run_now` | admin | 활성 스케줄 즉시 실행. 실패 시 SQL 원인을 로그에 남기고 예외로 반환 |
| `nrm_rpc_ailab_chat_retention_run` | cron / service_role | 배치 하드 삭제 |
| `nrm_rpc_track_history_retention_run` | cron / service_role | TrackHistory 배치 하드 삭제 |
| `nrm_rpc_ops_cleanup_run` | cron / service_role | 로그·Storage·스케줄 이력 정리 |
| `nrm_rpc_system_schedule_tick` | pg_cron `nrm-system-schedule-tick` (* * * * *) | due된 retention·ops_cleanup job 실행 후 `next_run_at` 갱신·실행 이력 기록 |
| `nrm_rpc_musicbrainz_dispatcher_cron` | pg_cron / run_now | stale 회복 후 `musicbrainz-sync` Edge를 pg_net 호출. Vault 없으면 로그 |
| `nrm_rpc_system_schedule_log_append` | service_role (Edge) | Edge 로그 적재. Postgres `RAISE LOG`도 동시에 남김 |
| `nrm_rpc_system_schedule_log_page` | service_role | 진단 조회(관리 UI 비노출) |

MusicBrainz 수집 실행 자체는 기존 `musicbrainz-sync` dispatcher Cron이 `music_collection_schedule`을 claim한다. 시스템 원장 토글이 music `is_enabled`를 맞춘다.

관리 UI **즉시 실행**은 idle이면 `music_schedule_run`+첫 job을 바로 만들고, busy면 due만 남긴 뒤 **worker를 즉시 kick**한다.
`nrm_system_schedule.next_run_at`과 `music_collection_schedule.next_run_at`은 claim/run_now 때 동기화한다.
수집 RPC(`music_rpc_claim_due_schedules`, `music_rpc_admin_schedule_run_now`, `nrm_rpc_system_schedule_run_now`)는 `nrm_music_rpc_owner` SECURITY DEFINER라서 `nrm_system_schedule`에 SELECT/UPDATE GRANT와 RLS 정책이 필요하다. 없으면 42501로 즉시 실행·정기 claim이 모두 실패하고 due 큐만 남는다.

관리 UI 스케줄·실행·실패 탭은 페이징 없이 스크롤한다. 실행/실패는 아래로 내릴수록 이력을 더 보여 준다.
실행 탭의 스케줄러 큐(진행중·작업 큐)와 실행/실패 카드 제목은 스케줄 표시 이름만 보여 준다.
실행/실패 탭은 수집 `music_schedule_run`과 retention `nrm_system_schedule_run`을 같이 보여 준다.
카드 상세는 관리자가 확인할 항목만 보여 준다.
- 수집: 대기·재시도·처리중·실패 job 건수, 실행 오류, 성공·실패 곡(접힘·무한스크롤. 성공은 가수—제목, 실패는 가수—제목 아래 빨간 `(dead)`/`(quarantined)` 사유).
  `dead`와 `quarantined`는 집계에서 하나의 실패로 합친다. 503 재시도 큐는 dead, 이름 매칭 실패·HTTP 400은 quarantined.
  MusicBrainz 503 재시도 run은 실패 job이 1건이라도 있으면 실행 탭 완료가 아니라 실패 탭(`failed`)으로 보낸다.
  완료 job·수집 기간·용량은 숨긴다. 완료되고 이상이 없으면 "확인할 이상이 없습니다."
- 태그 갱신: 같은 job 이상 집계 + 태그를 갱신한 곡 목록.
- retention(AI Lab 채팅·Track History): 삭제 건수와 오류. 완료 건은 시작·종료 시각을 숨긴다.
- 운영 데이터 정리: 로그/Storage/스케줄 이력 삭제 건수, 한도(일부 남음), 단계 오류. 완료 건은 시작·종료 시각을 숨긴다.
진단 로그는 관리 UI에 노출하지 않는다. Edge `console.log`(fn=`musicbrainz-sync`)와 Postgres `RAISE LOG`(`nrm-schedule ...`)로만 남긴다.

수집 job이 Last.fm·MusicBrainz HTTP 5xx/`429`/타임아웃을 만나면 **지금 곡(또는 페이지)** 을
worker tick 안에서 3초 간격으로 3번 재시도하고, 그래도 실패하면 `dead` 후 다음 인덱스로 간다.
큐에 retry를 쌓아 다른 곡과 섞지 않는다. MusicBrainz 일시 실패는 `music_mb_transient_retry`에
올려 두고 `musicbrainz-mb-503-retry`가 매 N분(기본 60)마다 다시 요청한다. 성공·계약 오류면
그 임시 행을 삭제한다. Last.fm 5xx는 이 큐에 넣지 않는다.

MusicBrainz 수집은 **전역 직렬 큐**: 이전 collection run/job이 끝나기 전에는 다음 스케줄을 claim하지 않는다.
같은 스케줄이 하루를 넘겨 다시 due여도 실행 중 run이 끝날 때까지 대기만 한다.
`mb_upcoming_verify`는 busy로 취급하지 않고, 수집이 돌 때는 enqueue·claim하지 않는다.
`즉시 실행`은 busy여도 worker를 깨워 **이미 실행 중인** 대기열을 소진한다.

`music_rpc_admin_schedule_upsert`는 **update-only** (`p_schedule_id` 필수, `schedule_key` 불변). 앱에서 신규 수집 스케줄을 만들 수 없다.

450MB 용량 한계에서는 MusicBrainz 수집 스케줄만 자동 off한다. 채팅·Track History retention과 운영 데이터 정리는 용량을 줄이는 작업이므로 끄지 않는다.

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

---

## 운영 데이터 정리

시스템 스케줄 `ops-monthly-cleanup` (`job_kind=ops_cleanup`). 매월 1일 00:00 KST.
RPC `nrm_rpc_ops_cleanup_run`. Cron은 기존 `nrm-system-schedule-tick`.

1. **로그 1개월** (`now() - interval '1 month'`):
   - `nrm_system_schedule_log` (rpc/cron/edge/pg_net/trigger)
   - `cron.job_run_details` (있으면)
   - `net._http_response` (있으면)
   - 플랫폼 Dashboard/Logflare Edge 로그는 DB에 없어서 이 작업 범위 밖이다.
2. **Storage 1개월**: `storage.objects.created_at`이 cutoff보다 이전인 객체를 삭제한다.
   `album-covers` 중 아직 `TrackHistory.AlbumCoverPath`가 가리키는 파일은 유지한다
   (공유 파일명이라 최근 이력 커버가 깨지지 않게).
3. **스케줄 관련 DB 3개월**: 끝난 `music_schedule_run`과 그 run의 job/fetch/candidate/scan,
   `nrm_system_schedule_run`, 완료·dead job, 해결된 dead letter, 용량 event/snapshot
   (최신 snapshot 1건은 유지). **스케줄 정의·음악 원장·tombstone은 삭제하지 않는다.**
4. 한 실행에서 배치 한도에 걸리면 `truncated=true`로 `partial` 기록하고 다음 달에 이어서 지운다.

분 단위 dispatcher의 로그 상한은 최근 4000행이며, 시간 cutoff는 1개월이다.
