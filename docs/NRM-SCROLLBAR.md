# NRM 스크롤바 정책 (웹 / 모바일)

NullRefer Music UI는 Apple-gallery 스펙(`nullferenceMusicDesign` / `nrmTokens`)을 따릅니다. 스크롤 **동작**은 플랫폼별로 다르고, **스크롤바 표시**는 웹만 허용합니다.

## 원칙

| 플랫폼 | 스크롤 | 스크롤바 표시 |
|--------|--------|----------------|
| **iOS / Android** | 터치·드래그 | **없음** (`showsVerticalScrollIndicator={false}`) |
| **웹** | 휠·트랙패드·드래그 | **있음** — 얇고 절제된 커스텀 스타일 |

모바일에서는 OS 기본 스크롤 막대가 보이면 디자인이 무거워지므로 숨깁니다. 웹에서는 긴 메뉴(설정·차트·API 토큰 관리 등)에서 스크롤 가능 여부를 알 수 있어야 하므로, **얇은 오버레이형** 스크롤바만 사용합니다.

## 구현 위치

| 파일 | 역할 |
|------|------|
| `app/components/nrm/NrmMenuDrawerScroll.tsx` | 메뉴 드로어용 `ScrollView` 래퍼. 네이티브 인디케이터 off, 웹에 `className="nrm-scroll-web"` |
| `app/app/+html.tsx` | 웹 전역 CSS — `.nrm-scroll-web` 스크롤바 색·두께·라운드 |
| `app/components/nrm/NrmAppMenu.tsx` | `DrawerShell`이 `NrmMenuDrawerScroll` 사용 |

메인 화면(`app/index.tsx`)의 `ScrollView`는 별도 정책이 필요하면 동일 클래스를 붙일 수 있습니다. **메뉴 드로어**가 우선 적용 대상입니다.

## 웹 스크롤바 스타일 (요약)

- 너비 **6px**, 트랙 **투명**
- 썸: 다크 모드 `rgba(255,255,255,0.22)` 전후, 라이트 모드 `rgba(0,0,0,0.18)` 전후
- 썸 모서리 **pill** (`border-radius: 999px`)
- `scrollbar-width: thin` (Firefox)
- 호버 시 썸만 약간 진하게 (과하지 않게)

장식용 그라데이션·두꺼운 Windows 기본 막대는 사용하지 않습니다.

## 새 스크롤 영역 추가 시

1. 메뉴/설정류 패널 → `NrmMenuDrawerScroll` 사용
2. 웹 전용 긴 목록 → `Platform.OS === 'web'`일 때만 `className="nrm-scroll-web"` + `showsVerticalScrollIndicator={false}`
3. 네이티브에서 스크롤바를 켜지 않음

## 관련 규칙

- `.cursor/rules/nrm-ui-design.mdc` — UI 토큰·형태
- `app/constants/nrmTokens.ts` — 색·간격
