# nullReferMusic — 소스 관리 및 개발 가이드라인

이 문서는 저장소 운영, UI 일관성, 백엔드 규칙, 로깅, 그리고 **웹(IntelliJ)** / **모바일(React Native)** 실행·테스트 방법을 정리한다. `docs/PRODUCT.md`와 함께 개발 시 준수한다. PC에 설치한 JDK·Node·Android Studio·`library` 바이너리 목록은 `docs/SETUP-ENV.md`를 본다.

---

## 1. 형상 관리(Git)

- **브랜치**: `main`(또는 `master`)은 배포 가능 상태를 유지한다. 기능은 `feature/기능명`, 수정은 `fix/이슈요약` 등으로 분리한다.
- **커밋 메시지**: 무엇을 왜 바꿨는지 한 줄로 요약하고, 필요하면 본문에 맥락을 적는다. (예: `feat: yt-dlp 실행 API 추가`, `fix: 출력 경로 인코딩 처리`)
- **리뷰 가능한 단위**: 한 PR/커밋에 UI·백엔드·리팩터가 섞이지 않게 쪼갠다.
- **바이너리**: `yt-dlp.exe`, `ffmpeg` 등 용량이 크면 Git LFS 또는 문서로 “로컬 배치 경로”만 명시하는 방식을 검토한다. (팀 정책에 맞춤)

---

## 2. UI — CSS·HTML 클래스 통일

목표는 **한눈에 읽히는 네이밍**과 **컴포넌트 단위 유지보수**다.

### 2.1 권장: BEM 스타일 접두사

프로젝트 전역 접두사 `nrm-`(nullReferMusic)를 붙여 서드파티·브라우저 기본 스타일과 충돌을 줄인다.

- **블록**: 기능/영역 단위 — `nrm-downloader`, `nrm-header`
- **요소**: 블록 내부 — `nrm-downloader__input`, `nrm-downloader__button`
- **수정자**: 상태·변형 — `nrm-downloader__button--primary`, `nrm-downloader--disabled`

예시:

```html
<section class="nrm-downloader">
  <label class="nrm-downloader__label" for="url">YouTube URL</label>
  <input id="url" class="nrm-downloader__input" type="url" />
  <button type="submit" class="nrm-downloader__button nrm-downloader__button--primary">
    추출
  </button>
</section>
```

### 2.2 CSS 파일 구조

- **토큰 우선**: 색·간격·폰트·라운드는 `:root` 또는 `nrm-tokens.css` 한 곳에 변수로 정의한다. (`--nrm-color-bg`, `--nrm-space-md` 등)
- **레이어**: `base`(리셋/타이포) → `components`(블록별) → `pages`(페이지만의 조합). 가능하면 페이지 전용 임의 클래스 남발을 피한다.
- **중복 금지**: 동일한 버튼 스타일은 `.nrm-btn` 또는 `.nrm-downloader__button` 한 경로만 유지한다.

### 2.3 프론트가 React인 경우

- **className**도 위 BEM 규칙을 그대로 쓴다.
- 스타일은 **CSS Modules** 또는 **전역 BEM + 한 컴포넌트당 한 CSS 파일** 중 팀이 택한 하나로 통일한다.

---

## 3. 백엔드 코드 스타일 — 카멜케이스 우선

- **Java**: 필드·지역변수·메서드명은 `camelCase`. 클래스·인터페이스는 `PascalCase`. 상수는 `UPPER_SNAKE_CASE`.
- **패키지**: 소문자 단어 구분. (`com.example.nullrefer.music` 등)
- **REST 경로**: 팀 합의에 따라 `kebab-case` URL(`/api/download-jobs`)과 Java 메서드 `camelCase`를 분리해 사용해도 된다. **자바 식별자**는 카멜케이스를 우선한다.
- **JSON**: API가 있다면 프로퍼티명도 `camelCase`로 맞추는 것이 프론트와 통일되어 유지보수에 유리하다. (Jackson 등 설정으로 일관 유지)

---

## 4. 로깅

- **단위 기능별로 구분**: 패키지/로거 이름을 기능 단위로 나눈다. (예: `com.nullrefer.music.download`, `com.nullrefer.music.ffmpeg`)
- **SLF4J + 구현체(Logback 등)**: `private static final Logger log = LoggerFactory.getLogger(현재클래스.class);`
- **메시지 규칙**:
  - 짧은 **영문 prefix** 또는 **한글 고정 태그** 중 하나로 통일. (예: `[DOWNLOAD] url=…`, `status=started`)
  - **개인정보·전체 URL**은 마스킹하거나 길이 제한.
- **레벨**: `ERROR`(복구 불가), `WARN`(우회 가능), `INFO`(작업 단위), `DEBUG`(개발 시 상세). 운영 기본은 `INFO` 권장.
- **상관 ID**(선택): 동일 요청의 yt-dlp·ffmpeg 로그를 잇고 싶다면 요청마다 UUID를 발급해 로그에 붙인다.

---

## 5. 웹 — IntelliJ Community에서 구동

IntelliJ **Community**는 Spring Boot 지원이 **Ultimate에 비해 제한**될 수 있다. 다음을 권장한다.

1. **프로젝트 열기**: `File` → `Open` → Spring Boot 루트(`pom.xml` 또는 `build.gradle.kts` 있는 폴더).
2. **JDK**: 프로젝트가 요구하는 JDK(예: 17, 21)를 `File` → `Project Structure`에서 지정.
3. **실행**:
   - **Gradle**: 우측 Gradle 탭에서 `bootRun` 실행, 또는 터미널에서 `./gradlew bootRun`(Windows는 `gradlew.bat bootRun`).
   - **Maven**: `mvn spring-boot:run` 또는 Maven 도구 창에서 해당 goal 실행.
4. **메인 클래스**: `Application` 클래스 옆 실행 버튼이 보이면 **Run**으로 기동.
5. **프론트 분리 시**: React는 `npm install` 후 `npm run dev` 등으로 별도 터미널에서 띄우고, API URL만 백엔드 주소(`http://localhost:포트`)에 맞춘다.

Community에서 Spring 전용 뷰가 부족하면 **실행은 Gradle/Maven CLI + 브라우저**로 충분히 개발 가능하다.

---

## 6. 모바일(React Native) — 처음 실행·테스트하는 방법

모바일은 **Mac이 없으면 iOS 실기기 시뮬레이터는 불가**하고, **Android는 Windows에서 가능**하다. 아래는 Android 중심 가이드다.

### 6.1 사전 준비(Windows + Android)

1. **Node.js LTS** 설치.
2. **Android Studio** 설치 → **SDK Manager**에서 Android SDK, **Android SDK Platform-Tools** 설치.
3. **환경 변수**: `ANDROID_HOME`을 SDK 경로로 설정하고, `platform-tools`를 `PATH`에 추가. (adb 사용)
4. 프로젝트가 **React Native CLI** 기준이면 JDK 17 등 문서 요구 버전을 맞춘다.

### 6.2 에뮬레이터로 테스트

1. Android Studio → **Device Manager** → 가상 기기(AVD) 생성.
2. AVD를 켠 뒤, 프로젝트 루트에서:

   ```bash
   npm install
   npx react-native run-android
   ```

3. 빌드가 끝나면 에뮬레이터에 앱이 설치·실행된다.

### 6.3 실제 폰(Expo Go / Wi‑Fi)으로 테스트

1. PC에서 `StartServer.bat` 실행.
2. 폰에 **Expo Go** 설치, PC와 같은 Wi‑Fi(또는 폰 핫스팟)에서 QR(`exp://`) 스캔.
3. 네이티브 개발 빌드가 필요하면 `npx expo run:android` (Android Studio·SDK 필요).

### 6.4 무엇을 “테스트”하면 좋은지(초보용 체크리스트)

- 앱 기동, URL 입력 화면 표시.
- (네이티브 모듈 연동 후) 샘플 URL로 **다운로드/저장 경로**까지 한 번씩 수동 확인.
- 로그: Android Studio **Logcat**에서 앱 패키지명으로 필터.

### 6.5 Expo를 쓰는 경우(참고)

이 저장소의 UI는 **`app/`의 Expo(Expo Router)** 로 웹·안드로이드를 공유한다. **Android**는 기본 **온디바이스**(Chaquopy + yt-dlp + 런타임 FFmpeg 다운로드) 또는 **PC `backend/`**(Spring Boot) 모드를 선택한다. **웹**도 동일하게 **PC `backend/`** 로컬 API만 사용한다.

### 6.6 iOS를 나중에 할 때(Mac 필요)

- Xcode 설치 → 시뮬레이터 선택 → `npx react-native run-ios`.
- 실기기는 Apple 개발자 계정·서명 설정이 필요하다.

---

## 7. 문서와 코드의 동기화

- 아키텍처나 실행 방법이 바뀌면 **이 파일**과 `docs/PRODUCT.md`를 함께 갱신한다.
- 새 UI 블록을 추가할 때 **BEM 블록 이름**을 이 문서의 예시와 같은 패턴으로 추가했다는 식으로 PR 설명에 적어두면 리뷰가 쉽다.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-12 | 최초 작성 |
