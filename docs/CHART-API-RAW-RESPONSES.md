# 실시간 차트 — 업스트림 API JSON 원문

NullRefer Music 백엔드가 **외부 API에서 받는 그대로의 JSON**입니다.  
(NRM `/api/charts/*` 응답은 `ChartTrackItem`으로 가공된 형태라 **원문이 아닙니다**.)

## 저장 위치

| 파일 | 업스트림 | 차트 |
|------|----------|------|
| `docs/chart-api-raw/apple-music-top100-kr.json` | Apple Music RSS | Top 100 Korea |
| `docs/chart-api-raw/apple-music-top100-global.json` | Apple Music RSS | Top 100 Global (US storefront) |
| `docs/chart-api-raw/lastfm-top100-kr.json` | Last.fm `geo.getTopTracks` | (스크립트로 생성) |
| `docs/chart-api-raw/lastfm-top100-global.json` | Last.fm `chart.gettoptracks` | (스크립트로 생성) |
| `docs/chart-api-raw/spotify-charts-*.json` | charts-spotify-com-service | 4탭 daily/weekly |
| `docs/chart-api-raw/spotify-webapi-*.json` | api.spotify.com | Premium 플레이리스트 |

Apple Music 2종은 **키 없이** 수집해 두었습니다.  
Last.fm / Spotify는 API 키·Bearer가 필요해 로컬에서 스크립트로 덤프하세요.

## 업스트림 URL (백엔드와 동일)

### Apple Music

```
GET https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/songs.json
GET https://rss.marketingtools.apple.com/api/v2/us/music/most-played/100/songs.json
Accept: application/json
```

### Last.fm

```
GET https://ws.audioscrobbler.com/2.0/?method=geo.getTopTracks&country=Korea%2C%20Republic%20of&api_key={KEY}&format=json&limit=100&page=1
GET https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key={KEY}&format=json&limit=100&page=1
```

### Spotify — charts.spotify.com (`source=charts`)

```
GET https://charts-spotify-com-service.spotify.com/auth/v0/charts/{slug}/latest
Authorization: Bearer {CHARTS_BEARER}
Origin: https://charts.spotify.com
Referer: https://charts.spotify.com/
```

`slug`: `regional-kr-daily`, `regional-kr-weekly`, `regional-global-daily`, `regional-global-weekly`

### Spotify — Web API (`source=official`, Premium)

```
GET https://api.spotify.com/v1/playlists/{playlistId}?market={market}&fields=name
GET https://api.spotify.com/v1/playlists/{playlistId}/tracks?market={market}&limit=50&offset={0|50}&fields=items(track(...)),next
Authorization: Bearer {CLIENT_CREDENTIALS_OR_USER_TOKEN}
```

플레이리스트 ID: KR daily `37i9dQZEVXbJlXK4fQztZ3`, Global daily `37i9dQZEVXbMDoHDwVN2tF`  
(weekly는 charts.com slug만 있고 공식 playlist ID는 비어 있음 — `SpotifyChartKind.java` 참고)

## 원문 일괄 수집

```powershell
$env:NRM_LASTFM_API_KEY = 'your-lastfm-key'
$env:NRM_SPOTIFY_CHARTS_BEARER = 'BQD...'   # charts.spotify.com Network 탭
$env:NRM_SPOTIFY_CLIENT_ID = '...'
$env:NRM_SPOTIFY_CLIENT_SECRET = '...'
.\scripts\fetch-chart-api-raw.ps1
```

## 응답 크기 참고

- Apple Music RSS: 약 65–75KB / 차트 (곡 100곡 + 메타)
- Last.fm: 약 50–120KB / 차트
- Spotify Charts `latest`: 수백 KB 가능 (entries 100+)
- Spotify Web API tracks: 페이지당 최대 50곡 × 2페이지

채팅에 원문 전체를 붙이기엔 용량이 커서, **파일로 열어 확인**하는 것을 권장합니다.
