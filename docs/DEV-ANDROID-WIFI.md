# 안드로이드 실기기 + PC + 동일 Wi‑Fi 개발 가이드

PC에서 **Spring 백엔드(8787)** 와 **Expo Metro(8081)** 를 띄운 뒤, **같은 무선랜**에 연결된 **안드로이드 폰**으로 화면·다운로드 API를 바로 테스트하는 절차입니다.

## 전제

| 항목 | 설명 |
|------|------|
| PC | Windows, 이 저장소 경로 예: `C:\NullReferMusic` |
| 폰 | 안드로이드, PC와 **동일 SSID** Wi‑Fi (가능하면 **게스트 Wi‑Fi 금지**) |
| 앱 실행 | **Expo Go**로 빠르게 JS/UI만 바꿔가며 테스트 권장. 네이티브 모듈을 바꾸면 `npx expo run:android` 로 개발 빌드 필요. |
| 다운로드 | **PC 서버 모드**일 때만 백엔드가 `yt-dlp`/`ffmpeg` 실행. 폰은 `http://PC_IP:8787` 으로 API만 호출합니다. |

## 포트 한눈에 보기

| 서비스 | 포트 | 용도 |
|--------|------|------|
| Spring Boot | **8787** | `/api/health`, `/api/download` |
| Expo Metro | **8081** | JS 번들 (Expo Go / 개발 빌드가 접속) |

PC 방화벽이 막으면 폰에서 둘 다 실패합니다. 아래 **방화벽** 절차를 한 번 적용하세요.

---

## 1) 의존성 한 번 준비

저장소 루트에서:

- **의존성**: `cd backend` → `mvnw.cmd -q -DskipTests package`, `cd app` → `npm install`  
  또는 수동으로 `backend` Maven 패키지 + `app` 에서 `npm install`.

필요 시:

- **JDK 21**, **Node.js** 설치 (`docs/SETUP-ENV.md` 참고).
- **`library\yt-dlp.exe`**, **`ffmpeg`** 경로는 백엔드 기본값과 맞춰 두었습니다.

---

## 2) 방화벽 (폰이 붙지 않을 때 필수)

관리자 PowerShell에서 **한 번**:

```powershell
cd C:\NullReferMusic
powershell -ExecutionPolicy Bypass -File .\scripts\Open-DevFirewall.ps1
```

수동으로 하려면 (관리자 PowerShell 예):

```powershell
New-NetFirewallRule -DisplayName "NullReferMusic API 8787" -Direction Inbound -LocalPort 8787 -Protocol TCP -Action Allow -Profile Private,Domain
New-NetFirewallRule -DisplayName "NullReferMusic Metro 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow -Profile Private,Domain
```

Windows에서 해당 Wi‑Fi가 **공용 네트워크**로 잡혀 있으면 규칙이 안 먹을 수 있습니다. **설정 → 네트워크**에서 해당 Wi‑Fi를 **프라이빗**으로 바꾸거나, 방화벽 규칙에 **Public** 프로필을 포함해 추가하세요.

---

## 3) PC의 LAN IP 확인

PowerShell:

```powershell
cd C:\NullReferMusic
.\scripts\Show-LanIp.ps1
```

또는 `ipconfig` 로 무선 LAN 어댑터의 **IPv4 주소**를 확인합니다. 이후 앱에 넣을 주소는:

```text
http://<위_IP>:8787
```

예: PC가 `192.168.0.42` 이면 **`http://192.168.0.42:8787`** .

---

## 4) 백엔드 + Expo를 LAN 모드로 한 번에 루트

원클릭 (웹 브라우저 자동 오픈):

- 저장소 루트에서 **`StartServer.bat`** (백엔드 + `expo start --lan --web`, 약 12초 후 `http://127.0.0.1:8081/`).

동작:

1. LAN IP로 `EXPO_PUBLIC_API_BASE_URL` 설정 (`scripts\resolve-lan-ip.ps1`)
2. 새 창: **`backend`** → `mvnw.cmd spring-boot:run` (**8787**)
3. 새 창: **`app`** → **`npx expo start --lan --web`** → Metro **8081**, QR은 **같은 Wi‑Fi**용

창 **두 개를 닫지 말고** 유지합니다.

수동으로 동일하게 하려면 터미널 두 개:

```powershell
cd C:\NullReferMusic\backend
.\mvnw.cmd spring-boot:run
```

```powershell
cd C:\NullReferMusic\app
npm run start:lan
```

`package.json` 의 **`start:lan`** 은 `expo start --lan` 과 같습니다. 폰과 PC가 같은 LAN일 때 QR/주소가 맞게 잡히도록 합니다.

---

## 5) 폰에서 Expo Go로 프론트 붙이기

1. Play 스토어에서 **Expo Go** 설치.
2. PC의 **Expo Metro 창**에 나온 **QR 코드**를 Expo Go로 스캔.
3. 같은 Wi‑Fi가 아니면 번들을 못 받습니다. VPN·데이터 절약 앱은 끕니다.

JS/TS만 수정할 때는 저장 후 Metro가 리로드되므로 **앱에서 바로 반영**됩니다.

---

## 6) 앱에서 백엔드(다운로드 서버) 주소 넣기

1. 화면에서 **PC 서버** 모드(또는 웹/서버 사용)를 켠 상태로, **다운로드 서버** 입력란에  
   **`http://<PC_LAN_IP>:8787`** 입력 (끝에 `/` 없어도 됨).
2. **저장** 후 **연결 테스트**.
3. 성공 메시지에 yt-dlp·ffmpeg 인식 여부가 나오면 OK.

연결 실패 시:

- PC에서 브라우저로 `http://127.0.0.1:8787/api/health` 가 되는지 확인.
- 폰 브라우저에서 `http://<PC_IP>:8787/api/health` 접속 테스트 (같은 Wi‑Fi).
- 방화벽·프라이빗 네트워크 설정 재확인.

---

## 7) 빠른 검증 순서 (체크리스트)

1. PC 백엔드 로그에 `listening 0.0.0.0:8787` 근처 메시지.
2. 폰 브라우저 → `http://<PC_IP>:8787/api/health` → JSON ok.
3. Expo Go로 앱 오픈 후 UI 표시.
4. 앱에서 서버 주소 저장 → 연결 테스트 통과 → 샘플 URL로 다운로드 시도.

---

## 8) 자주 걸리는 것

| 증상 | 조치 |
|------|------|
| Expo QR 스캔 후 로딩만 됨 | 같은 Wi‑Fi인지, Metro 창에 에러 없는지, 8081 방화벽 |
| API 연결 실패 | 8787 방화벽, IP 오타, PC 절전·슬립 해제 |
| 게스트 Wi‑Fi | AP isolation 때문에 기기 간 통신 차단되는 경우 많음 → 일반 SSID 사용 |
| `adb` 를 쓰고 싶음 | Android Studio SDK의 `platform-tools` 또는 winget `Google.PlatformTools` (설치 오류 시 Studio SDK 경로의 `adb.exe` 사용) |

USB로만 디버깅할 때는 별도로 `adb reverse tcp:8081 tcp:8081` 등이 필요할 수 있습니다. 이 문서는 **동일 Wi‑Fi** 기준입니다.

---

## 9) 네이티브 코드까지 바꿀 때

Expo Go로는 포함되지 않은 네이티브 변경이 있으면:

```powershell
cd C:\NullReferMusic\app
npx expo run:android
```

USB로 기기 연결 또는 에뮬레이터. Wi‑Fi만으로도 가능한 경우가 많지만, 최초 빌드·Gradle은 시간이 걸립니다.

---

| 날짜 | 내용 |
|------|------|
| 2026-04-18 | 동일 Wi‑Fi + 실제 안드로이드 + 백엔드/Metro 원클릭 절차 정리 |
