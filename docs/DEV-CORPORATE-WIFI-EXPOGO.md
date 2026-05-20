# 회사 Wi-Fi + Expo Go 실시간 개발 (전체 가이드)

PC·폰 모두 **같은 회사 Wi-Fi**에 두고 Expo Go로 개발하는 절차입니다.

---

## 0) 회사 PC에서 자주 보는 것

| 메시지 | 의미 | 조치 |
|--------|------|------|
| `Open-DevFirewall.ps1` 성공 | 8787·8081 인바운드 허용 (Private·**Domain**·Public) | **1단계 완료** |
| `Set-Wifi-Private` / GPO 오류 | 도메인 PC는 Wi-Fi를 Private로 **바꿀 수 없음** | **무시해도 됨** (방화벽에 Domain 포함됨) |
| `NetworkCategory: DomainAuthenticated` | 회사 Wi-Fi 정상 프로필 | 그대로 진행 |

**1단계가 막힌 게 아닙니다.** 방화벽만 성공하면 Wi-Fi Private 변경은 **필수 아님**.

---

## 1단계 — PC 방화벽 (관리자 PowerShell, 한 번)

```powershell
cd D:\AIProj\CsTool\NullReferMusic
powershell -ExecutionPolicy Bypass -File .\scripts\Open-DevFirewall.ps1
```

성공 예:

```text
Firewall: inbound TCP 8787 and 8081 allowed (Private, Domain, Public).
```

### Set-Wifi-Private (선택, 실패해도 OK)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Set-Wifi-Private.ps1
```

회사 PC에서는 GPO 때문에 실패할 수 있음 → **다음 단계로 진행**.

---

## 2단계 — PC IP 확인

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Diagnose-ExpoGo-Lan.ps1
```

예: `Recommended PC IP: 10.11.39.76` → 이 IP를 아래에서 사용.

---

## 3단계 — 폰에서 LAN 가능 여부 테스트

1. 폰 **회사 Wi-Fi** 연결 (게스트 SSID X, LTE만 X)
2. PC **VPN 끔**
3. 폰 **Chrome** 주소창:

```text
http://10.11.39.76:8787/api/health
```

(IP는 2단계에서 확인한 값)

| 결과 | 다음 |
|------|------|
| `{"ok":true,...}` JSON 보임 | **4-A LAN 개발** |
| 사이트에 연결할 수 없음 | **4-B 터널** 또는 **4-C 핫스팟** |

---

## 4-A) LAN 개발 (폰 health 성공 시)

```text
StartServer.bat
```

- PC 브라우저: `http://localhost:8081` (자동)
- **Expo Go 앱 안** → Scan QR → `exp://10.11.39.76:8081` 형태
- `http://...:8081` 을 폰 Chrome으로 열지 말 것 (웹 전용)

---

## 4-B) 터널 개발 (회사 AP 격리 — health 실패 시, Wi-Fi 유지)

PC·폰 **회사 Wi-Fi 그대로**:

```text
D:\AIProj\CsTool\NullReferMusic\scripts\Start-CorpWifi-Dev.bat
```

1. LAN 테스트 질문 → **`n`** 입력 (또는 처음부터 터널):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-CorpWifi-Dev.ps1 -Mode tunnel
```

2. 창이 뜸: Backend, API tunnel(`https://....loca.lt`), Metro tunnel
3. 폰 Chrome: `https://....loca.lt/api/health` → JSON 확인
4. **Expo Go** → Metro 창 **터널 QR** 스캔 (PC IP `exp://` 아님)

첫 로딩은 느릴 수 있음. `localtunnel` 이 회사망에서 막히면 **4-C**.

---

## 4-C) 폰 핫스팟 (가장 확실)

1. 폰 **핫스팟** ON
2. **PC만** 핫스팟 Wi-Fi에 연결 (폰은 회사 Wi-Fi+LTE 또는 핫스팟 호스트)
3. `Diagnose-ExpoGo-Lan.ps1` 로 **새 PC IP** 확인
4. `StartServer.bat` → Expo Go `exp://(새 IP):8081`

---

## 요약 표

| 단계 | 명령 | 필수 |
|------|------|------|
| 1 | `Open-DevFirewall.ps1` (관리자) | 예 |
| 1b | `Set-Wifi-Private.ps1` | 아니오 (회사 PC는 생략 가능) |
| 2 | `Diagnose-ExpoGo-Lan.ps1` | 예 |
| 3 | 폰 Chrome `http://PC_IP:8787/api/health` | 예 |
| 4-A | `StartServer.bat` | health OK 시 |
| 4-B | `Start-CorpWifi-Dev.bat` | health 실패 시 |
| 4-C | 핫스팟 + `StartServer.bat` | B도 안 될 때 |

---

## IT 문의용 (선택)

> 동일 Wi-Fi에서 개발용 PC(10.x.x.x)와 휴대폰 간 TCP **8787, 8081** 통신이 필요합니다.  
> 클라이언트 격리(AP isolation) 해제 또는 개발 VLAN 허용을 요청합니다.

---

## 관련 문서

- `docs/DEV-THREE-TARGETS.md` — 웹 / Expo Go / 릴리스 APK
- `docs/DEV-ANDROID-WIFI.md` — Wi-Fi 상세
