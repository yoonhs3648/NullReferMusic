# musicbrainz-sync 운영 설정

이 함수는 MusicBrainz 수집의 단일 HTTP gateway다. 원본 응답 JSON은 저장하지 않고
SHA-256과 필요한 필드만 worker RPC에 전달한다.

## Edge Secrets

아래 값은 Supabase Edge Function Secrets에만 설정한다.

```text
MUSICBRAINZ_USER_AGENT=NullReferMusic/<version> (<운영 연락처 URL 또는 이메일>)
MUSICBRAINZ_CRON_TOKEN=<32바이트 이상 난수>
LASTFM_API_KEY=<Last.fm API Key>
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 런타임 기본 secret을 사용한다.
토큰·API Key·service-role key를 앱, APK, Git, 로그에 넣지 않는다.

매분 Cron은 due된 스케줄에 대해 `lastfm_artist_pool`을 먼저 큐잉한다. worker가 Last.fm
Top 100을 받아 MusicBrainz Artist에 매칭한 뒤 `music_rpc_apply_lastfm_artist_pool`로
배타 아티스트 Pool을 갱신하고 discovery/hydrate를 이어간다.

## Vault

Database Vault에 아래 두 secret을 생성한다. `musicbrainz_cron_token` 값은 Edge Secret의
`MUSICBRAINZ_CRON_TOKEN`과 같아야 한다.

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/musicbrainz-sync',
  'musicbrainz_sync_url',
  'musicbrainz-sync Edge Function URL'
);
select vault.create_secret(
  '<별도로 생성한 토큰>',
  'musicbrainz_cron_token',
  'musicbrainz-sync Cron bearer token'
);
```

값 교체는 `vault.update_secret(secret_id, new_secret)`로 수행한다. SQL 실행 기록에 실제
토큰이 남지 않도록 Dashboard의 Vault secret UI를 우선 사용한다.

`20260904141000_musicbrainz_cron.sql`은 매분 dispatcher와 6시간 retention 호출을
멱등 재생성한다. Vault 값이 없으면 Cron은 외부 요청을 보내지 않는다.

## 검증

```powershell
deno test supabase/functions/musicbrainz-sync/musicbrainz_test.ts
deno check supabase/functions/musicbrainz-sync/index.ts
node supabase/tests/check-musicbrainz-worker.mjs
```
