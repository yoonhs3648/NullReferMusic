# Spotify 실시간 차트 — charts.spotify.com Bearer 토큰

앱/백엔드는 **charts.spotify.com** 로그인 후 Network에서 복사한 **Bearer 토큰**만 사용합니다.  
`sp_dc` / `get_access_token` 경로는 사용하지 않습니다.

```bash
export ACCESS_TOKEN='BQD....'   # Authorization: Bearer 값 (Bearer 접두어 제외 가능)
export CHART_SLUG='regional-kr-daily'   # top50-kr
```

## 일간 차트

```bash
curl "https://charts-spotify-com-service.spotify.com/auth/v0/charts/${CHART_SLUG}/latest" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Accept: application/json" \
  -H "Origin: https://charts.spotify.com" \
  -H "Referer: https://charts.spotify.com/"
```

## PC 백엔드 (앱과 동일)

```bash
export API_BASE='http://127.0.0.1:8787'

curl -G "${API_BASE}/api/charts/spotify/playlist" \
  --data-urlencode "chart=top50-kr" \
  --data-urlencode "source=charts" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

`chart` 값: `top50-kr`, `viral50-kr`, `top50-global`, `viral50-global`

## Bearer 토큰 얻기

1. 브라우저에서 [https://charts.spotify.com](https://charts.spotify.com) 로그인
2. F12 → **Network** → `charts-spotify-com-service` 요청 선택
3. **Request Headers** → `Authorization: Bearer BQD...` 복사
4. 앱 **설정 → Charts 세션 → Bearer 토큰**에 붙여넣기

Android 앱은 **WebView 로그인**으로 위 Bearer를 자동 수집할 수 있습니다.

## 참고

- **Client Credentials**(공식 API 토큰): `source=official` 차트용. 실시간 Charts API와 별도입니다.
- `get_access_token` + `sp_dc`는 일부 네트워크에서 Varnish 403으로 막힐 수 있어 앱에서 제거했습니다.
