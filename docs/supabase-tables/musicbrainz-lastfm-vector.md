# 1. 목적

이 설계는 Supabase 무료 프로젝트 2개를 분리하여 MusicBrainz 음악 메타데이터와 Last.fm 태그 벡터를 수집·검색하는 전체 시스템의 단일 출처(SSOT)를 정의한다.

## 구현 상태 (2026-09-04)

- 프로젝트 1의 관계형 음악 원장과 수집 상태 테이블(§5.1~§5.6, §5.8)은
  `supabase/migrations/20260904130000_musicbrainz_lastfm_project1_schema.sql`로 원격 적용됐다.
- 현재 적용 범위에는 MusicBrainz 권위 엔터티·MBID·병합 감사·credit·genre·tag·ISRC,
  Last.fm profile/fetch/current tag와 공통 sync job/run/dead letter가 포함된다.
- 프로젝트 1의 수집 스케줄·Artist allowlist·discovery cursor/candidate·용량 정책·보존·통제 purge와
  worker/admin RPC 계약은 `supabase/migrations/20260904132000_music_collection_schema_contract.sql`로 원격 적용됐다.
- MusicBrainz durable worker의 단계 claim, Release Group·대표 Release·Track·Recording 적용 RPC는
  `supabase/migrations/20260904140000_musicbrainz_durable_worker.sql`, HTTP gateway와 strict parser는
  `supabase/functions/musicbrainz-sync/`에 정의한다. 매분 dispatcher와 6시간 retention 호출은
  `supabase/migrations/20260904141000_musicbrainz_cron.sql`이 Vault secret을 참조해 구성하며 모두 원격 배포됐다.
- 관리자 allowlist 전체 검색·페이지 조회와 dead-letter 조회·해결·원본 작업 재큐잉은
  `supabase/migrations/20260904143000_music_admin_allowlist_dead_letter.sql`로 원격 적용됐다.
- PostgreSQL 17의 worker claim 출력 컬럼 이름 충돌 수정은
  `supabase/migrations/20260904144000_musicbrainz_claim_ambiguity_fix.sql`로 원격 적용됐다.
- Last.fm 유명 아티스트 Pool(국가·차트·태그 Top 100) → MusicBrainz 매칭 → 발매예정
  Release 수집 4스케줄과 스케줄 간 아티스트/릴리스 중복 배제·스케줄당 신규 Recording 1000 상한은
  `supabase/migrations/20260904160000_lastfm_artist_pool_schedules.sql`과
  `supabase/functions/musicbrainz-sync/` worker의 `lastfm_artist_pool` job으로 구현한다.
- §5.7 임베딩 원장·outbox, 프로젝트 2 벡터 적용 worker, Last.fm `track.getTopTags` Edge Function은
  아직 구현하지 않았다.

구현 목표:

1. 기존 `NullReferenceMusic` 프로젝트에서 MusicBrainz Artist, Release Group, 대표 Release, Track과 Recording을 수집한다.
2. MusicBrainz Recording MBID로 Last.fm `track.getTopTags`를 호출한다.
3. MusicBrainz 장르·태그와 Last.fm 태그를 출처별로 저장한다.
4. Last.fm 태그를 정규화하고 음악과 관계없는 personal/noise 태그를 제거한다.
5. 선별된 Last.fm 태그만 결정적인 입력 문서로 가공한다.
6. 임베딩은 별도의 `NullReferenceMusic-Vector` 프로젝트에 저장한다.
7. 벡터 검색 결과의 내부 `recording_id`로 프로젝트 1의 최신 음악 메타데이터를 조회한다.
8. 결과를 유사곡 검색, 음악 추천과 AI RAG에 사용한다.
9. MusicBrainz MBID 병합·redirect, Last.fm 누락·오래된 alias와 프로젝트 간 중복·역순 이벤트를 안전하게 보정한다.

이 문서는 다음 구현의 필수 기준이다.

- 두 Supabase 프로젝트의 테이블·제약조건·인덱스·trigger
- MusicBrainz·Last.fm 수집 Scheduler와 Edge Function
- MBID resolution·내부 엔터티 merge RPC
- 태그 정규화·필터·hash·임베딩 생성
- outbox/inbox·tombstone·재시도·reconciliation
- 벡터 검색과 프로젝트 1 metadata hydrate
- RLS, Secret, 용량 제한과 운영 점검

---

# 2. 중요 설계 원칙

## 2.1 데이터 분리

- 프로젝트 1에는 기존 앱 데이터와 관계형 음악 원장을 저장한다.
- 프로젝트 2에는 임베딩 profile, inbox, Recording 벡터, hash, source sequence와 tombstone만 저장한다.
- 프로젝트 간 FK·SQL JOIN·원자적 트랜잭션은 사용할 수 없다.
- 프로젝트 1이 권위 원장이고 프로젝트 2는 언제든 재생성 가능한 projection이다.

## 2.2 내부 식별자와 MBID

- MusicBrainz MBID는 외부 식별자이며 내부 PK로 사용하지 않는다.
- Artist, Album, Release, Recording과 Track은 각각 별도의 내부 UUID PK를 사용한다.
- 같은 실제 음악에 여러 MBID가 존재하거나 과거 MBID가 새 MBID로 redirect될 수 있다.
- 모든 canonical·historical·redirected MBID를 alias 이력으로 보존한다.
- 프로젝트 간 공통 Recording 키는 MBID가 아니라 내부 `recording_id`다.
- 벡터 검색 결과에는 진단용 MBID와 함께 내부 `recording_id`를 사용한다.

## 2.3 음악 엔터티

- 앱의 앨범 단위는 MusicBrainz Release Group이다.
- 모든 국가별 Release를 저장하지 않고 결정적 규칙으로 대표 Release를 선정한다.
- MusicBrainz Recording을 노래의 녹음·믹스·편집 버전 단위로 사용한다.
- 대표 Release의 Track은 Recording과 분리하여 디스크·트랙 위치를 보존한다.
- medium 정보는 Track에 반정규화한다.
- 제목·아티스트·길이 유사성만으로 Recording을 자동 병합하지 않는다.

## 2.4 장르·태그

- MusicBrainz 장르·태그와 Last.fm 태그는 출처·점수 체계가 다르므로 합산하지 않는다.
- MusicBrainz 장르·태그는 관계형 metadata로 저장하지만 임베딩에는 포함하지 않는다.
- Last.fm `track.getTopTags` 전체 응답을 파싱하되 정규화·중복 제거·noise 필터 후 최대 20개만 저장한다.
- 서로 다른 MBID 후보에서 받은 Last.fm 응답을 섞거나 count를 합치지 않는다.
- 유효한 단일 후보 응답만 현재 활성 태그 snapshot으로 선택한다.

## 2.5 벡터

- Recording마다 태그별 벡터를 만들지 않고 Last.fm 태그 집합에서 profile별 벡터 하나를 생성한다.
- 임베딩에는 Last.fm에서 선별된 태그만 포함한다. 제목·아티스트·앨범·발매일·MusicBrainz 장르·태그는 제외한다.
- 기본 차원은 384, 거리 함수는 cosine이다.
- 모델·revision·prefix·정규화·필터·입력 형식을 immutable profile로 고정한다.
- 실제 입력 문자열, 태그 수, profile fingerprint, source/input/vector/payload hash를 보관한다.
- input hash가 같으면 임베딩 API를 다시 호출하지 않는다.
- profile이 바뀌면 기존 profile을 덮어쓰지 않고 side-by-side로 재임베딩한다.

## 2.6 동기화와 오류 복구

- 프로젝트 간 전달은 outbox + inbox 기반 `at-least-once` 방식이다.
- `event_id`, recording 단위 직렬화, `source_version`, 전역 `source_seq`로 중복·역순 적용을 차단한다.
- 프로젝트 2의 delete는 hard delete가 아닌 영구 tombstone이다.
- 네트워크 timeout은 원격 실패로 단정하지 않고 event 상태를 확인한다.
- claim 작업은 `FOR UPDATE SKIP LOCKED`, lease와 fence token을 사용한다.
- 외부 API transient 오류는 기존 정상 metadata·태그·벡터를 즉시 삭제하지 않는다.

## 2.7 보안·용량

- Last.fm API Key, 임베딩 API Key와 프로젝트 2 Secret Key는 프로젝트 1 Edge Function Secrets에만 저장한다.
- Secret을 APK, 앱 config, public table, outbox payload나 로그에 저장하지 않는다.
- 모든 음악 테이블은 RLS를 활성화하고 앱에는 필요한 read-only View/RPC만 공개한다.
- MusicBrainz 요청은 의미 있는 User-Agent를 사용하고 전체 worker 기준 최소 1.1초 간격을 적용한다.
- 프로젝트 1 DB가 **450MB**를 넘으면 MusicBrainz/Last.fm/벡터 **수집 스케줄러를 전부 off**한다.
  경고(350MB)·쓰기 중지(400MB)로 앱 일반 CRUD나 개별 INSERT를 막지 않는다.
  AI Lab 채팅·Track History retention은 용량을 줄이는 작업이므로 450MB에서 자동 off하지 않는다.
- 프로젝트 2도 표시용 hard limit 500MB·수집 중지선 450MB를 사용하며 table 크기를 별도로 측정한다.

---

# 3. 프로젝트 구성과 전체 흐름

## 3.1 프로젝트 1: `NullReferenceMusic`

기존 앱 운영 DB와 음악 관계형 원장을 저장한다.

- 기존 사용자·인증·관리자·LLM·채팅·TrackHistory
- MusicBrainz Artist, Release Group, 대표 Release, Track, Recording
- MusicBrainz MBID alias·redirect·merge 이력
- MusicBrainz 장르·태그
- Last.fm 조회 후보·시도·활성 태그
- 임베딩 profile·결정적 입력 문서·상태
- 동기화 job·run·dead letter
- 프로젝트 2 전송 outbox

## 3.2 프로젝트 2: `NullReferenceMusic-Vector`

벡터 검색에 필요한 최소 projection과 동기화 안전장치만 저장한다.

- immutable 임베딩 profile snapshot
- 프로젝트 1 이벤트 inbox
- 내부 `recording_id`
- Last.fm 태그 집합 `vector(384)`
- source/input/vector/payload hash
- source version·source sequence
- stale 상태와 영구 tombstone
- HNSW cosine 인덱스
- event apply/status, manifest, vector search RPC

프로젝트 2에는 사용자·앨범·아티스트·장르 같은 관계형 metadata를 복제하지 않는다. 검색 후 프로젝트 1에서 hydrate한다.

## 3.3 전체 데이터 흐름

```text
MusicBrainz API
    │
    ├─ Artist
    ├─ Release Group
    ├─ 대표 Release / Track
    ├─ Recording / ISRC
    ├─ Genre
    └─ Tag
    │
    ▼
[프로젝트 1: NullReferenceMusic]
    │
    ├─ 내부 UUID 엔터티 생성
    ├─ canonical·historical·redirected MBID 저장
    ├─ MBID fixed-point resolution과 내부 merge
    └─ Recording MBID 후보 구성
             │
             ▼
Last.fm track.getTopTags
    │
    ├─ canonical MBID
    ├─ 이전 성공 MBID
    ├─ alias MBID
    ├─ 정확한 artist/track 이름
    └─ autocorrect 이름
             │
             ▼
[프로젝트 1: NullReferenceMusic]
    │
    ├─ 단일 유효 응답 선택
    ├─ NFKC·case fold·alias 통합
    ├─ 중복·personal·noise 제거
    ├─ 최대 20개 태그 저장
    ├─ 결정적 입력 문자열·hash 생성
    └─ vector outbox event 생성
             │
             ▼
music-vector-relay Edge Function
    │
    ├─ immutable 입력으로 임베딩 생성
    ├─ 384차원·유한값·norm 검증
    ├─ 생성 벡터와 hash를 outbox에 고정
    └─ event_id + source_seq + vector 전송
             │
             ▼
[프로젝트 2: NullReferenceMusic-Vector]
    │
    ├─ inbox 멱등 확인
    ├─ source_seq 조건부 적용
    ├─ vector(384) upsert
    ├─ stale·delete tombstone 적용
    └─ HNSW cosine 검색
             │
             ▼
유사 recording_id 목록
             │
             ▼
[프로젝트 1: NullReferenceMusic]
    │
    ├─ 최종 Recording root 보정
    ├─ 삭제·병합·격리 데이터 제외
    ├─ 제목·아티스트·앨범·장르 hydrate
    └─ 앱 권한·필터 적용
             │
             ▼
유사곡 검색 · 음악 추천 · AI RAG
```

## 3.4 책임 경계

| 작업 | 프로젝트 1 | 프로젝트 2 |
|---|---:|---:|
| MusicBrainz·Last.fm 외부 API 호출 | O | X |
| 관계형 음악 metadata와 MBID 원장 | O | X |
| Last.fm 태그 정규화·선택 | O | X |
| 임베딩 입력과 outbox | O | X |
| 임베딩 vector 저장·HNSW 검색 | X | O |
| event inbox·tombstone | X | O |
| 최종 metadata hydrate·권한 필터 | O | X |

## 3.5 벡터 입력 범위

```text
포함:
- Last.fm 유효 태그 최대 20개

제외:
- 노래 제목
- 아티스트명
- 앨범명
- 발매일
- MusicBrainz 장르
- MusicBrainz 태그
- Last.fm URL
- 조회 오류·매칭 진단 정보
```

---

# 4. 공통 계약과 불변식

이 문서는 MusicBrainz·Last.fm 수집, MBID 병합 보정, Last.fm 태그 임베딩과 두 Supabase 프로젝트 간 벡터 동기화의 **단일 출처(SSOT)** 다. 마이그레이션, Edge Function, 스케줄러, RPC와 앱 코드는 이 문서를 따라야 한다.

## 4.1 프로젝트 역할

| 프로젝트 | 역할 | 권위 데이터 |
|---|---|---|
| `NullReferenceMusic` | 기존 앱 DB + 음악 관계형 원장 | 내부 엔터티, 모든 MBID, MusicBrainz 메타데이터, Last.fm 태그, 임베딩 입력, 작업·outbox |
| `NullReferenceMusic-Vector` | 벡터 서빙 저장소 | 프로젝트 1 이벤트를 적용한 벡터 projection, inbox, tombstone, 검색 RPC |

- 프로젝트 간 FK, JOIN, 원자적 트랜잭션은 불가능하다.
- 프로젝트 1이 항상 권위 원장이고 프로젝트 2는 재생성 가능한 projection이다.
- 전달 보장은 `at-least-once`다. 중복·역순 이벤트는 `event_id`, 단조 증가 `source_seq`, 조건부 적용으로 차단한다.

## 4.2 식별자 원칙

- MBID 값은 유일하지만 동일한 실제 엔터티가 중복 등록되어 여러 MBID를 가질 수 있다.
- 외부 MBID를 내부 PK 또는 프로젝트 간 영구 키로 사용하지 않는다.
- 내부 PK는 `gen_random_uuid()`로 생성한다: `artist_id`, `album_id`, `release_id`, `recording_id`, `track_id`.
- 두 프로젝트의 공통 키는 내부 `recording_id`다.
- 현재 canonical MBID는 본체의 조회용 캐시이고, MBID 이력의 SSOT는 각 `*_mbid` 테이블이다.
- canonical 캐시는 전용 RPC와 deferred constraint trigger만 변경한다.

## 4.3 MusicBrainz 의미

- `music_album`은 Release Group, `music_release`는 선정된 대표 Release다.
- `music_recording`은 고유 녹음·믹스·편집 버전이다. 제목·아티스트가 같다는 이유로 자동 병합하지 않는다.
- `music_track`은 대표 Release의 medium 안에 있는 트랙이다.
- medium은 별도 테이블로 만들지 않고 위치·제목·포맷을 `music_track`에 반정규화한다.

## 4.4 공통 규칙

- PostgreSQL `snake_case`, 시각은 `timestamptz` UTC를 사용한다.
- 변경 가능 테이블은 `created_at NOT NULL DEFAULT now()`, `updated_at NOT NULL DEFAULT now()`와 공통 UPDATE trigger를 둔다.
- 내부 workflow 상태는 PostgreSQL enum이 아닌 `text + named CHECK`를 사용한다.
- SHA-256은 `bytea`와 `octet_length(value)=32` CHECK로 저장한다.
- 외부 API 분류값에는 닫힌 CHECK를 두지 않는다.
- 원본 JSON은 DB에 장기 저장하지 않는다. 필요하면 Storage에 gzip으로 저장하고 경로·해시만 DB에 둔다.
- PostgreSQL은 FK 인덱스를 자동 생성하지 않으므로 모든 FK 컬럼에 인덱스를 만든다.
- 권위 엔터티와 MBID·redirect의 일반 hard delete는 금지한다. 유일한 예외는 §5.10의
  전용 NOLOGIN owner가 실행하는 capacity purge RPC이며, 최소 tombstone과 Recording의
  향후 vector delete 대기 행을 먼저 영구 기록한 뒤 앨범 단위로 삭제한다.

## 4.5 FK 삭제 정책

| 관계 | 정책 |
|---|---|
| 권위 엔터티 → MBID·내부 redirect·감사 이력 | `ON DELETE RESTRICT` |
| 엔터티 → credit·tag·genre·isrc | `ON DELETE CASCADE` |
| Release → authority Track | `ON DELETE RESTRICT` |
| 프로젝트 2 벡터 | 물리 삭제 금지, tombstone 유지 |

## 4.6 확장

프로젝트 1:

```sql
create extension if not exists pgcrypto with schema extensions;
create sequence if not exists public.music_vector_source_seq as bigint;
```

프로젝트 2:

```sql
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;
```

---

# 5. 프로젝트 1: `NullReferenceMusic`

## 5.1 권위 엔터티

### `music_artist`

| 컬럼 | 타입 | NULL | 기본값 | 의미 |
|---|---|---:|---|---|
| `artist_id` | `uuid` | N | `gen_random_uuid()` | PK |
| `canonical_mbid` | `uuid` | Y |  | canonical 캐시 |
| `name` | `text` | N |  | 이름 |
| `sort_name` | `text` | Y |  | 정렬명 |
| `disambiguation` | `text` | Y |  | 구분 |
| `artist_type` | `text` | Y |  | Person, Group 등 원문 |
| `gender` | `text` | Y |  | 원문 |
| `country_code` | `text` | Y |  | 국가 코드 |
| `area_name` | `text` | Y |  | 지역 스냅샷 |
| `begin_date_text` | `text` | Y |  | 부분 날짜 |
| `end_date_text` | `text` | Y |  | 부분 날짜 |
| `ended` | `boolean` | Y |  | 종료 여부 |
| `entity_status` | `text` | N | `'active'` | active, merged, deleted, quarantined |
| `merged_into_artist_id` | `uuid` | Y |  | self FK |
| `last_mb_verified_at` | `timestamptz` | Y |  | 최종 확인 |
| `row_version` | `bigint` | N | `0` | 동시성 버전 |
| `created_at` / `updated_at` | `timestamptz` | N | `now()` | 시각 |

제약·인덱스:

- PK `(artist_id)`, FK `merged_into_artist_id → music_artist ON DELETE RESTRICT DEFERRABLE`.
- `btrim(name)<>''`, `row_version>=0`, 상태 목록 CHECK.
- active이면 merge 대상 NULL, merged이면 NOT NULL, self merge 금지.
- 부분 날짜는 `YYYY`, `YYYY-MM`, `YYYY-MM-DD`; 실제 월·일 범위는 RPC에서 검증한다.
- `lower(name)`, `country_code WHERE NOT NULL`, `merged_into_artist_id WHERE NOT NULL` 인덱스.

### `music_album`

| 컬럼 | 타입 | NULL | 기본값 | 의미 |
|---|---|---:|---|---|
| `album_id` | `uuid` | N | `gen_random_uuid()` | Release Group PK |
| `canonical_mbid` | `uuid` | Y |  | canonical 캐시 |
| `title` | `text` | N |  | 앨범명 |
| `disambiguation` | `text` | Y |  | 구분 |
| `primary_type` | `text` | Y |  | Album, Single, EP 등 |
| `secondary_types` | `text[]` | N | `'{}'` | Compilation, Live 등 |
| `artist_credit_name` | `text` | N |  | 표시 아티스트 |
| `primary_artist_id` | `uuid` | Y |  | 대표 Artist FK |
| `first_release_date_text` | `text` | Y |  | 부분 날짜 |
| `entity_status` | `text` | N | `'active'` | 상태 |
| `merged_into_album_id` | `uuid` | Y |  | self FK |
| `last_mb_verified_at` | `timestamptz` | Y |  | 최종 확인 |
| `row_version` | `bigint` | N | `0` | 버전 |
| `created_at` / `updated_at` | `timestamptz` | N | `now()` | 시각 |

- PK `(album_id)`.
- FK `primary_artist_id → music_artist ON DELETE RESTRICT`, self FK DEFERRABLE.
- artist와 같은 상태·self merge CHECK.
- `lower(title)`, `primary_artist_id`, `merged_into_album_id` 인덱스.

### `music_release`

| 컬럼 | 타입 | NULL | 기본값 | 의미 |
|---|---|---:|---|---|
| `release_id` | `uuid` | N | `gen_random_uuid()` | PK |
| `album_id` | `uuid` | N |  | Album FK |
| `canonical_mbid` | `uuid` | Y |  | canonical 캐시 |
| `title` | `text` | N |  | 발매판명 |
| `artist_credit_name` | `text` | N |  | 표시 아티스트 |
| `status` / `quality` / `packaging` | `text` | Y |  | MusicBrainz 원문 |
| `country_code` | `text` | Y |  | 국가 |
| `release_date_text` | `text` | Y |  | 부분 발매일 |
| `barcode` | `text` | Y |  | UPC/EAN |
| `text_language` / `text_script` | `text` | Y |  | 메타데이터 언어·문자 |
| `track_count` | `integer` | N | `0` | 트랙 수 |
| `medium_count` | `smallint` | N | `0` | 매체 수 |
| `is_representative` | `boolean` | N | `true` | 현재 대표판 |
| `selection_score` | `integer` | N | `0` | 선정 점수 |
| `selected_at` | `timestamptz` | N | `now()` | 선정 시각 |
| `retired_at` | `timestamptz` | Y |  | 교체 시각 |
| `entity_status` | `text` | N | `'active'` | active, merged, deleted, quarantined |
| `merged_into_release_id` | `uuid` | Y |  | 병합 대상 self FK |
| `row_version` | `bigint` | N | `0` | 버전 |
| `created_at` / `updated_at` | `timestamptz` | N | `now()` | 시각 |

- PK `(release_id)`, UNIQUE `(release_id, album_id)`.
- FK `album_id → music_album ON DELETE RESTRICT`, self FK `merged_into_release_id ON DELETE RESTRICT DEFERRABLE`.
- `track_count>=0`, `medium_count>=0`.
- 부분 UNIQUE `(album_id) WHERE is_representative`.
- active 앨범당 대표판 정확히 하나는 deferred trigger로 보장한다.
- representative이면 `retired_at IS NULL`, 아니면 `retired_at IS NOT NULL`.
- 상태·self merge·cycle CHECK는 다른 권위 엔터티와 동일하다.
- `album_id`, `canonical_mbid WHERE NOT NULL` 인덱스.
- 대표판 순서: Official → track 정보 존재 → 날짜 존재 → 이른 날짜 → Release MBID 바이트 오름차순.

### `music_recording`

| 컬럼 | 타입 | NULL | 기본값 | 의미 |
|---|---|---:|---|---|
| `recording_id` | `uuid` | N | `gen_random_uuid()` | 프로젝트 공통 곡 PK |
| `canonical_mbid` | `uuid` | Y |  | canonical 캐시 |
| `title` | `text` | N |  | 제목 |
| `disambiguation` | `text` | Y |  | 버전 구분 |
| `artist_credit_name` | `text` | N |  | 표시 아티스트 |
| `primary_artist_id` | `uuid` | Y |  | 대표 Artist |
| `length_ms` | `integer` | Y |  | 길이 |
| `is_video` | `boolean` | N | `false` | 영상 |
| `first_release_date_text` | `text` | Y |  | 부분 날짜 |
| `entity_status` | `text` | N | `'active'` | active, merged, deleted, quarantined |
| `merged_into_recording_id` | `uuid` | Y |  | 병합 대상 |
| `lastfm_sync_enabled` | `boolean` | N | `true` | Last.fm 대상 |
| `embedding_enabled` | `boolean` | N | `true` | 벡터 대상 |
| `last_mb_verified_at` | `timestamptz` | Y |  | 최종 확인 |
| `resolution_version` | `bigint` | N | `0` | MBID 해석 세대 |
| `row_version` | `bigint` | N | `0` | 동시성 버전 |
| `created_at` / `updated_at` | `timestamptz` | N | `now()` | 시각 |

- PK `(recording_id)`.
- FK `primary_artist_id → music_artist ON DELETE RESTRICT`.
- self FK `merged_into_recording_id ON DELETE RESTRICT DEFERRABLE`.
- `length_ms IS NULL OR length_ms>=0`, 버전 음수 금지, 상태·self merge CHECK.
- recursive deferred trigger로 merge cycle을 금지한다.
- `lower(title)`, `primary_artist_id`, `merged_into_recording_id` 인덱스.

### `music_track`

| 컬럼 | 타입 | NULL | 의미 |
|---|---|---:|---|
| `track_id` | `uuid` | N | 내부 PK |
| `release_id` / `album_id` | `uuid` | N | 대표판·앨범 FK |
| `recording_id` | `uuid` | Y | Recording FK |
| `canonical_mbid` | `uuid` | Y | Track MBID 캐시 |
| `source_recording_mbid` | `uuid` | Y | 응답에서 본 Recording MBID |
| `medium_position` | `smallint` | N | 디스크 번호 |
| `medium_title` / `medium_format` | `text` | Y | medium 스냅샷 |
| `track_position` | `integer` | N | 트랙 순서 |
| `track_number` | `text` | N | `1`, `A1` 등 |
| `title` | `text` | N | 발매판 트랙명 |
| `length_ms` | `integer` | Y | 트랙 길이 |
| `artist_credit_name` | `text` | N | 표시 아티스트 |
| `entity_status` | `text` | N | active, merged, deleted, quarantined |
| `merged_into_track_id` | `uuid` | Y | 병합 대상 self FK |
| `created_at` / `updated_at` | `timestamptz` | N | 시각 |

- PK `(track_id)`.
- FK `(release_id, album_id) → music_release(release_id, album_id) ON DELETE RESTRICT`; 독립 release/album FK를 중복 생성하지 않는다.
- FK recording `ON DELETE RESTRICT`, self FK `merged_into_track_id ON DELETE RESTRICT DEFERRABLE`.
- CHECK medium/track position > 0, length 음수 금지.
- 상태·self merge·cycle CHECK는 다른 권위 엔터티와 동일하다.
- UNIQUE `(release_id, medium_position, track_position)`.
- `(album_id, medium_position, track_position)`, `recording_id`, `source_recording_mbid` 인덱스.

## 5.2 MBID 식별자

아래 다섯 테이블은 같은 계약을 사용한다.

| 테이블 | 내부 FK |
|---|---|
| `music_artist_mbid` | `artist_id` |
| `music_album_mbid` | `album_id` |
| `music_release_mbid` | `release_id` |
| `music_recording_mbid` | `recording_id` |
| `music_track_mbid` | `track_id` |

공통 컬럼:

| 컬럼 | 타입 | NULL | 기본값 | 의미 |
|---|---|---:|---|---|
| `mbid` | `uuid` | N |  | PK |
| 내부 ID | `uuid` | N |  | 권위 엔터티 FK |
| `identifier_status` | `text` | N | `'unresolved'` | current, redirected, unresolved, deleted, invalid, quarantined |
| `is_canonical` | `boolean` | N | `false` | 대표 MBID |
| `redirect_target_mbid` | `uuid` | Y |  | 직접 대상 self FK |
| `resolved_mbid` | `uuid` | Y |  | 최종 fixed point |
| `resolution_generation` | `bigint` | N | `0` | 세대 |
| `first_seen_at` | `timestamptz` | N | `now()` | 최초 발견 |
| `last_checked_at` | `timestamptz` | Y |  | 최종 조회 |
| `redirect_detected_at` / `deleted_detected_at` | `timestamptz` | Y |  | 상태 확인 |
| `consecutive_not_found` | `smallint` | N | `0` | 연속 404 |
| `last_http_status` | `integer` | Y |  | 상태 |
| `created_at` / `updated_at` | `timestamptz` | N | `now()` | 시각 |

필수 제약:

- 내부 FK `ON DELETE RESTRICT`.
- self FK `redirect_target_mbid → 같은 테이블.mbid ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.
- 버전·404 횟수 음수 금지, self redirect 금지.
- canonical이면 `identifier_status='current'`.
- `resolved_mbid`도 같은 테이블의 `mbid`를 참조하는 DEFERRABLE self FK다.
- current이면 `resolved_mbid=mbid`, redirect target은 NULL이다.
- redirected이면 canonical=false이고 target·resolved가 모두 존재한다.
- unresolved/deleted/invalid/quarantined이면 canonical=false다.
- merged/deleted/quarantined 본체에는 canonical MBID가 없어야 하고 본체 canonical 캐시는 NULL이다.
- 내부 ID당 canonical 최대 하나: 부분 UNIQUE `(내부 ID) WHERE is_canonical`.
- active 엔터티당 canonical 최소 하나와 canonical 캐시 일치는 commit 시 deferred constraint trigger로 보장한다.
- redirect source·target이 최종적으로 같은 내부 root인지 trigger가 검증한다.
- `(내부 ID, identifier_status)`, `redirect_target_mbid`, `resolved_mbid` 인덱스.

## 5.3 Recording 병합·관찰

### `music_recording_redirect`

`old_recording_id` PK, `new_recording_id` FK, `reason`, `canonical_mbid`, `merge_generation`, `merged_at`을 저장한다. 두 ID는 `music_recording ON DELETE RESTRICT`, 서로 달라야 하며 cycle과 16단계 초과를 금지한다.

### `music_recording_duplicate_candidate`

`candidate_id` PK, UUID 정렬된 `recording_id_low/high`, `match_score`, `same_isrc`, `same_acoustid`, `same_artist`, `normalized_title_match`, `length_difference_ms`, `evidence jsonb`, `candidate_status`, `reviewed_at`, timestamps를 저장한다.

- UNIQUE `(recording_id_low, recording_id_high)`.
- `low < high`, score 0~1, 길이 차이 음수 금지.
- 상태: pending, confirmed, rejected, mb_merged.
- MusicBrainz redirect 확정 또는 관리자 confirmed만 실제 merge를 허용한다.

### `music_mbid_resolution_observation`

`observation_id` PK, `idempotency_key UNIQUE`, `entity_type`, `requested_mbid`, `returned_mbid`, `final_url`, `http_status`, `response_hash`, `result_kind`, `observed_at`, `processed_at`을 저장한다.

- result: stable, redirect, not_found, invalid, transient_error, schema_error.
- final URL은 진단 정보일 뿐 canonical의 단독 근거가 아니다.
- `(entity_type, requested_mbid, observed_at DESC)` 인덱스.

### `music_entity_merge_audit`

모든 내부 entity merge 이력의 공통 원장이다. `merge_id uuid PK`, `entity_type`, `loser_entity_id`, `survivor_entity_id`, `reason`, `canonical_mbid`, `evidence jsonb`, `merge_generation`, `merged_at`, `merged_by`를 저장한다.

- UNIQUE `(entity_type, loser_entity_id)`.
- loser와 survivor가 다르고 generation>0이어야 한다.
- polymorphic ID의 실제 존재와 각 본체 `merged_into_*_id` 일치는 deferred trigger가 검증한다.
- MBID별 redirect edge는 각 `music_*_mbid` 테이블, 내부 ID merge는 이 감사 테이블과 본체 `merged_into_*_id`가 SSOT다.

## 5.4 Artist credit

`music_album_artist_credit`, `music_release_artist_credit`, `music_recording_artist_credit`, `music_track_artist_credit`를 둔다.

- 컬럼: 부모 UUID, `position smallint`, `artist_id`, `credited_name`, `join_phrase`.
- PK `(부모 ID, position)`.
- 부모 FK `ON DELETE CASCADE`, artist FK `ON DELETE RESTRICT`.
- position>=0, 표시명 공백 금지.
- 각 `artist_id` 인덱스.

## 5.5 장르·MusicBrainz 태그·ISRC

### `music_genre`

`genre_mbid uuid PK`, `name`, `normalized_name UNIQUE`, `disambiguation`, timestamps. 공백 이름을 금지한다.

연결 테이블:

- `music_artist_genre`, `music_album_genre`, `music_release_genre`, `music_recording_genre`.
- 컬럼: 부모 ID, `genre_mbid`, `vote_count`, `synced_at`.
- PK `(부모 ID, genre_mbid)`, 부모 CASCADE, genre RESTRICT, vote>=0, genre 역방향 인덱스.

### `music_tag`

`tag_id bigint identity PK`, `canonical_name`, `normalized_name UNIQUE`, `category`, `embedding_enabled`, `embedding_weight`, `is_reviewed`, timestamps.

- category: genre, style, mood, theme, era, instrument, language, region, context, personal, noise, unknown.
- 기본값은 `category='unknown'`, `embedding_enabled=true`, `embedding_weight=1`, `is_reviewed=false`다.
- weight>=0, 이름 공백 금지.
- personal/noise는 관리 RPC가 기본 `embedding_enabled=false`로 설정한다.

### `music_tag_alias`

`tag_alias_id bigint identity PK`, `source`, `alias_name`, `normalized_alias`, `tag_id`, `created_at`.

- UNIQUE `(source, normalized_alias)`, source는 musicbrainz/lastfm/admin.
- tag FK RESTRICT와 tag 인덱스.

MusicBrainz 연결:

- `music_artist_mb_tag`, `music_album_mb_tag`, `music_release_mb_tag`, `music_recording_mb_tag`.
- 컬럼: 부모 ID, `tag_id`, `source_tag_name`, `vote_count`, `synced_at`.
- PK `(부모 ID, tag_id)`, 부모 CASCADE, tag RESTRICT, vote>=0, tag 인덱스.
- MusicBrainz 장르·태그는 Last.fm 점수와 합산하지 않고 임베딩에도 넣지 않는다.

### `music_recording_isrc`

- 컬럼 `recording_id`, `isrc`, `created_at`.
- PK `(recording_id, isrc)`, recording CASCADE.
- CHECK `isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'`.
- `isrc` 인덱스는 두되 UNIQUE는 금지한다.

## 5.6 Last.fm 상태·fetch

### `lastfm_recording_profile`

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `recording_id` | `uuid` | PK/FK |
| `canonical_mbid_snapshot` | `uuid` | MusicBrainz 현재값 |
| `active_source_mbid` / `previous_success_mbid` | `uuid` | 태그 출처·이전 성공 |
| `lookup_method` | `text` | canonical_mbid, previous_mbid, alias_mbid, exact_name, autocorrect_name |
| `match_status` | `text` | pending, matched, no_data, ambiguous, retry, blocked, quarantined |
| `is_verified` | `boolean` | 벡터 사용 가능 |
| `returned_mbid` | `uuid` | Last.fm 응답 |
| `returned_track_name` / `returned_artist_name` | `text` | 응답 identity |
| `received_tag_count` | `integer` | 전체 수 |
| `persisted_tag_count` | `smallint` | 0~20 |
| `active_source_hash` / `active_input_hash` | `bytea` | SHA-256 |
| `canonical_lookup_failed` / `is_stale` | `boolean` | 상태 |
| `consecutive_empty_cycles` | `smallint` | 모든 후보가 빈 회차 수 |
| `consecutive_ineligible_cycles` | `smallint` | 유효 태그가 1~2개인 연속 회차 |
| `stale_grace_until` | `timestamptz` | 기존 태그 유예 |
| `last_attempt_at` / `last_success_at` / `next_sync_at` | `timestamptz` | 스케줄 |
| `last_error_code` / `last_error_message` | `integer` / `text` | 오류 |
| `row_version` | `bigint` | 동시성 |
| timestamps | `timestamptz` | 생성·변경 |

- PK/FK recording RESTRICT.
- persisted 0~20, received>=persisted, 두 cycle count와 version 음수 금지, 해시 길이 CHECK.
- due partial index `(next_sync_at) WHERE match_status IN ('pending','matched','no_data','retry')`.
- `active_source_mbid WHERE NOT NULL` 인덱스.

### `lastfm_tag_fetch`

`fetch_id uuid PK`, `recording_id`, `request_key UNIQUE`, `fetch_status`, `selected_attempt_id`, 시작·완료·재시도 시각, `lease_until`, `fence_token`, 오류, `created_at`.

- 상태: pending, running, succeeded, empty, retry, blocked, quarantined, failed.
- recording FK RESTRICT, UNIQUE `(fetch_id, recording_id)`.
- attempt에 UNIQUE `(fetch_id, attempt_id)`를 추가하고 fetch의 `(fetch_id, selected_attempt_id)`가 이를 참조하는 DEFERRABLE 복합 FK를 사용한다.
- request key는 SHA-256의 hex 표현이며 `recording_id`, 30일 refresh cycle UTC 시작시각, resolution version, filter policy version을 length-prefix 인코딩해 만든다. 회차 시각을 빼면 다음 refresh가 영구 차단되므로 금지한다.
- claim partial index와 running lease partial index를 둔다.

### `lastfm_tag_fetch_attempt`

`attempt_id uuid PK`, `fetch_id`, `attempt_no`, `candidate_kind`, 요청 MBID 또는 artist/track, 결과 상태, 반환 identity, `tag_count`, response hash, HTTP/API 오류, `fetched_at`.

- UNIQUE `(fetch_id, attempt_no)`, UNIQUE `(fetch_id, attempt_id)`, fetch CASCADE.
- attempt>0, tag_count>=0.
- MBID 후보는 MBID만, name 후보는 두 이름을 요구하는 XOR CHECK.
- candidate: canonical_mbid, previous_mbid, alias_mbid, exact_name, autocorrect_name.
- result: success, empty, no_data, ambiguous, transient_error, permanent_error, blocked.

### `lastfm_recording_tag`

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `recording_id` | `uuid` | Recording |
| `tag_id` | `bigint` | 통합 태그 |
| `fetch_id` | `uuid` | 선택 fetch |
| `source_mbid` | `uuid` | MBID 출처 |
| `source_tag_name` | `text` | Last.fm 원문 |
| `weighted_count` | `integer` | 원문 정수 |
| `normalized_weight` | `real` | 0~1 clamp |
| `vector_rank` | `smallint` | 1~20 |
| `synced_at` | `timestamptz` | 동기화 |

- PK `(recording_id, tag_id)`, UNIQUE `(recording_id, vector_rank)`.
- recording CASCADE, tag RESTRICT.
- `(fetch_id, recording_id) → lastfm_tag_fetch(fetch_id, recording_id) ON DELETE RESTRICT` 복합 FK로 다른 Recording의 fetch 참조를 막는다.
- count>=0, weight 0~1, rank 1~20.
- 이 테이블에는 필터를 통과해 실제 임베딩에 선택된 3~20개만 저장한다. 제외 태그는 fetch 원문 또는 기간 제한 감사 데이터에만 둔다.
- 다른 candidate 응답의 count를 합산·평균하지 않는다.

## 5.7 임베딩 원장·outbox

### `music_embedding_profile`

`profile_id uuid PK`, 표시명, 기존 `LLMModel` 참조값, provider/model/revision, `dimensions=384`, `distance_metric='cosine'`, output normalization, query/document prefix, canonicalizer/filter/input format version, `max_tags=20`, `profile_fingerprint UNIQUE`, `profile_status`, 생성·폐기 시각.

- profile 의미 컬럼은 최초 참조 후 UPDATE 금지. 변경은 새 profile로 만든다.
- status는 building, ready, serving, fallback, retired다.
- 부분 UNIQUE `WHERE profile_status='serving'`으로 serving 최대 하나를 보장한다.
- fingerprint 길이, 384차원, cosine, max 20 CHECK.

### `lastfm_recording_embedding_source`

`recording_id`, `profile_id`, canonical/source MBID, selected fetch, selected tag count, 정확한 `canonical_input_text`, source/input hash, `source_version`, eligible/stale, ineligible reason, 시각.

- PK `(recording_id, profile_id)`.
- recording/profile RESTRICT.
- `(selected_fetch_id, recording_id) → lastfm_tag_fetch(fetch_id, recording_id) ON DELETE RESTRICT` 복합 FK.
- source_version>0.
- eligible이면 tag 3~20, 비어 있지 않은 text와 두 hash 필수.
- ineligible이면 reason 필수.
- hash는 `jsonb::text`가 아닌 실제 모델 입력 UTF-8 바이트로 만든다.

### `music_recording_embedding_state`

`recording_id`, `profile_id`, desired version/seq/hash, remote seq, 상태, attempt, 오류, updated_at.

- PK `(recording_id, profile_id)`.
- 상태: pending, processing, synced, stale, failed, deleted.
- seq/version 음수 금지, `desired_source_seq>=remote_source_seq`.

### `music_vector_outbox`

`event_id uuid PK`, `source_seq bigint UNIQUE DEFAULT nextval(...)`, recording ID, profile/fingerprint, canonical/source MBID, source version/hash, input hash/text, 태그 수, 최초 생성 벡터, vector/payload hash, 상태, attempt, available/lease/fence, 오류, 생성·전달 시각을 저장한다.

- operation: upsert, relabel, stale, delete. 별도 merge 이벤트는 사용하지 않는다.
- status: pending, processing, retry, delivered, dead.
- UNIQUE `(recording_id, profile_id, source_version, operation)`.
- 모든 event에 profile ID가 필수다. delete도 `(recording_id, profile_id)` tombstone을 대상으로 한다.
- upsert는 profile·fingerprint·input hash/text·tag count 필수.
- upsert 최초 생성 후 fenced update로 `generated_embedding real[]`, `vector_hash bytea`, `payload_hash bytea`, `embedded_at timestamptz`를 한 번만 저장한다.
- `array_length(generated_embedding,1)=384`; 생성된 vector/hash/payload는 이후 UPDATE 금지 trigger로 불변화한다.
- 원격 재시도는 임베딩 API를 다시 호출하지 않고 저장된 동일 배열·해시만 전송한다.
- delivered가 프로젝트 2 inbox에서 확인된 뒤에만 generated embedding을 NULL로 scrub할 수 있다. 불변 trigger는 최초 NULL→값 저장, 동일 값 유지, `OLD.outbox_status='delivered' AND NEW.generated_embedding IS NULL`인 scrub만 허용한다.
- survivor upsert/stale과 loser delete는 서로 다른 event ID와 source seq로 발행한다.
- claim partial index `(available_at, source_seq) WHERE pending/retry`.
- lease partial index, recording/seq 인덱스.
- outbox에는 재시도 시 그대로 쓸 immutable 입력 스냅샷을 저장한다.

## 5.8 작업·로그

### `music_sync_job`

`job_id uuid PK`, job kind, entity type/ID, `idempotency_key UNIQUE`, 상태, priority, expected row version, attempt, available/lease/fence, HTTP/API 오류, 생성·완료 시각.

- kind: mb_lookup, mb_redirect, lastfm_tags, embedding, reconcile.
- 상태: pending, processing, retry, completed, blocked, quarantined, dead.
- entity polymorphic FK는 claim/apply RPC가 검증한다.
- `(priority, available_at, created_at) WHERE pending/retry`, lease partial index.

### `music_sync_run`

run ID, kind, 시작·종료, 상태, request/success/failure count, 오류. count 음수와 `success+failure>request`를 금지하고 성공 상세은 30일 보존한다.

### `music_dead_letter`

dead letter ID, source kind/ID, reason, 비밀 제거 payload, 실패·해결 시각, 조치 메모.

- source: sync_job, lastfm_fetch, vector_outbox.
- 부분 UNIQUE `(source_kind, source_id) WHERE resolved_at IS NULL`.
- 미해결 실패 시각 인덱스.

## 5.9 FK·workflow 인덱스 최종 목록

앞 절의 PK/UNIQUE가 선두 컬럼으로 이미 충족한 경우를 제외하고 다음 인덱스를 반드시 둔다.

- duplicate candidate의 `recording_id_low`, `recording_id_high`.
- 모든 merge target FK.
- fetch attempt의 `fetch_id`; current tag의 `tag_id`, `fetch_id`.
- embedding source의 `profile_id`, `selected_fetch_id`.
- embedding state의 `(state_status, updated_at)`, `(desired_source_seq)`.
- outbox의 `profile_id`, `(recording_id, profile_id, source_seq DESC)`.
- dead letter의 `(failed_at) WHERE resolved_at IS NULL`.
- compact 표에 기록된 모든 부모 FK와 역방향 tag/genre/artist FK.

## 5.10 수집 스케줄·allowlist·discovery·용량·통제 purge

### `music_collection_schedule`

관리자 설정 스케줄의 권위 원장이다. `schedule_id uuid PK`, 고유 `schedule_key`,
표시 이름, `schedule_kind(daily|interval)`, KST 실행 시각 또는 interval 분,
`next_run_at`, 활성/claim lease/fence, 날짜 시작·종료 offset, 국가·Release Group
primary/secondary type·MusicBrainz status 필터, batch/request/new-recording 상한,
우선순위와 timestamps를 저장한다.

- daily는 `daily_time_kst`만, interval은 `interval_minutes`(1~1440)만 요구한다.
- 날짜 offset은 `-30..730`, 시작은 종료 이하여야 한다.
- batch 1~100, 요청 1~500, 신규 Recording 1~5000으로 제한한다.
- dispatcher는 `next_run_at` partial index와 `FOR UPDATE SKIP LOCKED`를 사용한다.
- 450MB에 도달하면 신규 schedule claim을 하지 않고 `music_collection_schedule`과
  `nrm_system_schedule` 활성 스케줄을 모두 비활성화한다. 자동 재활성화하지 않는다.
  개별 music RPC write-stop으로 앱 CRUD를 막지 않는다.
- **행 삭제는 금지**한다(`BEFORE DELETE` 트리거). 관리자 RPC `music_rpc_admin_schedule_upsert`는
  기존 `schedule_id` update-only이며 `schedule_key`는 불변이다. 앱 UI 신규 생성·삭제는 없다.
- 관리 UI의 단일 목록은 공통 원장 [`nrm_system_schedule`](./system-schedule.md)이다.
  MusicBrainz 수집 스케줄은 `job_kind=musicbrainz_collection`으로 연결되며, 앱에서는
  **실행 주기·on/off만** 편집한다(필터·상한·아티스트 allowlist UI 없음).

### Last.fm 유명 아티스트 Pool → MusicBrainz 발매예정

운영 수집 스케줄은 정적 allowlist seed가 아니라 Last.fm Top 아티스트를 매 실행마다
갱신한 뒤 MusicBrainz 발매예정 Release를 수집한다.

```text
Last.fm
 ├─ 한국 Top 100   geo.getTopArtists(Korea, Republic of)
 ├─ 글로벌 Top 100 chart.getTopArtists
 ├─ Hip-Hop Top 100 tag.getTopArtists(hip-hop)
 └─ Korean Hip-Hop Top 100 tag.getTopArtists(korean hip hop)
          ↓
      아티스트 통합(스케줄 간 배타 소유)
          ↓
      MusicBrainz Artist 매칭(Last.fm mbid 우선, 없으면 artist search)
          ↓
      music_schedule_artist Pool
          ↓
      MusicBrainz 발매예정 Release/Track/Recording 수집
```

| schedule_key | Last.fm method | param | 시각(KST) | priority | max artists | max new recordings |
|---|---|---|---|---|---|---|
| `musicbrainz-lastfm-korea-top` | `geo.getTopArtists` | `Korea, Republic of` | 09:00 | 20 | 100 | 1000 |
| `musicbrainz-lastfm-korean-hiphop-top` | `tag.getTopArtists` | `korean hip hop` | 10:00 | 10 | 100 | 1000 |
| `musicbrainz-lastfm-hiphop-top` | `tag.getTopArtists` | `hip-hop` | 10:30 | 30 | 100 | 1000 |
| `musicbrainz-lastfm-global-top` | `chart.getTopArtists` | (없음) | 11:00 | 40 | 100 | 1000 |

규칙:

- 스케줄 due 시 `lastfm_artist_pool` job을 먼저 만들고, pool 적용 후에만 discovery scan을 큐잉한다.
- `music_collection_schedule.lastfm_method` / `lastfm_param` / `lastfm_limit`(기본 100)이 소스 계약이다.
- 활성 `music_schedule_artist`의 `artist_mbid`는 **전 스케줄 배타**다(부분 UNIQUE). 우선순위가
  낮은(숫자 작은) 스케줄이 소유권을 가진다: korean-hiphop(10) < korea(20) < hiphop(30) < global(40).
- 동일 Release MBID가 이미 권위 원장에 있거나 다른 스케줄이 queued/applied면 후발 스케줄은
  hydrate하지 않고 duplicate로 집계한다.
- 스케줄 run당 **신규 Recording insert**는 `max_new_recording_count`(기본·운영값 1000)를 넘지 않는다.
  이미 존재하는 Recording은 상한에 포함하지 않는다.
- Last.fm API Key는 프로젝트 1 Edge Function Secret `LASTFM_API_KEY`에만 둔다.

### `music_artist_allowlist`, `music_schedule_artist`

allowlist는 내부 Artist 생성 전에도 검증 가능한 `artist_mbid uuid PK`, 표시명,
`cohort`, 낮을수록 먼저 처리하는 priority, pin/활성 여부, 검증 시각·선정 근거와
timestamps를 저장한다. `music_schedule_artist(schedule_id, artist_mbid)`는 스케줄별
대상을 연결하고 개별 priority override를 허용한다. 이름으로 식별하지 않으며,
운영 Pool은 Last.fm → MusicBrainz 매칭 RPC가 매 실행 갱신한다.

### `music_discovery_scan`, `music_release_candidate`

- scan은 `(run_id, schedule_id, artist_mbid)`당 하나이며 request key가 유일하다.
  검색 인덱스 변동 때문에 새 실행은 항상 offset 0에서 시작하고, 같은 실행 안에서만
  `next_offset`, page/count/hash, lease/fence와 완료 상태를 이어간다.
- candidate는 `(schedule_id, release_mbid)` 및 request key로 멱등화한다. 검색 결과의
  Release MBID, Release Group MBID, 부분 날짜, status/country/type 스냅샷과
  `discovered|queued|hydrating|applied|rejected|quarantined` 상태를 저장한다.
- search 결과는 후보일 뿐이다. 권위 원장 적용은 lookup 검증을 마친 fenced
  `music_rpc_apply_release_bundle` 트랜잭션에서만 한다.

### `music_api_limiter`, `music_capacity_policy`, `music_capacity_snapshot`,
`music_capacity_event`, `music_retention_policy`

- limiter singleton은 모든 MusicBrainz 요청 시작을 직렬화하며 기본 간격은 1100ms다.
- capacity policy singleton 기본값은 discovery-stop `450 MiB`, hard limit `500 MiB`다.
  warning/write_stop 컬럼은 호환용으로 남기되 운영 게이트는 450MiB 스케줄러 off만 사용한다.
- snapshot은 `pg_database_size(current_database())`와 주요 음악 relation bytes를
  시점별 보관한다. event는 경계 진입·스케줄 비활성화·정리·purge를 감사한다.
- retention은 성공 run 30일, 성공 상세 30일, 실패 상세 90일, 해결 dead letter
  180일을 기본으로 한다. 자동 `VACUUM FULL`은 금지한다.

### `music_purge_entity_tombstone`, `music_recording_purge_tombstone`

- entity tombstone은 purge한 album/release/track/recording의 내부 ID, 당시 canonical
  MBID, 원인, purge batch와 시각을 영구 보존한다.
- Recording tombstone은 내부 `recording_id` PK, canonical MBID, 단조 `source_version`,
  `vector_delete_status(pending|delivered|not_required)`, 시각을 영구 보존한다.
- purge는 낮은 우선순위·오래 미검증된 active 앨범 순으로 dry-run 후보를 만들며,
  공유 Recording(대상 앨범 밖 Track이 참조), redirect/merge 감사에 연결된 엔터티,
  allowlist Artist는 삭제하지 않는다.
- 실제 purge는 `music_rpc_capacity_purge`만 수행한다. 권위 테이블 DELETE는
  `service_role`에서 철회한다. 기존 hard-delete trigger는 유지하며 함수의 NOLOGIN
  owner와 트랜잭션 로컬 purge 표식이 모두 일치할 때만 통과한다.
- 자식/연결 행 → Track/MBID → Release/MBID → 비공유 Recording/MBID → Album/MBID
  순으로 삭제하며 tombstone을 먼저 기록한다.

## 5.11 기존 작업·실행 테이블 확장

- `music_sync_job`은 `mb_discovery`, `mb_release_hydrate`, `mb_recording_hydrate` 종류와
  nullable `schedule_id`, `schedule_run_id`, `candidate_id`, `discovery_scan_id`를 가진다.
- `music_sync_run`은 `schedule_id`, `schedule_run_id`, 발견/삽입/갱신/중복/실패,
  capacity 전후 집계를 가진다. schedule run은 `music_schedule_run`이 담당하며
  한 schedule의 dispatcher 실행을 멱등 request key로 식별한다.
- worker 완료/재시도는 claim 때 발급한 fence token이 같은 processing 행만 바꾼다.

---

# 6. 프로젝트 2: `NullReferenceMusic-Vector`

프로젝트 2는 프로젝트 1의 projection이다. 벡터 외에도 안전한 동기화에 필요한 profile, inbox, hash, seq와 tombstone만 저장한다.

## 6.1 `vector_embedding_profile`

프로젝트 1 profile의 immutable 스냅샷이다.

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `profile_id` | `uuid` | PK, 프로젝트 1과 동일 |
| `profile_fingerprint` | `bytea` | UNIQUE SHA-256 |
| `provider_name` | `text` | 제공자 |
| `model_name` / `model_revision` | `text` | 고정 모델·revision |
| `dimensions` | `integer` | 384 |
| `distance_metric` | `text` | cosine |
| `output_normalization` | `text` | l2 또는 none |
| `query_prefix` / `document_prefix` | `text` | 모델 task prefix |
| `canonicalizer_version` | `text` | 정규화 버전 |
| `filter_policy_version` | `text` | 필터 버전 |
| `input_format_version` | `text` | 입력 형식 |
| `max_tags` | `smallint` | 20 |
| `profile_status` | `text` | building, ready, serving, fallback, retired |
| `created_at` / `retired_at` | `timestamptz` | 생성·폐기 |

- PK, fingerprint UNIQUE와 32바이트 CHECK.
- dimensions=384, metric=cosine, max_tags=20.
- 참조된 profile 의미 변경 금지. 변경은 새 profile로만 한다.
- 부분 UNIQUE `WHERE profile_status='serving'`으로 serving profile 최대 하나를 보장한다.
- ready/fallback profile 검색은 서버가 명시한 profile ID로만 허용한다.
- profile을 먼저 동기화한 뒤 해당 profile의 벡터 이벤트를 적용한다.

## 6.2 `vector_inbox_event`

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `event_id` | `uuid` | PK, 프로젝트 1 outbox ID |
| `source_seq` | `bigint` | UNIQUE 전역 순서 |
| `recording_id` | `uuid` | 대상 |
| `profile_id` | `uuid` | 대상 profile |
| `operation` | `text` | upsert, relabel, stale, delete |
| `payload_hash` | `bytea` | 전송 payload SHA-256 |
| `apply_status` | `text` | applied, ignored_old |
| `received_at` / `applied_at` | `timestamptz` | 수신·적용 |
| `error_code` | `text` | 충돌 코드 |

- PK `(event_id)`, UNIQUE `(source_seq)`.
- source_seq>0, operation/status 목록, payload hash 길이 CHECK.
- `(recording_id, profile_id, source_seq DESC)` 인덱스.
- inbox insert와 vector projection 변경은 한 트랜잭션이다.
- 동일 event 재전송은 새 inbox 행을 만들지 않고 기존 적용 결과를 반환한다.

### `vector_event_conflict`

같은 source seq의 다른 event/payload는 inbox UNIQUE 때문에 inbox에 넣을 수 없으므로 별도 기록한다.

`conflict_id uuid PK`, incoming event ID/seq/recording ID/payload hash, existing event ID/payload hash, `detected_at`, `resolved_at`, `resolution_note`를 저장한다. `(source_seq, detected_at)` 인덱스를 둔다.

## 6.3 `lastfm_recording_embedding`

| 컬럼 | 타입 | NULL | 의미 |
|---|---|---:|---|
| `recording_id` | `uuid` | N | 복합 PK |
| `profile_id` | `uuid` | N | 복합 PK, profile FK |
| `profile_fingerprint` | `bytea` | Y | profile 검증 |
| `canonical_mbid_snapshot` | `uuid` | Y | 진단용 현재 MBID |
| `source_mbid` | `uuid` | Y | Last.fm 태그 출처 |
| `source_version` / `source_seq` | `bigint` | N | 마지막 적용 버전·순서 |
| `source_hash` / `input_hash` | `bytea` | Y | 태그·입력 해시 |
| `selected_tag_count` | `smallint` | Y | 입력 태그 수 |
| `embedding` | `extensions.vector(384)` | Y | Last.fm 태그 벡터 |
| `vector_hash` | `bytea` | Y | 벡터 payload 해시 |
| `is_stale` | `boolean` | N | 이전 태그 유예 |
| `is_deleted` | `boolean` | N | tombstone |
| `last_event_id` | `uuid` | N | 최종 event UNIQUE |
| `embedded_at` / `updated_at` | `timestamptz` | Y/N | 생성·변경 |

제약:

- PK `(recording_id, profile_id)`, profile FK RESTRICT, UNIQUE `(last_event_id)`.
- source version·seq > 0.
- active이면 profile/fingerprint/hash/tag count/embedding/vector hash/embedded_at이 모두 필요하다.
- active tag count는 3~20이다.
- deleted이면 embedding은 NULL이고 seq/event는 유지한다.
- 모든 SHA-256은 32바이트다.
- apply RPC가 profile fingerprint, 정확한 384개 유한 요소, non-zero vector를 검증한다.
- profile이 l2를 요구하면 norm 허용오차를 검증한다.

HNSW:

```sql
create index ix_lastfm_recording_embedding_hnsw
on public.lastfm_recording_embedding
using hnsw (embedding vector_cosine_ops)
where is_deleted = false and embedding is not null;
```

- `(profile_id) WHERE is_deleted=false`, `(source_seq)` 보조 인덱스.
- 검색은 같은 cosine 연산자 `<=>`를 사용한다.
- 초기 `m=16`, `ef_construction=64`; 실제 recall·용량을 측정한 뒤 변경한다.

## 6.4 프로젝트 2 공개 인터페이스

테이블은 앱에 직접 GRANT하지 않는다. 서버 전용 RPC만 제공한다.

- `vector_rpc_apply_event`
- `vector_rpc_get_event_status`
- `match_lastfm_recordings`
- 관리자 reconciliation용 `vector_rpc_manifest_page`

---

# 7. RPC와 트랜잭션 계약

## 7.1 보안

모든 쓰기 RPC는:

- `SECURITY DEFINER`, `SET search_path=''`.
- 객체를 schema-qualified하고 동적 SQL을 사용하지 않는다.
- 생성 즉시 PUBLIC/anon/authenticated EXECUTE를 철회한다.
- 지정 서버 역할만 실행한다.
- batch, 문자열 길이, UUID, hash, profile을 검증한다.
- 비밀·외부 원문·벡터를 오류 메시지에 포함하지 않는다.

프로젝트 2를 APK가 직접 호출하지 않는다.

## 7.2 `music_rpc_claim_jobs`

- `FOR UPDATE SKIP LOCKED`로 due job을 1~50개 claim한다.
- processing, 새 `fence_token`, `lease_until`을 원자적으로 설정한다.
- API timeout은 lease보다 짧아야 한다.
- 완료·실패는 같은 fence token일 때만 허용한다.
- 만료된 processing은 retry로 회수한다.

## 7.3 `music_rpc_apply_mbid_resolution`

직접 lookup 적용 대상은 Artist, Release Group, Release, Recording이다. Track은 §8.2의 부모 Release 재조회 경로를 사용한다.

한 트랜잭션에서:

1. 엔터티와 관련 MBID 행을 잠근다.
2. expected row/resolution version을 확인한다.
3. requested와 JSON returned ID가 같으면 current를 확인한다.
4. 다르면 redirect edge를 기록하고 returned ID 재조회 작업을 만든다.
5. fixed point가 확인되면 canonical을 정확히 하나로 교체한다.
6. 같은 최종 MBID가 다른 내부 엔터티에 속하면 확정 merge를 수행한다.
7. observation 저장과 버전 증가를 수행한다.
8. Recording canonical 변경이면 Last.fm 재수집과 vector relabel/stale 이벤트를 만든다.

## 7.4 `music_rpc_merge_recordings`

1. 두 최종 root를 UUID 바이트순으로 잠근다.
2. 이미 같은 root면 멱등 성공한다.
3. cycle 또는 16단계 초과면 rollback·quarantine한다.
4. canonical target을 가진 active 엔터티를 survivor로 우선하고, 없으면 생성 시각·UUID로 결정한다.
5. MBID 소유권 충돌을 먼저 확인하고 merge를 완료한 뒤 마지막에 canonical을 교체한다.
6. Track은 `recording_id`를 survivor로 재지정한다.
7. Recording credit은 canonical MusicBrainz 응답의 순서·표시명을 survivor 값으로 전체 교체한다.
8. MusicBrainz genre/tag와 ISRC는 복합키별 union하되 vote count는 canonical 응답값을 우선한다.
9. Last.fm 활성 응답은 `is_verified DESC`, `last_success_at DESC`, source MBID UUID 순으로 하나를 임시 선택하며 count를 합치지 않는다. 이어서 canonical MBID 재조회 작업을 만든다.
10. loser의 Last.fm tag/source/state는 survivor 이관 완료 후 비활성화한다.
11. loser를 merged 처리하고 내부 redirect를 기록한다.
12. source version을 증가시킨다.
13. survivor upsert/stale과 loser delete outbox를 별도 event로 같은 트랜잭션에 넣는다.

## 7.4.1 다른 엔터티 merge

- 공통 canonical winner 순서: MusicBrainz fixed-point MBID 소유 active root → 최신 검증 시각 → 이른 생성 시각 → 내부 UUID.
- `music_rpc_merge_artists`: credit 위치 UNIQUE 충돌은 부모의 최신 canonical credit 전체 교체로 해결하고 genre/tag는 key별 union, primary artist FK는 survivor로 재지정한다.
- `music_rpc_merge_albums`: `music_release.album_id`를 먼저 survivor로 이동하고, 대표판 선택 RPC로 정확히 하나를 재선정한 뒤 track의 복합 release/album FK를 검증한다. album에서 track을 직접 이동하지 않는다.
- `music_rpc_merge_releases`: 같은 album 안에서만 자동 허용한다. 다른 album이면 album merge를 먼저 수행하거나 quarantine한다.
- `music_rpc_merge_tracks`: 같은 대표 Release의 충돌 위치를 자동 덮어쓰지 않고 MusicBrainz 최신 tracklist로 전체 재구성한다.
- 모든 merge는 UUID 순 잠금, 최종 root 재해석, 멱등 성공, cycle 방지와 child 충돌 정책을 Recording RPC와 동일하게 적용한다.
- Release/Track까지 포함한 모든 권위 테이블에 DELETE 권한을 철회하고 hard-delete 방지 trigger를 둔다.

## 7.4.2 version·sequence 증가 규칙

| 값 | 증가 조건 | 증가하지 않는 조건 |
|---|---|---|
| `row_version` | 엔터티 의미·상태·관계의 권위 변경 | job claim, lease, 로그 |
| `resolution_version` | canonical/redirect/MBID 소유권 변경 | metadata 내용만 갱신 |
| `source_version` | Last.fm 활성 태그, stale/delete, profile 목표 변경 | 수집 시각만 갱신 |
| `source_seq` | 프로젝트 2 projection 변경 이벤트 생성 | no-op hash, 단순 fetch 로그 |

- 동일 recording의 projection 변경 RPC는 `music_recording_embedding_state`를 `FOR UPDATE`로 잠근다.
- 잠금 안에서 source version을 증가시키고 같은 트랜잭션의 outbox INSERT 직전에 sequence를 할당한다.
- PostgreSQL sequence는 전역 commit 순서를 보장하지 않으므로 **recording 단위 잠금**이 의미 순서를 보장한다.

## 7.5 `music_rpc_apply_lastfm_fetch`

- fetch·attempt, 현재 태그 교체, embedding source/state, outbox를 한 트랜잭션에서 처리한다.
- 선택된 단일 candidate 응답만 입력받는다.
- 같은 request key 재적용은 멱등 성공한다.
- expected row version 불일치는 결과를 폐기하고 새 작업을 만든다.
- transient 오류는 기존 태그를 변경하지 않는다.
- 모든 candidate가 정상 empty일 때만 empty cycle을 증가시킨다.

## 7.6 `music_rpc_claim_vector_outbox`

- `FOR UPDATE SKIP LOCKED`, lease, fence token을 사용한다.
- upsert는 저장 당시 immutable `canonical_input_text`를 반환한다.
- worker는 현재 태그를 다시 읽어 입력을 재구성하지 않는다.

## 7.7 `vector_rpc_apply_event`

프로젝트 2의 한 트랜잭션에서:

1. event ID가 inbox에 있으면 기존 결과를 반환한다.
2. operation별 payload 계약을 검증한다.
3. `(recording_id, profile_id)` vector/tombstone 행을 잠근다.
4. 더 낮은 seq는 `ignored_old`로 기록하고 성공 반환한다.
5. 같은 seq·다른 event/payload는 `vector_event_conflict`에 기록하고 exception을 던지지 않는다. `applied=false, error_code='SOURCE_SEQ_CONFLICT'`를 정상 반환해 감사 행을 commit한다.
6. 더 큰 seq만 적용한다.
7. upsert는 vector·hash를 교체하고 tombstone을 해제한다.
8. relabel은 embedding 없이 MBID 스냅샷만 바꾼다.
9. stale은 `is_stale=true`로 바꾼다.
10. delete는 embedding을 NULL로 하고 tombstone·seq를 영구 유지한다.
11. inbox 기록과 projection을 함께 commit한다.

존재하지 않는 행에 대한 operation:

- upsert: 새 active 행 생성.
- relabel/stale: `ignored_old`가 아니라 계약 오류로 거부하고 프로젝트 1 reconciliation을 요청한다.
- delete: embedding이 없는 영구 tombstone 행을 생성한다.

operation별 필드:

| operation | 필수 | 금지 |
|---|---|---|
| upsert | profile/fingerprint, input/source/vector/payload hash, source version, tag count, 384 vector, embedded_at | 없음 |
| relabel | profile, canonical/source MBID 스냅샷, source version/seq, payload hash | vector, vector hash, input text |
| stale | profile, source version/seq, payload hash | vector, vector hash, input text |
| delete | profile, source version/seq, payload hash | vector, vector hash, input text |

vector 유한성·차원·norm 검증은 upsert에만 수행한다.

timeout은 미적용으로 단정하지 않는다. `vector_rpc_get_event_status(event_id)`로 확인 후 없을 때만 재시도한다.

## 7.8 `match_lastfm_recordings`

입력:

- `query_embedding vector(384)`
- `profile_id uuid`, `profile_fingerprint bytea`
- `match_count integer` 1~200
- `include_stale boolean` 기본 false

검증:

- profile status가 ready, serving, fallback 중 하나이고 fingerprint가 일치해야 한다. building/retired는 검색 금지다.
- 정확한 384차원, NaN·Infinity·zero vector 거부.

계산:

```sql
similarity = 1 - (embedding <=> query_embedding)
```

반환: `recording_id`, similarity, source seq, input hash, stale 여부.
조건: `is_deleted=false`, profile 일치, stale 정책 일치.

## 7.9 SQL signature

마이그레이션은 최소 다음 signature를 그대로 제공한다. JSON payload는 각 절의 필드만 허용하며 unknown key를 거부한다.

```sql
music_rpc_claim_jobs(
  p_worker_id uuid, p_job_kind text, p_batch_size integer, p_lease_seconds integer
) returns table(job_id uuid, entity_type text, entity_id uuid, fence_token uuid, expected_row_version bigint);

music_rpc_apply_mbid_resolution(
  p_job_id uuid, p_fence_token uuid, p_entity_type text, p_entity_id uuid,
  p_requested_mbid uuid, p_returned_mbid uuid, p_http_status integer,
  p_final_url text, p_response_hash bytea, p_expected_row_version bigint
) returns table(applied boolean, result_code text, root_entity_id uuid, canonical_mbid uuid, row_version bigint);

music_rpc_merge_recordings(
  p_loser_id uuid, p_survivor_id uuid, p_reason text, p_canonical_mbid uuid,
  p_expected_loser_version bigint, p_expected_survivor_version bigint
) returns table(applied boolean, result_code text, survivor_id uuid, survivor_row_version bigint);

music_rpc_apply_lastfm_fetch(
  p_fetch_id uuid, p_fence_token uuid, p_expected_row_version bigint, p_payload jsonb
) returns table(applied boolean, result_code text, source_version bigint, outbox_event_id uuid);

music_rpc_claim_vector_outbox(
  p_worker_id uuid, p_batch_size integer, p_lease_seconds integer
) returns table(event_id uuid, source_seq bigint, recording_id uuid, profile_id uuid, operation text,
                canonical_input_text text, generated_embedding real[], fence_token uuid);

music_rpc_complete_vector_outbox(
  p_event_id uuid, p_fence_token uuid, p_remote_source_seq bigint, p_result_code text
) returns boolean;

vector_rpc_apply_event(
  p_event jsonb, p_embedding extensions.vector(384)
) returns table(applied boolean, result_code text, current_source_seq bigint);

vector_rpc_get_event_status(
  p_event_id uuid
) returns table(found boolean, apply_status text, source_seq bigint, payload_hash bytea);

match_lastfm_recordings(
  p_query_embedding extensions.vector(384), p_profile_id uuid, p_profile_fingerprint bytea,
  p_match_count integer default 50, p_include_stale boolean default false
) returns table(recording_id uuid, similarity double precision, source_seq bigint,
                input_hash bytea, is_stale boolean);
```

공통 result code: `APPLIED`, `ALREADY_APPLIED`, `IGNORED_OLD`, `VERSION_CONFLICT`,
`FENCE_LOST`, `INVALID_PAYLOAD`, `PROFILE_MISMATCH`, `SOURCE_SEQ_CONFLICT`,
`CAPACITY_WRITE_STOPPED`, `QUARANTINED`. 정상적인 멱등·낮은 seq·conflict는 결과 행으로
반환하고 SQL exception은 권한 오류나 복구 불가능한 DB invariant 위반에만 사용한다.

## 7.10 수집 관리자 단계 RPC signature

worker RPC는 `nrm_music_rpc_owner NOLOGIN` 소유, `SECURITY DEFINER`,
`SET search_path=''`, `service_role` 전용이다. 앱 관리자 RPC는
`p_caller_serial`을 받아 `nrm_is_admin_caller`를 함수 안에서 다시 확인한다.

```sql
music_rpc_claim_due_schedules(
  p_worker_id uuid, p_batch_size integer, p_lease_seconds integer
) returns table(schedule_run_id uuid, schedule_id uuid, fence_token uuid,
                date_from date, date_to date, max_request_count integer);

music_rpc_finish_schedule_run(
  p_schedule_run_id uuid, p_fence_token uuid, p_status text,
  p_stats jsonb
) returns table(applied boolean, result_code text);

music_rpc_acquire_mb_permit(
  p_worker_id uuid, p_lease_seconds integer default 15
) returns table(granted boolean, retry_at timestamptz, permit_token uuid);

music_rpc_claim_jobs(
  p_worker_id uuid, p_job_kind text, p_batch_size integer, p_lease_seconds integer
) returns table(job_id uuid, entity_type text, entity_id uuid, fence_token uuid,
                expected_row_version bigint);

music_rpc_finish_job(
  p_job_id uuid, p_fence_token uuid, p_outcome text,
  p_http_status integer default null, p_api_error_code integer default null,
  p_error_message text default null, p_retry_at timestamptz default null
) returns table(applied boolean, result_code text);

music_rpc_apply_discovery_page(
  p_scan_id uuid, p_fence_token uuid, p_offset integer, p_page_size integer,
  p_total_count integer, p_response_hash bytea, p_candidates jsonb,
  p_is_last_page boolean
) returns table(applied boolean, result_code text, candidate_count integer,
                next_offset integer);

music_rpc_apply_release_bundle(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
) returns table(applied boolean, result_code text, candidate_id uuid);

music_rpc_capture_capacity(
  p_source text
) returns table(snapshot_id uuid, database_bytes bigint, capacity_state text,
                writes_allowed boolean, discovery_allowed boolean);

music_rpc_run_retention(
  p_batch_size integer default 1000
) returns jsonb;

music_rpc_capacity_purge(
  p_max_albums integer, p_reason text, p_dry_run boolean default true
) returns table(album_id uuid, canonical_mbid uuid, purged boolean,
                recording_count integer, estimated_bytes bigint);

music_rpc_admin_schedule_upsert(
  p_caller_serial text, p_schedule_id uuid, p_payload jsonb
) returns uuid;
music_rpc_admin_schedule_set_enabled(
  p_caller_serial text, p_schedule_id uuid, p_enabled boolean
) returns boolean;
music_rpc_admin_schedule_run_now(
  p_caller_serial text, p_schedule_id uuid
) returns boolean;
music_rpc_admin_allowlist_upsert(
  p_caller_serial text, p_payload jsonb
) returns uuid;
music_rpc_admin_allowlist_set_enabled(
  p_caller_serial text, p_artist_mbid uuid, p_enabled boolean
) returns boolean;
music_rpc_admin_overview(
  p_caller_serial text, p_limit integer default 50, p_offset integer default 0
) returns jsonb;
music_rpc_admin_allowlist_page(
  p_caller_serial text, p_search text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb;
music_rpc_admin_dead_letter_page(
  p_caller_serial text, p_unresolved_only boolean default true,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb;
music_rpc_admin_dead_letter_resolve(
  p_caller_serial text, p_dead_letter_id uuid, p_resolution_note text
) returns boolean;
music_rpc_admin_dead_letter_retry(
  p_caller_serial text, p_dead_letter_id uuid,
  p_resolution_note text default '관리자 재처리'
) returns boolean;
```

dead-letter 재처리는 해결 표시와 원본 queue 재등록을 한 트랜잭션에서 수행한다.
현재 구현된 `sync_job`은 attempt/error/lease를 초기화해 `pending`으로, `lastfm_fetch`는
`retry`로 되돌린다. 아직 원장 테이블이 구현되지 않은 `vector_outbox`는 조회·해결은
가능하지만 재처리는 지원하지 않으며 향후 vector worker migration에서 확장한다.

`music_rpc_apply_release_bundle`의 payload는 이번 단계에서 계약 외 key를 거부하고
candidate 식별/검증 결과/대표 Release 선택 결과/집계만 원자 기록한다. 실제
MusicBrainz 응답 parsing과 권위 Artist·Release Group·Release·Track·Recording
upsert payload 확장은 worker 단계의 `music_rpc_apply_release_bundle_v2`와
`music_rpc_apply_recording_bundle`에서 버전 관리한다. worker는
`music_rpc_claim_mb_work`로 scan/candidate 최소 context를 lease하며, discovery page가
남으면 `music_rpc_continue_discovery_job`으로 같은 scan의 다음 offset을 durable queue에
돌려놓는다. run 종료는 `music_rpc_finalize_mb_runs`가 미완료 job 부재를 다시 확인한다.

---

# 8. 수집·보정·업데이트 동작

## 8.1 MusicBrainz 제한

- 프로젝트 1의 단일 논리 gateway만 호출한다.
- DB next-allowed-at limiter 또는 advisory lock으로 전체 worker 시작 간격을 조정한다.
- 기본 시작 간격 1.1초, retry·redirect 조회도 같은 limiter를 통과한다.
- Cron due time에 jitter를 넣는다.
- 의미 있는 User-Agent와 연락처가 필수다.
- 503이면 backoff와 전역 감속을 함께 적용한다.

## 8.2 MBID resolution

1. requested MBID를 UUID 소문자로 정규화한다.
2. `/ws/2/{entity}/{mbid}?fmt=json`을 조회한다.
3. requested, JSON `id`, HTTP 상태, final URL을 각각 기록한다.
4. JSON ID가 같으면 stable, 다르면 redirect edge다.
5. returned ID를 다시 조회하여 fixed point를 확인한다.
6. visited MBID 재등장 또는 16단계 초과면 quarantine한다.
7. 최종 `X → X`일 때만 canonical로 확정한다.
8. final URL은 보조 정보이며 단독 근거가 아니다.

404는 1일·7일·30일 간격으로 최소 3회 재확인한다. 첫 404로 삭제하지 않으며 이력은 영구 보존한다.

MBID가 다른 내부 엔터티에 이미 속한 경우에는 requested/returned MBID 행과 양쪽 최종 root를 UUID 순으로 잠근다. 내부 merge를 먼저 끝낸 다음 MBID 소유권 이동과 canonical 교체를 수행한다. 일반 upsert로 MBID 소유자를 조용히 바꾸는 것은 금지한다.

Entity별 endpoint:

| entity type | API path |
|---|---|
| artist | `/ws/2/artist/{mbid}?inc=aliases+tags+genres&fmt=json` |
| album | `/ws/2/release-group/{mbid}?inc=artist-credits+releases+tags+genres&fmt=json` |
| release | `/ws/2/release/{mbid}?inc=release-groups+recordings+artist-credits+labels+media+isrcs+tags+genres&fmt=json` |
| recording | `/ws/2/recording/{mbid}?inc=artist-credits+isrcs+tags+genres&fmt=json` |

- Browse pagination limit은 최대 100으로 고정하고 `offset`을 사용한다.
- Search offset은 변경 가능한 검색 인덱스이므로 영구 증분 cursor로 사용하지 않는다.
- HTTP redirect는 `https`이며 허용 host가 `musicbrainz.org`인지 검증한다.
- 필수 필드 형식이 예상 JSON 계약과 다르면 적용하지 않고 schema_error로 격리한다.
- MusicBrainz WS2에는 Track MBID 직접 lookup endpoint가 없다. Track은 부모 Release를 위 endpoint로 다시 조회한 뒤 `media[].tracks[].id`와 위치를 함께 비교해 검증한다.
- `tid:<track-mbid>` 검색은 부모 Release 후보 탐색에만 쓸 수 있으며 canonical 확정 근거로 사용하지 않는다.

## 8.3 중복 Recording

- 제목·아티스트·길이·ISRC·AcoustID는 후보 생성 근거다.
- 유사성만으로 자동 merge하지 않는다.
- MusicBrainz가 같은 canonical을 반환하거나 관리자가 confirmed한 경우만 merge한다.

## 8.4 Last.fm 후보 순서

중복 제거 후:

1. canonical Recording MBID
2. 이전 성공 MBID
3. 같은 recording ID의 다른 alias MBID
4. 검증된 artist credit + title, autocorrect=0
5. 같은 이름, autocorrect=1

- 유효 응답을 선택하면 뒤 후보를 호출하지 않는다.
- 정상 empty/candidate 영구 오류는 다음 후보로 간다.
- timeout, 5xx, Last.fm 11·16·29는 같은 후보를 retry한다.
- 10·26은 전체 작업 blocked다.
- 이름 반환 identity를 정규화 비교하고 autocorrect 불일치는 ambiguous다.
- Last.fm에는 신선도 timestamp가 없으므로 수집 시각과 정책 TTL만 관리한다.

## 8.5 태그 canonicalization과 hash

`track.getTopTags`에는 반환 개수를 제한하는 `limit` 파라미터가 없다. 응답 수는 곡마다 다르고 최대 개수를 계약으로 보장하지 않으므로 전체 응답을 파싱하되 저장·벡터화는 필터 후 상위 20개로 제한한다. 관찰상 최대 100개 수준의 응답이 와도 동작하도록 parser 입력 상한은 200개로 방어한다.

고정 순서:

1. UTF-8
2. Unicode NFKC
3. trim
4. 연속 whitespace를 ASCII 공백 하나로 축약
5. locale-independent Unicode case fold
6. 제어문자·빈 값·최대 길이 초과 제거
7. tag alias 적용
8. 같은 응답 안에서 중복 제거
9. `weighted_count DESC`, 동점은 normalized UTF-8 byte order ASC
10. personal/noise/embedding disabled 제외
11. 상위 20개 선택

- count는 선택·순위에만 사용하며 기본 임베딩 문자열에는 넣지 않는다.
- 유효 태그 3개 미만이면 벡터를 만들지 않는다.
- 서로 다른 MBID 응답은 절대 합치지 않는다.
- `source_hash`는 정규화 전체 응답+정규화/필터 버전이다.
- `input_hash`는 domain separator+profile fingerprint+형식 버전+실제 모델 입력 UTF-8 bytes다.
- length-prefix encoding을 사용하고 `jsonb::text`, OS locale, 기본 lowercase에 의존하지 않는다.

바이트 계약:

```text
FRAME(text-or-bytes) = u32be(byte_length) || bytes
NULL_FRAME           = 0xffffffff
UUID_BYTES(uuid)     = 하이픈 없는 UUID 16 bytes
U64(value)           = unsigned u64 big-endian
F32(value)           = IEEE-754 float32 round-to-nearest-even, big-endian
SHA256(parts...)     = parts를 그대로 이어 붙인 32-byte digest
```

- 모든 text는 NUL을 덧붙이지 않은 UTF-8이고 각 hash는 ASCII domain separator로 시작한다.
- `profile_fingerprint = SHA256("NRM-PROFILE-v1\0", FRAME(provider), FRAME(model), FRAME(revision), U64(dimensions), FRAME(metric), FRAME(output_normalization), FRAME(query_prefix), FRAME(document_prefix), FRAME(canonicalizer_version), FRAME(filter_policy_version), FRAME(input_format_version), U64(max_tags))`.
- `source_hash = SHA256("NRM-LASTFM-SOURCE-v1\0", FRAME(canonicalizer_version), FRAME(filter_policy_version), 반복(FRAME(normalized_tag_name), U64(weighted_count)))`. 반복 순서는 count DESC, UTF-8 bytes ASC다.
- `canonical_input_text = document_prefix || "tags: " || selected canonical tag name을 " | "로 연결한 문자열`.
- `input_hash = SHA256("NRM-LASTFM-INPUT-v1\0", profile_fingerprint, FRAME(canonical_input_text))`.
- provider 숫자는 F32로 한 번 양자화한 뒤 DB와 전송에 사용한다. `vector_hash = SHA256("NRM-VECTOR-F32-v1\0", F32(v0), ..., F32(v383))`.
- `payload_hash = SHA256("NRM-VECTOR-EVENT-v1\0", UUID_BYTES(event_id), U64(source_seq), UUID_BYTES(recording_id), UUID_BYTES(profile_id), FRAME(operation), U64(source_version), FRAME(profile_fingerprint 또는 NULL), FRAME(canonical_mbid bytes 또는 NULL), FRAME(source_mbid bytes 또는 NULL), FRAME(source_hash 또는 NULL), FRAME(input_hash 또는 NULL), FRAME(vector_hash 또는 NULL))`.
- 이 문서의 hash 함수에 대해 정상·Unicode·NULL·최대 count 테스트 벡터를 한 언어의 fixture JSON으로 만들고 TypeScript와 SQL 검증 테스트가 같은 hex digest를 반환해야 한다.

필터 후 상태:

| 결과 | 처리 |
|---|---|
| API 원본 태그 0개 | candidate empty, 다음 fallback |
| 유효 태그 1~2개 | `matched`지만 embedding ineligible. 기존 활성 tag/source는 보존하고 stale grace, ineligible cycle 증가 |
| 유효 태그 3~20개 | 정상 source 생성, hash에 따라 upsert/relabel |
| transient 오류 | 기존 상태·태그·벡터 유지 |
| all-empty 또는 ineligible가 각 3회이고 grace 만료 | 태그 비활성화, vector delete |

tag alias, category, embedding flag/weight 또는 filter policy가 바뀌면 영향받는 recording ID를 역방향 인덱스로 찾아 source version을 증가시키고 재계산 job을 만든다.

## 8.6 Last.fm 갱신

- 기본 refresh 30일.
- input hash가 같으면 embedding API를 호출하지 않는다.
- MBID만 바뀌면 relabel, hash가 바뀌면 upsert다.
- transient 오류는 기존 태그·벡터를 보존한다.
- 모든 후보가 정상 empty인 회차만 empty cycle을 증가시킨다.
- 유효 태그가 1~2개인 회차는 empty count를 건드리지 않고 ineligible cycle만 증가시키며 기존 활성 tag/source를 교체하지 않는다.
- 기존 태그는 최초 all-empty부터 30일 stale grace를 적용한다.
- 최초 ineligible에도 같은 30일 stale grace를 적용한다.
- 독립 all-empty 3회 또는 독립 ineligible 3회 중 하나와 grace 만료를 만족하면 태그 비활성화와 delete 이벤트를 만든다.
- 유효 태그 3개 이상 성공이면 두 cycle count와 stale을 초기화한다.

## 8.7 임베딩 전달

1. 태그 교체·source·outbox를 프로젝트 1 한 트랜잭션에서 commit한다.
2. worker가 outbox를 lease한다.
3. generated embedding이 NULL일 때만 immutable 입력으로 임베딩 API를 호출한다.
4. 384차원, 유한, non-zero와 정규화 정책을 확인한다.
5. vector/payload hash와 generated embedding을 같은 fence token으로 한 번 저장한다.
6. 프로젝트 2 apply RPC를 호출한다.
7. timeout이면 event status를 확인한다.
8. 적용됐으면 동일 fence token으로 delivered 처리한다.
9. 미적용이면 저장된 같은 vector/payload로 같은 event를 retry한다.

---

# 9. 오류·검색·벡터 호환성

## 9.1 오류 분류

- MusicBrainz transient: timeout/DNS/TLS, 408, 429, 500, 502, 503, 504.
- MusicBrainz config/permanent: 요청 형식 400, 401/403, 반복 JSON schema 오류.
- Last.fm transient: HTTP 429/5xx, API 11·16·29.
- Last.fm candidate no-data: API 7, 정상 빈 tag 배열.
- Last.fm blocked/config: API 4·10·26.
- Last.fm 제한 재시도 후 dead letter: API 8.
- Last.fm 계약 오류: API 2·3·5·6·9·13 → quarantine.
- `Retry-After` 우선, 그 외 `min(30초×2^attempt, 6시간)+full jitter`.
- 최대 횟수 후 dead letter. 인증·계약 오류는 고빈도 재시도하지 않는다.

## 9.2 profile·질의 호환성

- 질의와 문서는 같은 profile fingerprint를 사용한다.
- 모델·revision·384차원·pooling·정규화·task prefix가 같아야 한다.
- 자연어 질의를 사용할 경우 모델의 query/document 계약을 검증하고 prefix를 profile에 고정한다.
- mutable alias의 실제 revision이 바뀌면 새 profile과 전체 재임베딩이 필요하다.
- 차원이 바뀌면 범용 vector로 변경하지 않고 버전 테이블을 새로 만든다.

## 9.3 두 프로젝트 검색

1. 프로젝트 1 Edge Function이 질의 벡터를 만든다.
2. 프로젝트 2에서 필요 수의 5배 이상, 최대 500개를 over-fetch한다.
3. 프로젝트 1에서 최종 recording root를 보정한다.
4. merged/deleted/quarantined를 제외하고 메타데이터 필터를 적용한다.
5. 부족하면 제한된 횟수로 K를 늘려 재검색한다.

관계형 필터가 프로젝트 1에만 있으므로 필터 내 완전한 최근접 이웃은 보장하지 않는다. 필요해지면 자주 쓰는 최소 facet을 프로젝트 2에 복제하는 별도 변경이 필요하다.

## 9.4 profile 전환

1. 두 프로젝트에 새 profile을 building으로 등록한다.
2. 기존 serving profile을 유지한 채 새 `(recording_id, profile_id)` 벡터를 채운다.
3. manifest가 목표 Recording을 충족하면 프로젝트 2 profile을 ready로 바꾼다.
4. 프로젝트 1이 새 profile ID를 검색 요청에 사용한다.
5. 확인 후 프로젝트 2 새 profile을 serving, 기존 것을 fallback으로 바꾼다.
6. 유예기간 후 기존 profile을 retired한다.

단일 `recording_id` PK로 profile을 덮어쓰는 방식은 무중단 전환을 막으므로 금지한다.
profile 전환 권위는 프로젝트 1이다. 각 상태 변경은 expected old status와 profile fingerprint를 받는 전용 RPC로 조건부 적용한다. 단계 4 이전 실패는 새 profile을 building/ready로 유지하고 기존 serving을 사용한다. 단계 4 이후 프로젝트 2 전환 실패는 프로젝트 1을 기존 fallback profile로 즉시 되돌리고 reconciliation이 성공할 때까지 새 쓰기를 중단한다.

## 9.5 Edge Function·Cron 계약

| Function | 인증 | 기본 주기 | batch/timeout | 역할 |
|---|---|---|---|---|
| `musicbrainz-sync` | Cron 서버 인증만 | 매분 | 45요청/50초 | Last.fm artist pool + MB discovery/hydrate, 전역 1.1초 limiter |
| `lastfm-tag-sync` | Cron 서버 인증만 | 2분마다 | 25건/50초 | Last.fm `track.getTopTags` (미구현) |
| `music-vector-relay` | Cron 서버 인증만 | 매분 | 25건/50초 | outbox claim, embedding 생성, 프로젝트 2 적용 |
| `music-vector-reconcile` | 관리자/Cron | 매일 | page 500/50초 | 두 프로젝트 manifest 비교·repair |
| `music-vector-search` | 앱 JWT 필수 | 요청 시 | K≤500/10초 | query embedding, vector 검색, 프로젝트 1 hydrate |

- Cron은 Supabase Vault에 저장한 URL·서버 토큰으로 호출하고 body는 `{"scheduled_at":"<UTC ISO-8601>"}`다.
- 동일 Function 중첩 실행은 허용하되 DB claim/lease가 중복 작업을 차단한다.
- 각 응답은 `run_id`, claimed/succeeded/retried/dead 수, `has_more`만 반환한다.
- 사용자 검색 요청은 `query` 최대 2,000 UTF-8 bytes, 최종 결과 1~100개, metadata filter allowlist만 허용한다.
- relay payload는 64KB 이하, apply/search SQL `statement_timeout`은 각각 15초/3초를 기본으로 한다.
- 외부 API connect/read timeout은 5초/15초이며 전체 Function timeout보다 짧아야 한다.
- Cron이 직접 외부 API나 테이블 DML을 하지 않고 항상 Edge Function→전용 RPC 경로를 사용한다.

---

# 10. 정합성·보안·용량

## 10.1 매일 검사할 불변식

- active 엔터티마다 canonical MBID가 정확히 하나이며 캐시와 일치.
- redirect·internal merge graph cycle 없음.
- redirect 최종 MBID가 같은 내부 root에 속함.
- merged Recording이 활성 태그·벡터 목표를 소유하지 않음.
- Last.fm source MBID가 alias 집합에 있거나 검증된 name fallback임.
- persisted tag count, 실제 행 수, input hash가 일치.
- 프로젝트 1 desired seq/hash/profile과 프로젝트 2 manifest 일치.
- delivered outbox가 inbox에 존재하고 프로젝트 2 seq가 권위 seq보다 앞서지 않음.
- 만료 lease·장기 pending·dead letter·tombstone 부활 시도 점검.

복구는 직접 삭제보다 repair event 재발행을 우선한다. manifest는 `recording_id`, seq/version, input hash, profile fingerprint, deleted 여부만 페이지 단위로 비교한다.

## 10.2 RLS·Secret

- 프로젝트 1 새 테이블은 RLS를 켜고 앱에는 필요한 read-only View/RPC만 공개한다.
- queue/outbox/error 직접 접근은 금지하고 서버/관리자 RPC만 쓴다.
- 프로젝트 2 테이블·inbox의 PUBLIC/anon/authenticated 권한을 철회한다.
- 프로젝트 2 apply/search는 프로젝트 1 Edge Function만 서버 자격증명으로 호출한다.

함수 owner는 `nrm_music_rpc_owner NOLOGIN` 전용 role로 하고 owner에게만 필요한 테이블 권한을 준다. 함수별로 다음을 migration에 명시한다.

```sql
revoke all on function public.<function_signature> from public, anon, authenticated;
grant execute on function public.<function_signature> to service_role;
```

앱 검색 진입점만 `authenticated`에 별도 GRANT하며 함수 내부에서 `auth.uid()`와 사용자 권한·rate limit을 검증한다. service-role 전용 apply RPC와 앱 검색 RPC를 같은 공개 함수로 합치지 않는다.

프로젝트 1 Edge Function Secrets:

```text
MUSICBRAINZ_USER_AGENT
LASTFM_API_KEY
EMBEDDING_PROVIDER_API_KEY
MUSIC_VECTOR_SUPABASE_URL
MUSIC_VECTOR_SUPABASE_SECRET_KEY
```

비밀은 Git, 앱 config, APK, 로그, outbox, dead letter에 넣지 않는다.

## 10.3 용량 가드

`pg_database_size(current_database())`를 claim RPC가 직접 확인한다.

| 전체 크기 | 동작 |
|---:|---|
| 450MB | MusicBrainz/Last.fm/벡터 수집 스케줄러 전체 off |
| 500MB | 표시용 hard limit |

앱의 Chat/문의/사용자 목록 등 일반 CRUD는 프로젝트 용량 게이트와 무관하다.
개별 music RPC write-stop으로 INSERT를 막지 않는다.

프로젝트 2도 450MB 수집 중지선·500MB hard limit을 표시하며 `pg_total_relation_size`로 전체 public 테이블을 측정한다.

## 10.4 보존

| 데이터 | 보존 |
|---|---|
| MBID alias·redirect·internal merge | 영구 |
| 현재 MusicBrainz·Last.fm 상태 | 현재 유지 |
| Last.fm 성공 상세 | 30일 |
| 실패 상세 | 90일 |
| delivered outbox/inbox | 30~90일, 마지막 seq는 projection에 영구 |
| dead letter | 해결 후 180일 이상 |
| 성공 sync run | 30일 |
| 원본 gzip JSON | 필요 시 Storage 30~90일 |
| vector tombstone | 영구. 별도 전역 replay low-watermark GC 계약을 도입하기 전 삭제 금지 |

## 10.5 구현 순서

1. 프로젝트 1 권위 엔터티·MBID 테이블.
2. canonical·merge deferred trigger와 RPC.
3. Track·credit·genre·tag·ISRC.
4. sync claim/fence/retry.
5. MusicBrainz resolution·merge worker.
6. Last.fm fetch/profile/current tag.
7. deterministic canonicalizer·hash 테스트.
8. embedding profile/source/state/outbox.
9. 프로젝트 2 profile/inbox/vector/tombstone.
10. apply/status/search RPC와 권한 철회.
11. relay, reconciliation, capacity/retention Cron.
12. 1만 곡 샘플로 용량·HNSW recall·지연 재측정.

## 10.6 필수 테스트

- old MBID가 새 JSON ID를 반환하는 경우와 2단계 redirect.
- redirect·internal merge cycle 방어.
- 같은 canonical이 서로 다른 내부 Recording에 매핑된 race.
- merge 관계 충돌 rollback.
- Last.fm canonical empty 후 alias 성공.
- transient 오류 시 기존 태그 보존.
- all-empty 3회+grace 만료 delete.
- 같은 태그·다른 순서의 결정적 hash.
- MBID만 변경된 경우 embedding API 미호출.
- 프로젝트 2 적용 후 응답 timeout·재전송.
- timeout 후 provider를 다시 호출하지 않고 저장 벡터를 재사용하는지.
- 낮은 seq가 최신 vector/tombstone을 덮지 못함.
- 같은 recording의 seq 할당과 commit 순서가 경합해도 상태 잠금으로 의미 순서가 유지되는지.
- loser delete 후 늦은 upsert 부활 방지.
- Track의 release/album 불일치 복합 FK 거부와 selected attempt/fetch 소유권 거부.
- 유효 태그 0개, 1개, 2개, 3개 경계 상태 전이.
- Last.fm API 6 quarantine, API 8 제한 재시도.
- relabel/stale가 최초 upsert 전에 오면 계약 오류, delete면 tombstone 생성.
- non-Recording canonical 충돌과 entity별 merge.
- hash fixture가 TypeScript·SQL에서 동일한 hex를 생성하는지.
- profile·384차원·zero/NaN 거부.
- HNSW cosine 실행계획과 hydrate 부족 재검색.
- 450MB 수집 스케줄러 off 가드.

## 10.7 금지 사항

- MBID를 내부 PK 또는 프로젝트 공통 영구 키로 사용.
- metadata 유사성만으로 Recording 자동 merge.
- final URL만으로 canonical 판정.
- 서로 다른 MBID의 Last.fm count 합산.
- MusicBrainz 데이터나 제목을 Last.fm 전용 임베딩에 포함.
- outbox 재시도 시 현재 태그로 입력 재구성.
- 프로젝트 간 exactly-once·분산 transaction 가정.
- vector hard delete로 tombstone seq 제거.
- mutable 모델 alias를 같은 profile로 사용.
- APK·public config·로그에 secret 저장.

## 10.8 마이그레이션 완성 기준

- 축약 표의 `/`로 묶은 이름은 각각 독립 컬럼으로 생성한다.
- PK용 내부 UUID는 별도 표기가 없으면 `NOT NULL DEFAULT gen_random_uuid()`.
- `created_at`, `updated_at`, `selected_at`, `fetched_at`, `merged_at`, `observed_at`처럼 행 생성과 동시에 생기는 시각은 `NOT NULL DEFAULT now()`. 완료·오류·폐기 시각은 nullable이다.
- 상태, 이름, version, count, boolean은 해당 표에서 nullable이라고 명시하지 않은 한 `NOT NULL`이며 문서에 적힌 기본값을 사용한다.
- 모든 CHECK·FK·UNIQUE·INDEX·TRIGGER에는 `ck_`, `fk_`, `ux_`, `ix_`, `trg_` 접두사의 결정적 이름을 붙인다.
- 마이그레이션은 테이블 → 기본 FK/index → deferred trigger → RPC → RLS/GRANT 순으로 적용한다.
- 각 테이블과 컬럼에 이 문서의 의미를 `COMMENT ON`으로 기록한다.
- 적용 전후 `pg_get_constraintdef`, `pg_indexes`, `information_schema.columns`를 추출해 이 문서와 자동 비교한다.
- SQL DDL과 이 문서가 다르면 아직 원격에 적용하지 않은 변경은 이 문서를 먼저 교정한다. 이미 원격 적용된 스키마는 실스키마를 확인한 뒤 문서를 즉시 맞춘다.

## 참고

- [MusicBrainz Identifier](https://musicbrainz.org/doc/MusicBrainz_Identifier)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainz Rate Limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [How To Merge Recordings](https://musicbrainz.org/doc/How_To_Merge_Recordings)
- [Last.fm track.getTopTags](https://www.last.fm/api/show/track.getTopTags)
- [Last.fm geo.getTopArtists](https://www.last.fm/api/show/geo.getTopArtists)
- [Last.fm chart.getTopArtists](https://www.last.fm/api/show/chart.getTopArtists)
- [Last.fm tag.getTopArtists](https://www.last.fm/api/show/tag.getTopArtists)
- [Last.fm API Error Codes](https://www.last.fm/api/errorcodes)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Vector Indexes](https://supabase.com/docs/guides/ai/vector-indexes)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
