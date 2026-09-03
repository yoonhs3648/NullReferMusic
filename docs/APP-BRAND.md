# 앱 브랜드 · 사용자 이름

## 제품명 (고정)

앱 내 상호·런처·로고·약관·종료 확인은 항상 **NullReference Music** 입니다.

사용자 식별은 APK에 넣지 않습니다. 최초 실행에서 Google/Kakao 로그인 후 이용약관에 동의하면 `nrm_user_list`에 행이 생기고, `serial_no`는 UUID입니다.

| 항목 | 값 |
|------|-----|
| 로고·약관·종료 확인 | `NullReference Music` (`versionInfoProductName`) |
| 런처/`strings.xml` `app_name` | bake `displayName` — 제품명 고정 |
| `storageFolderName` | 다운로드·로그 폴더, APK 파일명 접두, User-Agent |

코드: `app/lib/nrmAppBrand.ts` → `getNrmProductDisplayName()`.

## 로그인 · 사용자 이름

`build-release-apk-custom.bat`는 질문 없이 공통 APK만 만듭니다. 관리자/일반 구분은 DB `nrm_user_list.is_admin`입니다.

| 용도 | 설명 |
|------|------|
| 로그인 | 최초 실행 Google 또는 Kakao. 설정: `app/nrm-oauth.config.json` |
| Redirect URI | `nullrefermusic://oauth` (Android 스킴 `nullrefermusic`) |
| `user_name` / `user_email` | 각 플랫폼이 내려주는 이름·이메일 |
| `serial_no` | 등록 RPC가 발급하는 UUID |
| `is_admin` | 기본 `n`. `y`이면 기존 관리자 메뉴·RPC 전부 사용 |
| 문의 등록 | 세션의 `user_name` / `serial_no` |
| 버전 정보 | 로그인 사용자 이름, `is_admin=y`이면 Admin Version |
| **메뉴 > 앱 설정 > 사용자 이름 변경** | 기본값·초기화값 |
| **AI Lab 인사** | 설정 오버라이드 반영 (`~~님 안녕하세요`) |

설정 저장 키: `nrm_user_display_name_v1` (`app/lib/nrmUserDisplayNameSettings.ts`).  
초기화 시 로그인 이름(또는 bake `userName`)으로 돌아갑니다. 로고/약관에는 영향 없음.

관리자 검색 암호(`신월동흰수염` 등)는 제거되었습니다.


## 단일 설정 파일

`app/nrm-brand.config.json`

```json
{
  "displayName": "NullReference Music",
  "storageFolderName": "NullReferenceMusic",
  "versionInfoProductName": "NullReference Music",
  "serialNo": "",
  "userName": "",
  "versionInfoAdminBuild": false
}
```

## 로고 색 분할

제품명을 공백으로 나눈 뒤 **마지막 단어만** accent(파란색)입니다.

- `NullReference Music` → `NullReference ` + `Music`

## 동기화

```bash
cd app
npm run sync:brand
```

생성·갱신 대상:

- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/java/com/nullrefer/music/NrmBrand.kt`

릴리스 APK 빌드 시 **자동** 실행됩니다.

## GitHub Releases APK 자동 업데이트

공개 릴리스 APK는 **코드·기능만** 갱신하는 채널입니다. 로그인 세션(`serial_no` UUID)은 기기 AsyncStorage에 남습니다.

`displayName`(앱 상호)은 제품명(`NullReference Music`)을 유지합니다.

## `build-release-apk-custom.bat`

공통 릴리스 APK만 생성합니다. 시작 시 현재 버전을 보여주고 Y/N으로 빌드 여부를 묻습니다. 관리자/일반 구분 없음. `nrm_user_list` 행은 만들지 않습니다.

빌드 성공 후 GitHub Release에 APK를 올리고 `nrm_apk_version`에 버전을 넣습니다. 설치된 앱은 시작 시 이 값으로 업데이트 여부를 안내합니다.

OAuth 키는 빌드 전 `app/nrm-oauth.config.json` 또는 환경변수 `EXPO_PUBLIC_NRM_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_NRM_KAKAO_REST_API_KEY`에 넣습니다.


## 재브랜딩 범위 밖

- Android 패키지 ID `com.nullrefer.music`
- 앱 아이콘·스플래시 (`assets/images/`)
- Expo `slug` / URL scheme
