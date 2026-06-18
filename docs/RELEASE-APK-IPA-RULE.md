# APK·IPA 릴리스 동등성 규칙 (필수)

최종 **Android APK / iOS IPA**(또는 AAB, TestFlight 등 **스토어·직접 설치용 아티팩트**)는 **Expo Go로 돌리는 개발 클라이언트와 다르다.**  
이 문서는 **릴리스 빌드에도 지금까지 구현한 기능이 동일하게 동작·검증되도록** 사람과 AI가 지켜야 하는 규칙이다.

**AI 어시스턴트는 이 문서를 `docs/BUILD-VERIFY-RULE.md`, `docs/ARCHITECTURE-AND-AI-RULES.md`와 함께 필수로 따른다.**

---

## 1. 왜 별도 규칙인가

| 환경 | 특징 |
|------|------|
| **Expo Go** | 여러 앱이 공유하는 샌드박스. 일부 네이티브 모듈·권한이 제한되거나 경고만 출력한다. |
| **개발 빌드 / APK·IPA** | `app.config`의 `bundleIdentifier`·`package`, 플러그인, 권한 문구가 **실제 앱**에 박힌다. |

**“Expo Go에서 됐다”만으로 릴리스 동작을 보장하지 않는다.**

---

## 2. 네이티브에 가까운 변경 시 필수 체크

다음을 수정·추가했다면 **릴리스 관점**까지 포함해 설계한다.

- `app/app.config.ts`의 **`plugins`**, **iOS / Android 권한·설명**
- **`expo-notifications`**, **`expo-media-library`**, **`expo-file-system`**, **`react-native-webview`** 등 **네이티브 코드가 있는 패키지**
- **`.native.ts` / `.web.ts`** 분기, **로컬 알림·다운로드 저장 경로** (`app/constants/nrmNativeDownload.ts` 등 단일 상수)
- **백엔드 URL·환경 변수** (`EXPO_PUBLIC_*`, `extra.apiBaseUrl`)

### 최소 검증 (코드 변경 후)

| 단계 | 명령·행위 |
|------|-----------|
| 타입 | `cd app && npx tsc --noEmit` |
| 웹 번들 | 네이티브와 겹치는 경우 `cd app && npx expo export --platform web` (또는 프로젝트 표준 스크립트) |
| 릴리스 가능성 | 변경이 위 “네이티브에 가까운” 범위면 **실제 `expo run:android` / `expo run:ios` 또는 EAS Build 한 번**으로 확인할 것을 **문서·PR에 명시** (에이전트가 로컬에서 못 돌리면 그 한계만 짧게 적는다). |

---

## 3. 릴리스 빌드와 기능 동등성 (구현 원칙)

1. **Expo Go 전용 가정 금지**  
   푸시 토큰·일부 미디어 권한 등은 Go에서만 경고·제한될 수 있다. **알림·다운로드·WebView** 등은 **개발 빌드 또는 릴리스 바이너리**로 최종 확인한다.

2. **`expo-notifications`**  
   패키지 **메인 진입점** 전체 import는 자동 푸시 등록 부작용이 있을 수 있으므로, 필요한 API는 **`expo-notifications/build/...` 직접 경로**로만 가져온다 (현재 루트 레이아웃·다운로드 알림 모듈 정책).

3. **`expo-media-library`·저장 경로**  
   사용자에게 보이는 앨범(폴더) 이름은 **`app/constants/nrmNativeDownload.ts`의 `NRM_MEDIA_LIBRARY_ALBUM_SLUG` 단일 출처**로 맞춘다. 문구·앱 로직을 어긋나게 두지 않는다.

4. **`app.config.ts`**  
   새 네이티브 플러그인을 넣으면 **프리빌드/실기기**에서 권한 다이얼로그와 저장·알림이 기대대로인지 확인한다.

5. **식별자 고정**  
   `com.nullrefer.music` 등 **번들 ID·패키지명**은 제품 전반과 맞추고, 임의 변경 시 서버·딥링크·스토어 설정을 함께 검토한다.

---

## 4. 출시 직전 체크리스트 (권장)

- [ ] `production`(또는 스테이징)용 **API 베이스 URL**이 릴리스 바이너리에 반영되는지 (`EXPO_PUBLIC_API_BASE_URL` 등).
- [ ] Android 알림 채널·iOS 알림 권한 문구가 **`app.config` 플러그인**에 반영되어 있는지.
- [ ] MP3 저장·미디어 권한 문구가 **`expo-media-library` 플러그인**과 실제 동작에 맞는지.
- [ ] 유튜브 임베드·다운로드 API가 **HTTPS / 허용 도메인** 환경에서도 동작하는지.

---

## 5. 완료 조건 (에이전트)

- 네이티브·릴리스에 영향 있는 변경을 했다면 **이 문서 2~3절을 만족하는 검증**을 수행하거나, 환경상 불가 시 **불가 사유만** 남긴다.
- **새로운 “Expo Go에서만 되는” 단축 구현**을 릴리스 전제로 두지 않는다.

---

이 문서는 NullReference Music 저장소의 **AI·인간 공통 필수 규칙**으로 둔다. 아키텍처 상위 규칙은 `docs/ARCHITECTURE-AND-AI-RULES.md`를 따른다.

---

## 6. Android APK 로컬 빌드 절차 (AI 에이전트 필수)

사용자가 **"APK 말아줘 / APK 생성 / APK 빌드"** 등을 요청하면 아래 순서를 **자동으로** 수행한다.

### 6-0. APK 요청 시 버전·메뉴 표시 동기화 (필수)

사용자가 **버전 번호와 함께** APK 빌드를 요청하면(예: `v1.3.3으로 apk 말아줘`), **별도로 “메뉴 버전 정보도 바꿔줘”라고 말하지 않아도** 아래를 먼저 맞춘 뒤 빌드한다.

| 동기화 대상 | 파일·필드 |
|-------------|-----------|
| npm / Expo | `app/package.json` → `"version"` |
| Expo config | `app/app.config.ts` → `version` |
| Android | `app/android/app/build.gradle` → `versionName`, `versionCode`(매 릴리스 +1) |
| **메뉴 > 버전 정보** | `app/lib/nrmAppInfo.ts`의 `getNrmAppVersionLabel()`이 **`package.json`의 `version`을 읽음** → 위 세 곳만 맞추면 오버레이에 자동 반영 |

- 사용자가 **명시한 버전 문자열**을 기준으로 한다(접두 `v`는 제거 후 `1.3.3` 형식으로 통일).
- 버전만 말하고 APK 빌드를 생략한 요청이 아니면, **항상 빌드까지** 수행한다.
- Cursor 규칙 요약: `.cursor/rules/nrm-release-apk.mdc`

### 6-1. 사전 체크
```
cd C:\NullReferMusic\app
npx tsc --noEmit        # 타입 오류 없어야 함
```

### 6-1-a. APK 네이티브 바이너리 assets (필수 · Git 형상관리)

릴리스 APK는 **아래 파일이 저장소에 있고 APK에 번들된 상태**여야 한다. `.gitignore`로 전체 `assets/whisper/*`를 빼지 않는다. **모델(`ggml-*.bin`)만** APK assets에서 제외한다.

| 경로 (저장소) | 용도 | 최소 크기 |
|---------------|------|-----------|
| `app/android/app/src/main/assets/whisper/whisper-cli` | 기기 내 LRC(Whisper 전사) | 500 KB |
| `app/android/app/src/main/assets/shine/shineenc` | MP3 요청 시 인코딩 (FFmpeg에 libmp3lame/libshine 없음) | 40 KB |

**준비 명령 (다른 PC에서 clone 후 1회, 결과물은 commit):**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Build-Whisper-AndroidCli.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-AndroidShine.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Verify-AndroidReleaseAssets.ps1
```

**FFmpeg (다운로드·m4a/opus 등):** `ffmpeg` + `libffmpeg.so`는 용량 때문에 Git에 넣지 않는다. 첫 실행 시 [Android-FFmpeg-Prebuilt](https://github.com/hzw1199/Android-FFmpeg-Prebuilt)에서 기기 ABI로 다운로드한다 (`FfmpegBootstrap.kt`). LGPL 빌드라 **MP3 인코더는 APK에 shineenc로 보완**한다.

**Whisper 모델:** APK에 넣지 않는다. 사용자가 메뉴에서 선택한 모델을 기기가 Hugging Face에서 `files/whisper/`로 받는다.

**Gradle:** `assembleRelease` 전에 `verifyReleaseNativeAssets` 태스크가 위 두 파일 존재·크기를 검사한다. 없으면 빌드가 실패한다.

**AI 에이전트:** APK 빌드 요청 시 `Verify-AndroidReleaseAssets.ps1`를 통과시키지 못하면, 사용자에게 묻지 말고 위 스크립트로 바이너리를 생성한 뒤 **Git에 추가 가능한 상태**로 만든 다음 빌드한다.

### 6-1-b. 메인 화면 음악인 명언 데이터 (필수 · Git 형상관리)

릴리스 APK의 **메인 화면 명언**은 Excel 원본에서 생성된 TypeScript를 번들에 포함한다. **APK 빌드 전에 반드시 갱신**한다.

| 경로 (저장소) | 용도 |
|---------------|------|
| `data/nrm-music-quotes.xlsx` | **편집 원본** (Excel). 행 1개 = 명언 1개 |
| `data/nrm-music-quotes.csv` | 백업·diff용 (선택). xlsx 없을 때만 스크립트가 읽음 |
| `app/lib/nrmMusicQuotes.generated.ts` | 앱이 import하는 **생성 결과** (빌드에 포함) |
| `app/scripts/build-music-quotes.mjs` | xlsx/csv → `.generated.ts` 변환 |

**Excel 시트 열 (첫 행 헤더, 순서 고정):** `nameKo`, `nameEn`, `years`, `quoteEn`, `quoteKo`

**릴리스 APK 빌드 시 필수 명령 (자동 연동):**

```powershell
cd app
npm run generate:music-quotes
```

- `npm run android:release` 및 저장소 루트 `NullReferMusic-Build-Release-Apk.bat`는 **`assembleRelease` 직전에 위 명령을 자동 실행**한다 (`package.json`의 `preandroid:release`).
- **xlsx만 수정하고 generate를 건너뛰면 APK에는 이전 명언이 들어간다.** 에이전트는 APK 빌드 요청 시 generate 생략 금지.
- xlsx가 없으면 `data/nrm-music-quotes.csv`를 읽고 xlsx를 생성한다. CSV만 편집한 경우: `npm run generate:music-quotes -- --sync-excel` 후 빌드.

**AI 에이전트:** APK 빌드·`assembleRelease` 실행 전 `generate:music-quotes`가 성공했는지 확인한다. 실패 시 빌드를 진행하지 않고 원인을 수정한다.

### 6-1-c. 앱 브랜드(표시명) 동기화 (친구용 APK)

앱 로고·런처 이름·다운로드 폴더·APK 파일명 접두를 바꿀 때는 **`app/nrm-brand.config.json`만** 수정한다.

| 필드 | 용도 |
|------|------|
| `displayName` | 메인 로고, 앱 이름, 종료 확인, 버전/저작권, 알림 제목 |
| `storageFolderName` | `Download/…` 폴더, 로그 경로, APK 파일명, User-Agent (공백 없음) |

```bash
cd app
npm run sync:brand
```

- Android `strings.xml`, `NrmBrand.kt`, iOS `NrmBrand.generated.swift`, `build.gradle` APK 파일명을 갱신한다.
- `npm run android:release` 및 `NullReferMusic-Build-Release-Apk.bat`는 **빌드 전에 자동 실행**한다.

상세: `docs/APP-BRAND.md`, `.cursor/rules/nrm-app-brand.mdc`

### 6-2. 앱 메타데이터 확인
| 항목 | 기준값 | 위치 |
|------|--------|------|
| 앱 표시명 | `nrm-brand.config.json` → `displayName` | `app.config.ts` → `name`, `strings.xml` → `app_name` (sync 후) |
| 앱 아이콘 | `assets/images/icon.png` 기반 NRM CI 로고 | `mipmap-*/ic_launcher*.webp` |
| Adaptive foreground | 투명 배경 + 흰색 로고 (`밝기→알파` 변환) | `mipmap-*/ic_launcher_foreground.webp` |
| Adaptive 배경색 | `#0c0c12` (검정) | `android/app/src/main/res/values/colors.xml` → `iconBackground` |

**아이콘 재생성이 필요한 경우** (icon.png 변경 등):
```
cd C:\NullReferMusic\app
node scripts/make-icons.mjs
```

### 6-3. 빌드 실행

`NullReferMusic-Build-Release-Apk.bat` 또는 아래 순서를 따른다. **`generate:music-quotes`는 bat·`npm run android:release`에서 자동 실행**된다 (§6-1-b).

```
cd C:\NullReferMusic\app
npx tsc --noEmit
npm run android:release
```

또는 저장소 루트에서 `NullReferMusic-Build-Release-Apk.bat` (tsc·명언·Gradle 일괄).

로컬 SDK 경로는 `app/android/local.properties` → `sdk.dir=C:/Users/yunhs/AppData/Local/Android/Sdk`

### 6-3-a. Windows 경로 길이 제한 (필수 · AI 에이전트)

**증상:** `gradlew assembleRelease` 중 CMake/ninja가 `Filename longer than 260 characters` 로 실패한다.

**원인:** 저장소 경로(`D:\AIProj\CsTool\NullReferMusic\...`)가 길고, React Native 새 아키텍처 CMake가 Gradle 캐시·prefab 헤더까지 합쳐 Windows **MAX_PATH(260자)** 를 넘긴다.

**금지 (에이전트·로컬 공통):**

```
cd app\android
.\gradlew.bat assembleRelease
```

위처럼 **긴 실제 경로에서 Gradle을 직접 실행하지 않는다.** 실패 시 subst·짧은 캐시 경로를 수동으로 맞추며 재시도하지 말고, 아래 **필수** 진입점만 쓴다.

**필수 (택1):**

| 방법 | 설명 |
|------|------|
| `NullReferMusic-Build-Release-Apk.bat` | 저장소 루트, 대화형 완료 메시지 |
| `cd app && npm run android:release` | `preandroid:release`로 명언 generate 포함 |
| `powershell -File scripts/Invoke-NrmAndroidReleaseBuild.ps1` | Gradle 단계만 (tsc·명언은 별도) |

**내부 동작 (빌드 스크립트 전용, 앱 런타임 무관):**

1. `GRADLE_USER_HOME=C:\g` — Gradle 캐시를 짧은 경로에 둠
2. `subst Z:` 등 가용 드라이브 문자로 저장소 루트를 매핑 — CMake/ninja 작업 경로 단축
3. `Z:\app\android` 에서 `gradlew.bat assembleRelease --no-daemon` 실행 후 subst 해제

구현: `scripts/Invoke-NrmAndroidReleaseBuild.ps1`, `app/scripts/assemble-android-release.mjs` (`package.json`의 `android:release`).

**에이전트:** APK 요청 시 **반드시** §6-3-a 필수 진입점만 사용한다. `gradlew` 직접 호출·subst 수동 재시도 금지.

### 6-4. 산출물 위치 및 파일명 규칙

APK 파일명은 **`{storageFolderName}-v{버전}.apk`** 형식을 사용한다 (`nrm-brand.config.json`의 `storageFolderName`, `npm run sync:brand`로 `build.gradle` 반영).

```
app\android\app\build\outputs\apk\release\NullReferenceMusic-v1.8.22.apk
```

파일명은 `android/app/build.gradle`의 `applicationVariants` 블록에서 자동으로 설정된다 (`sync-nrm-brand.mjs`가 갱신):
```groovy
applicationVariants.all { variant ->
    variant.outputs.all { output ->
        outputFileName = "NullReferenceMusic-v${variant.versionName}.apk"
    }
}
```

**버전 업데이트 시 함께 변경해야 할 위치:**
| 파일 | 항목 |
|------|------|
| `app/app.config.ts` | `version` |
| `app/package.json` | `version` |
| `android/app/build.gradle` | `versionCode` (정수, 매 릴리스마다 +1), `versionName` |
| `app/release-notes/history.json` | 새 항목 추가 |
| `app/release-notes/versions/{버전}.md` | 릴리즈 노트 파일 |

### 6-5. APK 안정성 자동 검증 규칙 (AI 에이전트 필수)

APK 빌드 완료 후 **앱이 실행 즉시 꺼지거나(crash), 핵심 기능이 작동 안 하는 등 기본 에러**가 보고되면:

1. **에러 원인을 즉시 코드 분석으로 찾는다.**
2. 수정 후 `npx tsc --noEmit` 재확인 → **빌드 재실행** → APK 재생성.
3. 이 과정을 **에러가 완전히 해결될 때까지 반복한다.** 사용자에게 "못하겠다"고 포기하지 않는다.
4. 대표적인 검증 항목:
   - `newArchEnabled` 설정과 네이티브 라이브러리 호환성 (`NativeModules.*`이 undefined가 되는 문제)
   - JS bundle 로드 시 uncaught exception (모듈 최상단 코드의 throw)
   - AndroidManifest merge conflict
   - Kotlin 컴파일 오류

### 6-6. 주의사항
- ffmpeg는 런타임에 Termux APT 저장소에서 자동 다운로드된다. 404 발생 시 `FfmpegBootstrap.kt`의 URL/버전을 확인한다.  
- ffmpeg 다운로드 실패 시 앱은 **ffmpeg 없이 yt-dlp만으로 오디오 추출**을 시도한다 (opus/m4a 원본 포맷).  
- yt-dlp 바이너리는 GitHub releases에서 ABI별로 자동 다운로드된다 (`YtDlpBootstrap.kt`).  
- Expo Go 환경에서는 on-device yt-dlp가 비활성화되고 백엔드 서버를 통해 다운로드한다.

---

## 7. APK 자립 동작 원칙 (필수)

### 7-1. 핵심 규칙

> **설치된 APK(IPA)는 이 PC의 Spring 백엔드 서버(`localhost:8787`)와 절대 통신하지 않는다.**  
> **APK는 모바일 기기 자체에서 모든 기능을 처리한다.**  
> 이 규칙은 다른 PC에서 APK를 빌드하는 경우에도 동일하게 적용된다.

### 7-2. 개발 방식 — "기능 개발 시 동시 구현" (필수)

> **APK를 말 때마다 리팩토링하지 않는다.**  
> **새 기능을 개발하는 시점에 Expo Go/웹(백엔드 프록시)용과 Standalone APK(직접 외부 API)용을 동시에 구현한다.**

#### 구체적 흐름

1. **웹 / Expo Go 개발** → 백엔드를 통해 외부 API를 호출하는 방식으로 먼저 동작 확인.
2. **동시에 Standalone 분기 추가** → `isStandaloneApp()` 블록 안에서 외부 API를 기기에서 직접 호출하는 코드를 함께 작성.
3. **APK 빌드 시 추가 리팩토링 불필요** → 이미 두 경로가 모두 구현된 상태이므로 그냥 빌드하면 된다.

```typescript
// ✅ 올바른 패턴 — 기능 개발 시 동시에 작성
export async function fetchSomeData(params: Params): Promise<Result> {
  if (isStandaloneApp()) {
    // APK: 외부 API 직접 호출 (백엔드 없이 동작)
    return fetchSomeDataDirect(params);
  }
  // Expo Go / 웹: 백엔드 프록시 경유
  return fetchSomeDataViaBackend(params);
}

// ❌ 잘못된 패턴 — Standalone 분기 없이 백엔드만 구현
// → APK 빌드 시 localhost:8787 접속 시도 → "인터넷 연결 없음" 오류
```

### 7-3. Standalone 모드 감지

`app/lib/nrmDevRuntime.ts`의 `isStandaloneApp()` 함수가 `true`를 반환하면 릴리스 APK/IPA다.

```typescript
// isStandaloneApp() === true → 릴리스 APK/IPA: 모든 기능을 외부 API 직접 호출
// isStandaloneApp() === false → Expo Go / 웹: PC 백엔드(8787) 사용 가능
```

### 7-4. 기능별 처리 방식 (현재 구현 상태)

| 기능 | Standalone APK | Expo Go / 웹 |
|------|----------------|-------------|
| YouTube 검색 | 기기 내 Innertube | PC 백엔드 `/api/youtube/search` |
| YouTube 다운로드 | Android: yt-dlp / iOS IPA: innertube | PC 백엔드 `/api/download` |
| Spotify Charts | `charts-spotify-com-service.spotify.com` 직접 호출 | PC 백엔드 프록시 |
| Spotify OAuth 토큰 | `accounts.spotify.com/api/token` 직접 호출 | PC 백엔드 프록시 |
| Apple Music Charts | `rss.marketingtools.apple.com` 직접 호출 | PC 백엔드 프록시 |
| Last.fm Charts | `ws.audioscrobbler.com/2.0/` 직접 호출 | PC 백엔드 프록시 |
| Last.fm 검색 | `ws.audioscrobbler.com/2.0/` 직접 호출 | PC 백엔드 프록시 |
| Last.fm API Key 검증 | Last.fm API 직접 검증 | PC 백엔드 프록시 |

> iOS IPA 제약·parity 상세: [`docs/IOS-IPA-PARITY.md`](./IOS-IPA-PARITY.md)  
> 새 기능 추가 시 반드시 이 표에도 행을 추가한다.

### 7-5. 구현 시 준수 사항

1. **새 기능을 백엔드 API에 의존해 구현할 때**, 같은 커밋/PR 안에서 `isStandaloneApp()` 분기와 직접 외부 API 호출 코드를 함께 작성한다. 나중으로 미루지 않는다.
2. **APK 빌드 요청이 들어왔을 때 Standalone 분기가 없는 기능이 발견되면**, 빌드 전에 먼저 해당 기능에 직접 API 호출을 구현한 뒤 빌드한다.
3. **"인터넷 연결 없음" 오류가 APK에서만 발생**한다면 `localhost:8787` 호출을 시도하는 것이다. 즉시 직접 API 호출로 전환한다.
4. **에러 메시지에 "PC 서버(8787)"나 "백엔드" 언급을 포함하지 않는다** (standalone 모드에서는 의미 없는 안내이다).
