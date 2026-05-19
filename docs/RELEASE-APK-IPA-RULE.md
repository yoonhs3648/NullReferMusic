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

이 문서는 NullRefer Music 저장소의 **AI·인간 공통 필수 규칙**으로 둔다. 아키텍처 상위 규칙은 `docs/ARCHITECTURE-AND-AI-RULES.md`를 따른다.

---

## 6. Android APK 로컬 빌드 절차 (AI 에이전트 필수)

사용자가 **"APK 말아줘 / APK 생성 / APK 빌드"** 등을 요청하면 아래 순서를 **자동으로** 수행한다.

### 6-1. 사전 체크
```
cd C:\NullReferMusic\app
npx tsc --noEmit        # 타입 오류 없어야 함
```

### 6-2. 앱 메타데이터 확인
| 항목 | 기준값 | 위치 |
|------|--------|------|
| 앱 이름 | `NullReferenceMusic` | `app/app.config.ts` → `name`, `android/app/src/main/res/values/strings.xml` → `app_name` |
| 앱 아이콘 | `assets/images/icon.png` 기반 NRM CI 로고 | `mipmap-*/ic_launcher*.webp` |
| Adaptive foreground | 투명 배경 + 흰색 로고 (`밝기→알파` 변환) | `mipmap-*/ic_launcher_foreground.webp` |
| Adaptive 배경색 | `#0c0c12` (검정) | `android/app/src/main/res/values/colors.xml` → `iconBackground` |

**아이콘 재생성이 필요한 경우** (icon.png 변경 등):
```
cd C:\NullReferMusic\app
node scripts/make-icons.mjs
```

### 6-3. 빌드 실행
```
cd C:\NullReferMusic\app\android
.\gradlew.bat assembleRelease --no-daemon
```

로컬 SDK 경로는 `app/android/local.properties` → `sdk.dir=C:/Users/yunhs/AppData/Local/Android/Sdk`

### 6-4. 산출물 위치 및 파일명 규칙

APK 파일명은 **`nullReferenceMusic-v{버전}.apk`** 형식을 사용한다.

```
app\android\app\build\outputs\apk\release\nullReferenceMusic-v1.2.1.apk
```

파일명은 `android/app/build.gradle`의 `applicationVariants` 블록에서 자동으로 설정된다:
```groovy
applicationVariants.all { variant ->
    variant.outputs.all { output ->
        outputFileName = "nullReferenceMusic-v${variant.versionName}.apk"
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
