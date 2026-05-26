# 실시간 차트 — 업스트림 API JSON 원문 덤프
# 사용: 저장소 루트에서
#   $env:NRM_LASTFM_API_KEY = '...'
#   $env:NRM_SPOTIFY_CLIENT_ID = '...'
#   $env:NRM_SPOTIFY_CLIENT_SECRET = '...'
#   $env:NRM_SPOTIFY_CHARTS_BEARER = '...'   # charts.spotify.com Bearer (선택)
#   .\scripts\fetch-chart-api-raw.ps1

$ErrorActionPreference = 'Stop'
$OutDir = Join-Path $PSScriptRoot '..\docs\chart-api-raw' | Resolve-Path -ErrorAction SilentlyContinue
if (-not $OutDir) {
  $OutDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'docs\chart-api-raw')
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Save-Url {
  param([string]$Url, [string]$OutFile, [hashtable]$Headers = @{})
  $h = @{ Accept = 'application/json' }
  foreach ($k in $Headers.Keys) { $h[$k] = $Headers[$k] }
  Write-Host "GET $Url"
  Invoke-WebRequest -Uri $Url -Headers $h -OutFile $OutFile -UseBasicParsing
  $len = (Get-Item $OutFile).Length
  Write-Host "  -> $OutFile ($len bytes)"
}

# ── Apple Music RSS (키 불필요) ──
Save-Url `
  'https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/songs.json' `
  (Join-Path $OutDir 'apple-music-top100-kr.json')
Save-Url `
  'https://rss.marketingtools.apple.com/api/v2/us/music/most-played/100/songs.json' `
  (Join-Path $OutDir 'apple-music-top100-global.json')

# ── Last.fm ──
$lfKey = $env:NRM_LASTFM_API_KEY
if ([string]::IsNullOrWhiteSpace($lfKey)) {
  Write-Warning 'Skip Last.fm: NRM_LASTFM_API_KEY not set'
} else {
  $lfKr = 'https://ws.audioscrobbler.com/2.0/?method=geo.getTopTracks&country=Korea%2C%20Republic%20of&api_key=' +
    [uri]::EscapeDataString($lfKey) + '&format=json&limit=100&page=1'
  Save-Url $lfKr (Join-Path $OutDir 'lastfm-top100-kr.json')

  $lfGl = 'https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=' +
    [uri]::EscapeDataString($lfKey) + '&format=json&limit=100&page=1'
  Save-Url $lfGl (Join-Path $OutDir 'lastfm-top100-global.json')
}

# ── Spotify Charts (charts.spotify.com) ──
$bearer = $env:NRM_SPOTIFY_CHARTS_BEARER
if ([string]::IsNullOrWhiteSpace($bearer)) {
  Write-Warning 'Skip Spotify Charts: NRM_SPOTIFY_CHARTS_BEARER not set'
} else {
  $chartsBase = 'https://charts-spotify-com-service.spotify.com/auth/v0/charts'
  $slugs = @{
    'spotify-charts-top100-kr-daily.json'     = 'regional-kr-daily'
    'spotify-charts-top100-kr-weekly.json'    = 'regional-kr-weekly'
    'spotify-charts-top100-global-daily.json' = 'regional-global-daily'
    'spotify-charts-top100-global-weekly.json'= 'regional-global-weekly'
  }
  foreach ($entry in $slugs.GetEnumerator()) {
    $url = "$chartsBase/$($entry.Value)/latest"
    Save-Url $url (Join-Path $OutDir $entry.Key) @{
      Authorization = "Bearer $bearer"
      Origin        = 'https://charts.spotify.com'
      Referer       = 'https://charts.spotify.com/'
    }
  }
}

# ── Spotify Web API (Premium / official) ──
$cid = $env:NRM_SPOTIFY_CLIENT_ID
$sec = $env:NRM_SPOTIFY_CLIENT_SECRET
if ([string]::IsNullOrWhiteSpace($cid) -or [string]::IsNullOrWhiteSpace($sec)) {
  Write-Warning 'Skip Spotify Web API: NRM_SPOTIFY_CLIENT_ID / NRM_SPOTIFY_CLIENT_SECRET not set'
} else {
  $tokenBody = 'grant_type=client_credentials'
  $tokenResp = Invoke-RestMethod -Method Post `
    -Uri 'https://accounts.spotify.com/api/token' `
    -Headers @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${cid}:${sec}")) } `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body $tokenBody
  $access = $tokenResp.access_token

  $playlists = @{
    'spotify-webapi-playlist-top100-kr-daily-meta.json'      = @{ id = '37i9dQZEVXbJlXK4fQztZ3'; market = 'KR' }
    'spotify-webapi-playlist-top100-kr-daily-tracks-p0.json'= @{ id = '37i9dQZEVXbJlXK4fQztZ3'; market = 'KR'; tracks = $true; offset = 0 }
    'spotify-webapi-playlist-top100-global-daily-meta.json'  = @{ id = '37i9dQZEVXbMDoHDwVN2tF'; market = 'US' }
    'spotify-webapi-playlist-top100-global-daily-tracks-p0.json' = @{ id = '37i9dQZEVXbMDoHDwVN2tF'; market = 'US'; tracks = $true; offset = 0 }
  }
  foreach ($entry in $playlists.GetEnumerator()) {
    $p = $entry.Value
    if ($p.tracks) {
      $fields = 'items(track(id,name,duration_ms,external_urls.spotify,artists(name),album(name,images))),next'
      $url = "https://api.spotify.com/v1/playlists/$($p.id)/tracks?market=$($p.market)&limit=50&offset=$($p.offset)&fields=$([uri]::EscapeDataString($fields))"
    } else {
      $url = "https://api.spotify.com/v1/playlists/$($p.id)?market=$($p.market)&fields=name"
    }
    Save-Url $url (Join-Path $OutDir $entry.Key) @{ Authorization = "Bearer $access" }
  }
  # 100곡 전체 tracks 원문이 필요하면 offset=50 페이지도 추가 호출
  foreach ($pair in @(
    @{ file = 'spotify-webapi-playlist-top100-kr-daily-tracks-p1.json'; id = '37i9dQZEVXbJlXK4fQztZ3'; market = 'KR' }
    @{ file = 'spotify-webapi-playlist-top100-global-daily-tracks-p1.json'; id = '37i9dQZEVXbMDoHDwVN2tF'; market = 'US' }
  )) {
    $fields = 'items(track(id,name,duration_ms,external_urls.spotify,artists(name),album(name,images))),next'
    $url = "https://api.spotify.com/v1/playlists/$($pair.id)/tracks?market=$($pair.market)&limit=50&offset=50&fields=$([uri]::EscapeDataString($fields))"
    Save-Url $url (Join-Path $OutDir $pair.file) @{ Authorization = "Bearer $access" }
  }
}

Write-Host "Done. Output: $OutDir"
