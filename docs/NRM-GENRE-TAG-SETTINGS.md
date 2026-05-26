# 장르 태그 설정 (Last.fm)

장르별 차트는 Last.fm **태그(tag)** 기준으로 조회한다. 앱 설정 → **API 설정** → **장르 태그 설정**에서 장르 종류와 태그를 관리한다.

## 저장

- **AsyncStorage** 키: `nrmGenreTagCatalog_v1`
- 웹·Expo Go·APK 동일 저장소 API (`@react-native-async-storage/async-storage`)
- 최초 실행·데이터 없음·손상 시 `getDefaultNrmGenreTagCatalog()` 15종 적용

## 검증 (저장 버튼)

- 장르가 1개 이상
- 모든 장르 **이름** 비어 있지 않음
- 모든 장르에 **태그 1개 이상** (전부 삭제한 장르는 저장 불가)
- 신규 장르도 동일 규칙

## 코드

| 역할 | 경로 |
|------|------|
| 기본값·load/save | `app/lib/nrmGenreTagSettings.ts` |
| 설정 UI | `app/components/nrm/settings/NrmGenreTagSettingsPanel.tsx` |

장르별 차트 API 연동 시 `loadNrmGenreTagCatalog()` 로 카탈로그를 읽는다.
