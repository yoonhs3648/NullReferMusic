# 개발 환경 설치 요약 (Windows)

이 문서는 이 PC에 설치된 도구와, 프로젝트에 이미 포함된 바이너리 위치를 정리한다. (`docs/SOURCE-MANAGEMENT.md`의 IntelliJ·RN 안내와 함께 본다.)

## 시스템에 설치됨 (winget 등)

| 도구 | 용도 | 비고 |
|------|------|------|
| **Eclipse Temurin JDK 21** | Spring Boot 3.x, Android 빌드 | `java -version` → 21.x. 기존 JDK 8과 병행 가능하나, **새 터미널**에서 PATH가 갱신된 뒤 확인할 것. |
| **Node.js** (`OpenJS.NodeJS.LTS`) | npm, React, React Native CLI | 설치 직후에는 터미널을 다시 열어야 `node` / `npm`이 잡힐 수 있음. |
| **Android Studio** | Android SDK, 에뮬레이터, Logcat | 최초 실행 시 **SDK 구성 요소**·**가상 기기(AVD)** 설정 필요. |

## 프로젝트 `library` 폴더 (이미 있음 / 갱신함)

| 파일·폴더 | 설명 |
|------------|------|
| `library\yt-dlp.exe` | GitHub [latest `yt-dlp.exe`](https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe)로 덮어씀. |
| `library\ffmpeg-7.1.1-essentials_build\bin\ffmpeg.exe` | 음원 변환용 (또는 동일 폴더의 `ffmpeg.exe` 복사본). |
| `library\ffmpeg.exe` | 있으면 PATH 없이 호출 가능. |

앱에서 사용할 **권장 경로**는 스펙대로 `C:\NullReferMusic\library` 기준으로 통일한다.

## Maven (선택)

winget에 공식 **Apache Maven** 패키지가 없을 수 있다. Spring 프로젝트는 다음 중 하나로 충분하다.

- IntelliJ에서 **번들 Maven** 사용, 또는
- 프로젝트 생성 시 포함되는 **Maven Wrapper** (`mvnw.cmd`)만 사용.

전역 설치가 필요하면 [Apache Maven](https://maven.apache.org/download.cgi)에서 직접 받아 `MAVEN_HOME`·PATH를 설정한다.

## 설치 확인 명령 (새 PowerShell)

```powershell
java -version
node -v
npm -v
& "C:\NullReferMusic\library\yt-dlp.exe" --version
& "C:\NullReferMusic\library\ffmpeg-7.1.1-essentials_build\bin\ffmpeg.exe" -version
```

## Android Studio 설치 후 할 일

1. Android Studio 실행 → **More Actions** → **SDK Manager**에서 **Android SDK Platform**·**Platform-Tools** 설치.
2. **Device Manager**에서 AVD(가상 폰) 생성.
3. 환경 변수 `ANDROID_HOME`(또는 `ANDROID_SDK_ROOT`)이 자동 설정되지 않았다면 SDK 경로를 지정하고, `platform-tools`를 PATH에 추가.
4. React Native 프로젝트가 생기면: `npm install` 후 `npx react-native run-android`.

## Windows 원클릭 실행 (`C:\NullReferMusic\*.bat`)

| 파일 | 설명 |
|------|------|
| `Setup-Dependencies.bat` | 최초 1회 또는 의존성 변경 후 — `backend`(Maven 패키지)·`app`(`npm install`) |
| **`Start-Dev-Full.bat`** | **웹+모바일 한 번에**: 백엔드(8787) + `expo start --lan`(8081), 바탕화면 **`NullReferMusic-Dev.lnk`** 자동 생성 |
| **`Stop-Backend.bat`** | **8787 포트 점유 종료** — 이전 Spring Boot 창을 닫지 않고 다시 켤 때 `Address already in use` 나면 실행 |
| `Start-Server.bat` | 로컬 다운로드 API만 (8787) |
| `Start-Expo-Dev.bat` | Expo Metro (사진 1과 같음 — `w` 웹, `a` Android) |
| `Start-Web.bat` | 웹만 바로 (`expo start --web`) |
| `Start-Android-Dev.bat` | Android 연결/에뮬로 Expo (`expo start --android`) |
| `Start-Server-and-Expo.bat` | 서버 + Metro **두 창** 한 번에 |
| `Start-Android-Wifi-Lab.bat` | **실기 Android + 동일 Wi‑Fi**: 백엔드(8787) + `expo start --lan`(8081) **두 창** (절차: `docs/DEV-ANDROID-WIFI.md`) |
| `Start-Server-and-Web.bat` | 서버 + 웹 **두 창** 한 번에 |

각 창을 **닫으면** 해당 프로세스는 종료됩니다. 앱은 평소 `app`에서 `npm start` 등으로 실행하고, 다운로드 API는 `backend`에서 `mvnw.cmd spring-boot:run`(또는 `Start-Server.bat`)만 돌리면 됩니다.

배치 파일 안 문구는 **영문(ASCII)만** 사용합니다. 한글·UTF-8만 넣은 `.bat`은 기본 CMD 코드페이지에서 깨져 **명령으로 오인**될 수 있습니다.

---

## Expo 앱(`app/`) + 로컬 API(`backend/`)

웹·안드로이드가 **같은 UI(Expo Router)** 와 **같은 백엔드 개발 스택(Spring Boot)** 을 바라본다. **다운로드는 PC에서 돌아가는 Spring Boot**가 `library`의 yt-dlp·ffmpeg를 실행한다. (브라우저·폰 단독으로는 yt-dlp를 직접 돌리지 않음.)

1. **백엔드** (새 터미널):

   ```powershell
   cd C:\NullReferMusic\backend
   .\mvnw.cmd spring-boot:run
   ```

   또는 IntelliJ에서 `backend/pom.xml`을 Maven 프로젝트로 열고 `NullReferMusicApplication` 실행.

   기본 포트 `8787`, **모든 LAN 인터페이스에 바인딩**(`0.0.0.0`)하므로 같은 Wi‑Fi의 폰에서도 접속 가능하다. 시작 시 로그에 `http://192.168.x.x:8787` 형태로 가능한 주소가 출력된다. (로컬만 열고 싶으면 `NRM_BIND_HOST=127.0.0.1`)

   환경 변수: `NRM_SERVER_PORT`, `NRM_OUTPUT_DIR`, `NRM_YT_DLP`, `NRM_FFMPEG_DIR`, `NRM_BIND_HOST`, `NRM_REPO_ROOT`(저장소 루트를 수동 지정할 때).

   **Windows 방화벽**: 폰이 붙지 않으면 인바운드 규칙으로 TCP `8787`을 허용한다. (관리자 PowerShell 예: `New-NetFirewallRule -DisplayName "NullReferMusic LAN" -Direction Inbound -LocalPort 8787 -Protocol TCP -Action Allow`)

2. **앱** (또 다른 터미널):

   ```powershell
   cd C:\NullReferMusic\app
   npm install
   npm run web
   ```

   또는 에뮬레이터/실기: `npm run android` (USB 시 개발 빌드 필요 시 `npx expo run-android`).

3. **실제 안드로이드 폰 + PC 서버 (같은 망, AWS 없음)**  
   - **권장**: PC와 폰을 **같은 Wi‑Fi**에 두고, 서버 콘솔에 나온 **`http://(PC의 LAN IP):8787`** 을 앱 상단의「다운로드 서버」에 입력 후 **저장 → 연결 테스트**.  
   - **USB만 쓸 때**: PC에서 `adb reverse tcp:8787 tcp:8787` 후 앱에서 `http://127.0.0.1:8787` (또는 기본값) 사용.  
   - 여전히 **PC에서 `backend`가 실행 중**이어야 한다. 파일은 PC의 `downloads` 폴더에 저장된다.

   (폰 **단독**으로 yt-dlp/ffmpeg를 돌리는 기능은 네이티브 바이너리·권한 설계가 따로 필요하다.)

4. **릴리스 APK (로컬 빌드 개요)**  
   저장소에 `app/android/` 가 포함되어 있다. 빌드: `cd C:\NullReferMusic\app\android` 후 `.\gradlew.bat assembleDebug` 또는 `assembleRelease`. (`expo prebuild --clean` 을 쓰면 Gradle·Chaquopy·Kotlin 수정이 덮어쓰일 수 있으므로 주의.)

### Android 온디바이스 다운로드 (yt-dlp + FFmpeg)

- **구성**: [Chaquopy](https://chaquo.com/chaquopy/) 로 Python 3.10 + `yt-dlp` 를 APK에 포함하고, **첫 실행 시** [BtbN FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) 에서 기기 ABI에 맞는 `ffmpeg` 바이너리를 앱 전용 저장소로 내려받아 `ffmpeg_location` 으로 연결한다.
- **빌드 PC 요구**: **JDK 17 이상**(Gradle/Android 플러그인), Chaquopy pip 단계용 **Python 3.10** 이 PATH(또는 `py -3.10`)에 있어야 한다. 없으면 `app/android/app/build.gradle` 의 `chaquopy { defaultConfig { buildPython(...) } }` 로 경로를 지정한다.
- **라이선스**: Chaquopy는 오픈소스 앱에 무료, 상업 배포 시 Chaquopy 라이선스 정책을 확인한다.
- **앱 동작**: Android에서 기본은「이 기기에서」모드. Expo Go에는 커스텀 네이티브가 없으므로 **`npx expo run:android`** 또는 릴리스 APK로 설치해야 한다.
- **저장 경로**: 대략 `Android/data/com.nullrefer.music/files/Music/NullReferMusic/` (기기·OS에 따라 표시 방식이 다름).

## Git 및 GitHub (`yoonhs3648`)

**저장소가 GitHub에 안 보일 때:** 이 PC에 GitHub 로그인·푸시가 한 번도 안 된 상태일 수 있다. 단계별 안내는 **`docs/GITHUB-FIRST-PUSH.md`** 를 본다. 웹에서 빈 저장소만 만든 뒤 **`Push-After-Web-Create.bat`** 로 푸시할 수 있다.

로컬 저장소는 `C:\NullReferMusic` 에서 **`main`** 브랜치로 초기화되어 있다. GitHub에 비어 있는 저장소 **`NullReferMusic`** 을 만들고 한 번에 올리려면:

1. **GitHub CLI 로그인** (PC당 최초 1회):

   ```powershell
   gh auth login
   ```

2. **저장소 생성 + 원격 연결 + 푸시** (저장소가 아직 없을 때):

   ```powershell
   cd C:\NullReferMusic
   gh repo create NullReferMusic --public --source=. --remote=origin --push
   ```

   원격 주소는 `https://github.com/yoonhs3648/NullReferMusic` 이 된다.

이미 웹에서 빈 저장소만 만들었다면:

```powershell
cd C:\NullReferMusic
git remote add origin https://github.com/yoonhs3648/NullReferMusic.git
git push -u origin main
```

원클릭으로 시도할 때는 저장소 루트의 `Push-Github.bat` 을 실행한다 (위 1번 로그인 후).

---

## Node 버전 참고

winget의 “LTS”가 **Node 24** 등으로 올라가 있을 수 있다. React Native 빌드 오류가 나면 [Node 20 LTS](https://nodejs.org/)를 수동 설치하거나 [nvm-windows](https://github.com/coreybutler/nvm-windows)로 20.x를 병행하는 것을 검토한다.

---

| 날짜 | 내용 |
|------|------|
| 2026-04-12 | 최초 작성 (JDK 21, Node, Android Studio, yt-dlp 갱신 반영) |
| 2026-04-12 | Expo 앱·로컬 서버·APK 안내 추가 |
| 2026-04-18 | 로컬 다운로드 API를 `server/`(Node)에서 `backend/`(Spring Boot)로 통일 |
| 2026-04-18 | 로컬 Git 초기화(`main`) 및 GitHub(`yoonhs3648/NullReferMusic`) 연결 안내 추가 |
| 2026-04-18 | 실기 Android·동일 Wi‑Fi 랩: `Start-Android-Wifi-Lab.bat`, `docs/DEV-ANDROID-WIFI.md` |
| 2026-04-18 | GitHub에 저장소가 안 보일 때: `docs/GITHUB-FIRST-PUSH.md`, `Push-After-Web-Create.bat` |
| 2026-04-18 | 8787 포트 충돌 시: `Stop-Backend.bat`, `scripts/Stop-Backend-8787.ps1` |
| 2026-04-12 | LAN 바인딩·앱 서버 주소 저장·방화벽 안내 |
| 2026-04-12 | Windows 원클릭 `*.bat` 안내 추가 |
