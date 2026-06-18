# 앱 브랜드(표시명) 커스터마이징

친구에게 맞춤 APK를 줄 때 **앱에 보이는 이름·로고 문구·다운로드 폴더명**을 한곳에서 바꿉니다.

## 단일 설정 파일

`app/nrm-brand.config.json`

```json
{
  "displayName": "NullReference Music",
  "storageFolderName": "NullReferenceMusic"
}
```

| 필드 | 예시 | 반영 위치 |
|------|------|-----------|
| `displayName` | `상용's Music` | 메인 로고, 앱 런처 이름, 종료 확인, 버전/저작권 문구, 백그라운드 알림 |
| `storageFolderName` | `SyongMusic` | `Download/…` 저장 폴더, 디버그 로그 경로, APK 파일명, HTTP User-Agent |

코드에서는 `app/lib/nrmAppBrand.ts`가 위 JSON을 읽습니다. **직접 문자열을 여러 파일에 넣지 않습니다.**

## 로고 색 분할

`displayName`을 공백으로 나눈 뒤 **마지막 단어만** accent(파란색)입니다.

- `NullReference Music` → `NullReference ` + `Music`
- `상용's Music` → `상용's ` + `Music`

단어가 하나뿐이면 전체가 한 색입니다.

## 동기화

```bash
cd app
npm run sync:brand
```

생성·갱신 대상:

- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/java/com/nullrefer/music/NrmBrand.kt` (네이티브 Kotlin)

릴리스 APK 빌드(`npm run android:release`, `NullReferMusic-Build-Release-Apk.bat`) 시 **자동** 실행됩니다.

## 친구용 APK 절차 (에이전트·개발자)

1. `nrm-brand.config.json` 에 `displayName` / `storageFolderName` 반영
2. `cd app && npm run sync:brand`
3. `cd app && npx tsc --noEmit`
4. 버전 올리기 (`package.json`, `app.config.ts`, `build.gradle`) — `nrm-version-sync` 규칙
5. `npm run android:release` 또는 루트 `NullReferMusic-Build-Release-Apk.bat`
6. 산출물: `app/android/app/build/outputs/apk/release/{storageFolderName}-v{version}.apk`

## 재브랜딩 범위 밖

다음은 **이 설정만으로 바뀌지 않습니다** (별도 작업):

- Android 패키지 ID `com.nullrefer.music`
- 앱 아이콘·스플래시 (`assets/images/`)
- Expo `slug` / URL scheme
