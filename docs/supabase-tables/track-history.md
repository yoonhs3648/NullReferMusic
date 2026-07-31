# TrackHistory

다운로드·가사생성(번역지원)·가사삭제·노래삭제·메타데이터수정 이력. **History 탭**이 이 테이블을 조회해 리스트를 그린다.

로컬 `AsyncStorage`(`nrm_activity_history_v1`, `app/lib/nrmActivityHistory.ts`) 활동기록과는 **별개로 병행 기록**한다 — 이 로컬 기록은 삭제/변경하지 않았고, 앱 내부 로직(예: 알림 문구)에는 계속 로컬 기록을 쓴다. `TrackHistory`는 History 탭 렌더링과 서버측 조회(향후 벡터 검색 등)를 위한 것이다.

## 컬럼

| 컬럼 | 타입 | 기본값 | NULL | 설명 |
|------|------|--------|------|------|
| `ID` | `bigint` IDENTITY | — | NO | 이력 고유번호 **(복합 PK)** |
| `SerialNo` | `varchar` | — | NO | 사용자 일련번호 (앱 `getNrmAppSerialNo()` 원문) **(복합 PK)** |
| `Kind` | `varchar` | — | NO | 이벤트 종류 (아래 표) |
| `Platform` | `varchar` | — | YES | 다운로드 플랫폼(`YouTube`/`Melon`/`Spotify`/`AppleMusic`/`LastFm`) 또는 가사생성 모델 ID(`whisper:base`, `align:wav2vec2-ko` 등) |
| `FileName` | `text` | — | YES | 이벤트 시점 로컬 파일명 |
| `AudioUri` | `text` | — | YES | 이벤트 시점 로컬 오디오 URI (기기 로컬 경로 — 재설치/다른 기기에서는 무효) |
| `Title` | `text` | — | YES | 노래 제목 |
| `Artist` | `text` | — | YES | 아티스트 |
| `Album` | `text` | — | YES | 앨범명 |
| `AlbumArtist` | `text` | — | YES | 앨범 아티스트 |
| `Genre` | `text` | — | YES | 장르 |
| `ReleaseDate` | `varchar` | — | YES | 발매일 원문 |
| `TrackNumber` | `varchar` | — | YES | 트랙 번호 |
| `DiscNumber` | `varchar` | — | YES | 디스크 번호 |
| `Composer` | `text` | — | YES | 작곡가 |
| `Bpm` | `varchar` | — | YES | BPM |
| `Copyright` | `text` | — | YES | 저작권 |
| `Website` | `text` | — | YES | 원본 URL(멜론 상품 URL 등) |
| `Producer` | `text` | — | YES | 프로듀서 |
| `Remixer` | `text` | — | YES | 리믹서 |
| `Lyrics` | `text` | — | YES | 가사 **원문(plain, 타임스탬프 제거)**. 향후 벡터화 대상. |
| `LyricsMode` | `varchar` | — | YES | `configured`/`translation`/`melon`/`melon_translation` |
| `AlbumCoverPath` | `text` | — | YES | Storage `album-covers` 버킷 내 오브젝트 경로(공개 URL 아님) |
| `YoutubeVideoId` | `varchar` | — | YES | 다운로드에 사용한 YouTube `videoId` (`watch?v=`). Melon `Website`(songId)와 별개. `down`/`downFail` 등 오디오 추출 경로에서만 채움 |
| `FailReason` | `text` | — | YES | 실패 이벤트의 짧은 원인 문구 |
| `IsSuccess` | `boolean` | `true` | NO | 이벤트 성공 여부 |
| `DownloadDate` | `timestamptz` | `now()` | NO | 이벤트 발생 일시 (다운로드가 아닌 이벤트도 이 컬럼을 씀) |

**Metadata 계열 컬럼(Title~AlbumCoverPath) 은 NULL을 허용한다** — 이벤트 시점에 알 수 있는 만큼만 채운다. 예를 들어 다운로드 실패(`downFail`) 행은 대부분 `Title`/`Artist` 등이 비어 있다.

## Kind 값

| 값 | 의미 |
|----|------|
| `down` | 노래 다운로드 성공 |
| `downFail` | 노래 다운로드 실패 |
| `del` | 노래(트랙) 삭제 |
| `lyrics` | 가사 생성 성공(번역 없음) |
| `lyricsFail` | 가사 생성 실패 |
| `delLyrics` | 가사 제거 |
| `transdLyrics` | 가사 생성/추가 성공(번역지원 포함) |
| `transdLyricsFail` | 번역지원 가사 생성 실패 |
| `delTransdLyrics` | 번역지원만 제거(원문 가사는 유지) |
| `metadataEdit` | 가사 외 메타데이터만 수정 |

DB에는 `CK_TrackHistory_Kind` CHECK 제약으로 위 10개 값만 허용한다. 새 종류가 필요하면 신규 마이그레이션으로 CHECK를 갱신하고 이 표도 함께 갱신한다.

## PK·인덱스

- **PK** `PK_TrackHistory` (`ID`, `SerialNo`)
- `IX_TrackHistory_SerialNo` (`SerialNo`)
- `IX_TrackHistory_DownloadDate` (`DownloadDate` DESC) — History 탭 최신순 조회용
- `IX_TrackHistory_Kind` (`Kind`)
- `IX_TrackHistory_YoutubeVideoId` (`YoutubeVideoId`) — NULL 제외 partial index (다운로드 소스 영상 조회용)

## RLS·쓰기 경로

- `ENABLE ROW LEVEL SECURITY` + `SELECT` 정책만 `anon`/`authenticated`에 허용(`USING (true)`). **쓰기 정책 없음.**
- 쓰기는 `nrm_rpc_track_history_insert(p_serial_no varchar, p_row jsonb)` (SECURITY DEFINER) 하나로 통일.
  - 컬럼이 늘어나도(예: 향후 벡터 컬럼) RPC 시그니처를 바꾸지 않도록 필드를 JSONB로 받는다.
  - `p_row` 키: `kind`(필수), `platform`, `fileName`, `audioUri`, `title`, `artist`, `album`, `albumArtist`, `genre`, `releaseDate`, `trackNumber`, `discNumber`, `composer`, `bpm`, `copyright`, `website`, `producer`, `remixer`, `lyrics`, `lyricsMode`, `albumCoverPath`, `youtubeVideoId`, `failReason`, `isSuccess`(기본 `true`), `downloadDate`(기본 `now()`).
  - `GRANT EXECUTE ... TO anon, authenticated` — 앱이 publishable key로 직접 호출.
- 앱 클라이언트: `app/lib/nrmTrackHistoryRemote.ts`의 `logTrackHistory()`가 이 RPC를 감싼다. 모든 호출은 **fire-and-forget으로 감싸 실패해도 앱 기능(다운로드/편집/삭제)을 막지 않는다** — 실패는 `logNrmRunError`로만 남긴다.

## Storage: `album-covers`

- 다운로드 시점의 원본 `coverUrl`(플랫폼 API가 준 원격 이미지)을 이 버킷에 업로드하고, 그 오브젝트 경로를 `AlbumCoverPath`에 저장한다.
- `public=true`, `file_size_limit=8MB`, `allowed_mime_types`: `image/jpeg`/`image/png`/`image/webp`.
- `storage.objects` RLS: `bucket_id='album-covers'` 조건으로 `SELECT`/`INSERT`/`UPDATE`를 `anon`/`authenticated`에 허용 (`inquiry-attachments`와 동일 패턴).
- **파일명 = "가수이름 - 노래제목"** (예: `aespa - Next Level.jpg`, `buildAlbumCoverBaseName()`). 사용자·다운로드 시점과 무관하게 버킷 루트에 전역으로 공유되는 이름이다(폴더 구분 없음) — 같은 곡을 다른 사용자가, 또는 같은 사용자가 다시 다운로드해도 항상 같은 오브젝트 경로를 가리킨다.
- **중복 업로드 방지 (2026-07-22)**: 업로드 전 `Storage.list('', { search: baseName })`로 그 이름(`.jpg`/`.png`/`.webp`)의 파일이 이미 있는지 확인한다. 있으면 원본 `coverUrl` fetch·업로드를 모두 스킵하고 기존 경로를 그대로 `AlbumCoverPath`에 재사용한다 — 같은 곡이 여러 번(다른 사용자 포함) 다운로드돼도 Storage 용량이 중복 소비되지 않는다.
- 업로드: `app/lib/nrmAlbumCoverUpload.ts`의 `uploadAlbumCoverForTrackHistory(coverUrl, artist, title)` — 기존 파일이 없을 때만 원격 `coverUrl`을 fetch해 `Uint8Array`로 변환 후 `nrmSbStorageUpload()`로 업로드(`upsert:true`). 실패해도 예외를 던지지 않고 `null`을 반환(호출부는 `AlbumCoverPath`를 그냥 비워둠).
- **다운로드(`down`) 이벤트에서만 업로드한다.** 가사생성/삭제/메타편집 이벤트는 같은 곡이라도 커버를 재업로드하지 않고 `AlbumCoverPath`를 비워둔다(스코프 제한 — 필요해지면 오디오 파일에서 커버를 재추출해 업로드하는 방식으로 확장 가능).
- 파일명 생성 시 가수이름/노래제목이 비어 있으면 `unknown`으로 대체하고, 경로 구분자(`/`,`\`)·제어문자만 제거해 나머지는 그대로 보존한다(사람이 읽을 수 있는 이름 유지가 목적).

## 앱 연동 지점 (원격 로깅 호출부)

| 이벤트 | 파일 | 함수 |
|--------|------|------|
| 다운로드 성공/실패 | `app/lib/nrmDownloadFinalize.ts` (`finalizeNativeAudioStage`), `app/lib/nrmDownloadFailureReport.ts` | `logDownloadTrackHistory()` |
| 가사 생성/번역 성공·실패 | `app/lib/nrmDownloadFinalize.ts` (`finalizeNativeLyricsStage`) | `logLyricsTrackHistory()` |
| Storage/History에서 메타·가사 수정 | `app/lib/nrmStorageActivityHistory.ts` (`logStorageMetadataHistory`) | `logLyricsTrackHistory()` / `logMetadataEditTrackHistory()` |
| 트랙 삭제 | `app/lib/nrmStorageActivityHistory.ts` (`logStorageTrackRemoveHistory`) | `logTrackRemoveHistory()` |

`nrmStorageActivityHistory.ts`가 두 UI 화면(`NrmTrackMetadataSettingsHome.tsx`, `NrmHomeHistoryScreen.tsx`)에서 공통으로 쓰이는 중앙 지점이라 이 두 함수 안에서만 원격 로깅을 붙이면 양쪽 화면을 모두 커버한다.

**가사 원문 컬럼(`Lyrics`)** 은 항상 타임스탬프를 제거한 plain 텍스트로 저장한다(`extractPlainLyricsFromLrcText`, `app/lib/nrmMelonLyrics.ts`). LRC 사이드카·내장 가사 어느 쪽이든 이 함수를 거쳐 plain으로 변환한다.

**다운로드 플랫폼(`downloadPlatform`)**: `NrmAudioFileMetadata`에 파이프라인 전용 필드로 추가(`app/lib/nrmDownloadAudioMetadata.ts`) — ffmpeg/파일 태그에는 기록하지 않고(`splitMetadataForDownloadStages`에서 제외), `TrackHistory.Platform`에만 쓴다.

**YouTube videoId (`YoutubeVideoId`)**: 네이티브 다운로드 오케스트레이터·실패 보고가 `scheduleNativeDownloadJob`/`reportNativeDownloadExtractFailure`의 `videoId`를 `logDownloadTrackHistory({ youtubeVideoId })`로 넘긴다. Melon 메타 검색 후 YouTube로 오디오를 받는 AI Lab 경로에서도 동일하다. `local:` 접두 URI는 저장하지 않는다.

## History 탭 조회

- `app/lib/nrmTrackHistoryClient.ts`의 `fetchTrackHistoryForDisplay(displayDays)` — `SerialNo` + `DownloadDate` 범위로 조회, `DownloadDate DESC` 정렬.
- 표시 기간(`0`/`7`/`30`/`90`/`180`일) 설정은 기존 로컬 설정(`app/lib/nrmActivityHistorySettings.ts`)을 그대로 재사용한다 — 이 설정 자체는 DB로 옮기지 않았다.
- `NrmHomeHistoryScreen.tsx`는 이제 로컬 `nrm_activity_history_v1` 대신 이 원격 조회 결과로 리스트를 그린다. 항목 탭(편집 모달 열기)·삭제는 여전히 로컬 파일(`NrmDownloadTrackItem`)을 기준으로 동작하며, `FileName`/`AudioUri`로 로컬 트랙을 재탐색한다(`findDownloadTrackForHistory`).

## 알려진 제약 (스코프)

- 파이프라인 배경 작업(다운로드/가사생성)에서의 원격 로깅은 `void`로 fire-and-forget 처리한다 — History 탭이 그 순간 열려 있어도 원격 insert가 끝나기 전에 새로고침되면 한 박자 늦게 보일 수 있다(다음 새로고침에는 보임).
- 서버(웹 백엔드) 다운로드 경로(`finalizeServerJobParallel`)는 이번 작업 범위에 포함하지 않았다 — 네이티브(APK) 다운로드 경로만 연동했다.
- 향후 `Lyrics` 벡터화를 위한 벡터 컬럼(`pgvector`)은 이번 마이그레이션에 포함하지 않았다(사용자 요청에 따라 참고만 해둔 상태).
