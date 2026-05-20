# 개발 3종 타깃 (웹 · Expo Go · 릴리스 APK)

| 타깃 | 용도 | PC Metro | PC API 8787 | JS 실시간 반영 |
|------|------|----------|-------------|----------------|
| **웹** | PC 브라우저 개발 | O | O | O |
| **Expo Go** | 폰에서 UI·기능 빠른 확인 | O (QR) | O (같은 Wi‑Fi) | O |
| **릴리스 APK/IPA** | 폰에 설치해 단독 사용 | X | X | X (빌드 시점 고정) |

## 일상 개발 (웹 + Expo Go)

1. 바탕화면 **`StartServer.bat`** 실행  
   - Metro는 **`expo-dev-client` 없이** `exp://` QR만 사용합니다.  
   - `NRM Expo Go` 창에 **`exp://(PC IP):8081`** 이 크게 표시됩니다.
2. PC: `http://localhost:8081` (자동 오픈)
3. 폰: **Expo Go** 앱 실행 → 앱 안 **Scan QR code** (휴대폰 기본 카메라·Chrome X)
4. QR 주소는 **`exp://10.x.x.x:8081`** 형태여야 함. **`http://...:8081/_expo/loading`** 은 웹 전용이라 브라우저만 열림.
5. PC·폰 **같은 Wi‑Fi**, 방화벽 `8787`·`8081` 허용 (`scripts\Open-DevFirewall.ps1`). 회사 PC는 `Set-Wifi-Private` 생략 가능 — `docs/DEV-CORPORATE-WIFI-EXPOGO.md`

### 폰에서 `http://...:8081/_expo/loading` (브라우저)만 열릴 때

- **Expo Go 앱 안**의 Scan QR 사용 (휴대폰 카메라·Chrome 주소창 X).
- 연결 URL은 반드시 **`exp://10.x.x.x:8081`** (StartServer 실행 시 콘솔에 표시).
- `http://...:8081` 은 **PC 웹 전용**입니다.

### QR을 스캔했는데 설치된 NullReferMusic APK가 열릴 때

- 폰에 **릴리스/개발 APK**가 `exp+` 링크를 가로챕니다 → 테스트 중 삭제하거나 **Expo Go** 선택.
- `app`에 **`expo-dev-client`를 dependencies에 넣지 마세요** (다시 `http`/`exp+` QR로 바뀜).

### Expo Go에서 "Something went wrong" / reload만 보일 때

| 원인 | 확인 방법 |
|------|-----------|
| **PC IP 불일치** (Hyper-V `172.29.x` vs Wi‑Fi `10.x`) | `StartServer` 배너·API env와 Metro 로그의 `exp://` IP가 **같은지** 확인. 다르면 `scripts\resolve-lan-ip.ps1` 갱신 후 **Metro 창까지** 재시작. |
| **방화벽** | 폰 Chrome에서 `http://<PC_IP>:8787/api/health` 가 JSON이면 Wi‑Fi·8787은 OK. 실패 시 관리자로 `scripts\Open-DevFirewall.ps1`, Wi‑Fi를 **프라이빗** 네트워크로. |
| **Wi‑Fi AP 격리** | health는 되는데 Metro만 실패하면 **폰 핫스팟**에 PC 연결 또는 `NRM_EXPO_TUNNEL=1` 로 Metro. |
| **JS 번들 오류** | 폰 연결 직후 **NRM Expo Go** 창에 빨간 에러가 찍히는지 확인. |

진단 스크립트:

```powershell
cd D:\AIProj\CsTool\NullReferMusic
powershell -ExecutionPolicy Bypass -File .\scripts\Diagnose-ExpoGo-Lan.ps1
```

### 폰 Chrome에서 `http://PC_IP:8787/api/health` 가 안 될 때 (PC에서는 됨)

PC 브라우저·PowerShell에서는 health가 되는데 **폰만** 실패하면, Metro/Expo 설정이 아니라 **Wi‑Fi가 PC↔폰 통신을 막는** 경우가 대부분입니다 (회사망 **AP/클라이언트 격리**, 게스트 Wi‑Fi, 다른 SSID, 폰이 LTE만 사용 등).

**우회 (권장 순서):**

1. **covian Wi-Fi** — 바탕화면 `StartCovianWifi-Dev.bat` (Backend+터널 한 번에). `docs/DEV-COVIAN-WIFI.md`
2. **폰 핫스팟** — PC를 폰 핫스팟에 연결 후 `StartServer.bat`

Wi‑Fi를 **프라이빗**으로 (관리자 PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Set-Wifi-Private.ps1
```

## 릴리스 APK (폰 단독, PC 서버 없음)

```text
scripts\Build-Release-Apk.bat
```

또는:

```powershell
cd app\android
.\gradlew.bat assembleRelease
```

산출물: `app\android\app\build\outputs\apk\release\nullReferenceMusic-v*.apk`

- Metro·PC Spring Boot **불필요**
- Android: 기기 내 yt-dlp·Innertube (네이티브 모듈)
- 검색·다운로드는 **외부 PC 개발 서버에 의존하지 않음**

## 개발용 네이티브 APK (선택, 일상 개발 비권장)

네이티브 모듈(Chaquopy·yt-dlp 등)을 **Expo Go 없이** 디버깅할 때만:

```powershell
cd app
npm run start:dev-client
npx expo run:android
```

이 APK는 QR 스캔 시 Expo Go 대신 **자기 자신**이 열릴 수 있습니다. UI만 보려면 **Expo Go + StartServer.bat** 를 쓰세요.
