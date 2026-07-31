# 앱 브랜드 · 사용자 이름

## 제품명 (고정)

앱 내 상호·런처·로고·약관·종료 확인은 항상 **NullReference Music** 입니다.

커스텀 빌드에서 받는 `appName`은 **브랜딩에 쓰지 않습니다.**  
`user_list.app_name` 등 라이선스/기록용 **legacy** 필드로만 남깁니다.

| 항목 | 값 |
|------|-----|
| 로고·약관·종료 확인 | `NullReference Music` (`versionInfoProductName`) |
| 런처/`strings.xml` `app_name` | bake `displayName` — 커스텀 빌드에서도 제품명으로 고정 |
| `storageFolderName` | 다운로드·로그 폴더, APK 파일명 접두, User-Agent (커스텀 빌드가 바꾸지 않음) |

코드: `app/lib/nrmAppBrand.ts` → `getNrmProductDisplayName()`.

## 사용자 이름 (`userName`)

커스텀 빌드 `userName` / bake `NrmBrand.USER_NAME`:

| 용도 | 설명 |
|------|------|
| 문의 등록 | `p_user_name` |
| 버전 정보 | `Custom : {userName}` (admin APK 제외) |
| `user_list` | 라이선스 식별 |
| **메뉴 > 앱 설정 > 사용자 이름 변경** | 기본값·초기화값 |
| **AI Lab 인사** | 설정 오버라이드 반영 (`~~님 안녕하세요`) |

설정 저장 키: `nrm_user_display_name_v1` (`app/lib/nrmUserDisplayNameSettings.ts`).  
초기화 시 항상 bake `userName`으로 돌아갑니다. 로고/약관에는 영향 없음.

## 단일 설정 파일

`app/nrm-brand.config.json`

```json
{
  "displayName": "NullReference Music",
  "storageFolderName": "NullReferenceMusic",
  "versionInfoProductName": "NullReference Music",
  "serialNo": "admin",
  "userName": "관리자",
  "versionInfoAdminBuild": true
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

## GitHub Releases APK 자동 업데이트 (identity 유지)

공개 릴리스 APK(`do-custom=N`)는 **코드·기능만** 갱신하는 채널입니다.

1. **최초 실행** 시 APK 내장 브랜드(SerialNo, userName, admin 여부 등)를 기기 `SharedPreferences`에 저장합니다.
2. **이후 업데이트** 시 저장된 identity를 그대로 사용합니다.
3. **예외 복구**: `user_list`의 `device_id` 바인딩으로 SerialNo·userName을 복구합니다.  
   `displayName`(앱 상호)은 **appName으로 덮지 않고** 제품명(`NullReference Music`)을 유지합니다.

구현: `NrmBrandIdentityStore.kt`, `app/lib/nrmBrandIdentity.ts`

## 친구용 APK (`build-release-apk-custom.bat` Y)

1. `appName` — `user_list` legacy 기록만 (APK 상호에 미반영)
2. `userName` — bake + 문의/Custom 줄 + 사용자 이름 설정 기본값
3. `SerialNo` — 라이선스
4. APK `displayName` bake는 항상 `NullReference Music`

## 재브랜딩 범위 밖

- Android 패키지 ID `com.nullrefer.music`
- 앱 아이콘·스플래시 (`assets/images/`)
- Expo `slug` / URL scheme
