# 실시간 차트 — API 실패 화면 UX 규칙

앱 **설정 → API 토큰 관리** 화면은 개발·설정 목적이므로 기술 문구를 유지한다.  
**실시간 차트 본문**에서 API 요청이 실패했을 때만 아래 규칙을 따른다.

## 레이아웃 (필수)

1. **상단 — 항상 표시**
   - 작은 컴팩트 로고 + 홈(뒤로) 동작
   - 플랫폼 제목 (예: Spotify · 공식 API)
   - **차트 탭 메뉴** (한국 Top 50, 한국 Viral 50, 글로벌 Top 50, 글로벌 Viral 50 등)  
     → API 실패·로딩 중에도 **절대 숨기지 않는다**.

2. **탭 아래 — 본문**
   - 로딩 중: 탭 아래 `ActivityIndicator`
   - 성공: 플레이리스트 힌트 + 곡 목록
   - 실패: `NrmChartErrorHero` (탭·헤더는 그대로, 본문만 교체)

3. **탭 클릭**
   - 선택 탭 변경 → 해당 차트로 **동일 API 재요청**
   - 실패 시 위 에러 영역만 갱신 (탭 UI 유지)

## 에러 영역 (`NrmChartErrorHero`)

- **NullReference Music 워드마크 문구 사용 금지** — CI 마크(앱 아이콘)만 표시 (`NrmLogo` `markOnly`)
- 마크: 약 **80px**, `disabled` 스타일(흐림·비활성, opacity ~0.42)
- 마크 **아래**에 사용자용 원인 문구 1~2문장 (가운데 정렬, 최대 너비 ~320px)
- 개발 용어(Bearer, Network 탭, Client Credentials 등) **금지**

구현: `NrmChartErrorHero`, `app/lib/nrmChartErrors.ts`

## 에러 코드 → 사용자 문구

| 코드 | 의미 (내부) | Spotify 예시 |
|------|-------------|--------------|
| `not_configured` | 토큰/키 미등록 | 설정에서 API 정보 등록 안내 |
| `premium_required` | 403·Premium 제한 | Premium 계정이 아니면 차트를 못 볼 수 있음 |
| `auth_failed` | 401·인증 실패 | 로그인 정보가 맞지 않음 |
| `forbidden` | 403 (일반) | 차트 보기 허용 안 됨 |
| `not_found` | 404 | 차트를 찾지 못함 |
| `empty` | 빈 목록 | 표시할 곡 없음 |
| `network` | 연결 실패 | 백엔드·Wi‑Fi 확인 |
| `server` | 5xx | 잠시 후 재시도 |
| `unknown` | 기타 | 불러오지 못함 |

HTTP 403 on Spotify charts → `premium_required` (백엔드도 `spotify_premium_required` + status 403 반환).

## 클라이언트 흐름

1. `fetch*Chart()` → `{ ok: false, errorCode: ChartErrorCode }`
2. 차트 화면: `FlatList` + `ListHeaderComponent`(헤더·탭) + `ListEmptyComponent`(`NrmChartErrorHero`)
3. **전체 화면을 에러로 교체하는 early return 사용 금지** (탭이 사라지는 버그 방지)
4. 새 플랫폼 추가 시 `nrmChartErrors.ts`에 플랫폼별 메시지 테이블 추가

## 적용 화면

- `NrmAppleMusicChartsHome`
- `NrmSpotifyChartsHome`
- `NrmLastfmChartsHome`

## Spotify Charts vs 공식 API

- **Charts** (`source=charts`): 앱은 `Charts 세션`에 **이메일·비밀번호만** 저장. Bearer는 **백엔드 메모리**에서 로그인·발급·캐시(앱 UI·저장소에 없음). 실패 시 차트 본문에 CI 로고(비활성)+짧은 문구.
- **공식 API** (`source=official`): Developer Client ID·Secret / 공식 액세스 토큰.

## 적용하지 않는 곳

- `NrmSpotifyApiManagePanel` / `NrmLastfmApiManagePanel` — 토큰 발급·저장은 정확한 기술 안내 유지
- Charts 세션 화면 — 계정·WebView 로그인 안내는 설정용 문구 허용
