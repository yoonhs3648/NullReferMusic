# 폰 핫스팟 + Expo Go (집이랑 같게)

## 핵심

핫스팟 쓸 때는 **`StartCovianWifi-Dev.bat` 쓰지 말 것.**  
**`StartServer.bat` 만** 사용.

---

## 순서 (집이랑 동일)

1. PC에서 **회사 covian Wi-Fi 끊기** (중요 — 안 끊으면 QR이 `10.11.x.x` 로 나옴)
2. 폰 **핫스팟** ON
3. PC Wi-Fi → **폰 핫스팟만** 연결
4. 모든 **NRM Backend / NRM Expo Go** 창 닫기
5. 바탕화면 **`StartServer.bat`**
6. 콘솔 **Selected for Expo: 192.168.x.x** 인지 확인 (`10.11.x.x` 이면 실패)
7. 폰 Chrome: `http://192.168.x.x:8787/api/health` → JSON
8. Expo Go 앱 → QR 스캔 (`exp://192.168.x.x:8081`)

---

## 여전히 안 되면

```bat
set NRM_METRO_CLEAR=1
StartServer.bat
```

Expo Go: 이전 프로젝트 삭제 후 QR 다시 스캔.

폰에 예전 **loca.lt** 서버 주소 저장돼 있으면 앱에서 지우거나 재설치.

---

## 왜 핫스팟인데 안 됐나 (흔한 원인)

| 원인 | 해결 |
|------|------|
| PC가 covian + 핫스팟 **동시** 연결 | PC에서 covian **끊기** |
| `StartCovianWifi-Dev` / ngrok 실행 | **`StartServer.bat`만** |
| QR이 `10.11.x.x` | `Show-Active-LanIps` 확인, covian 끊기 |
| Expo Go 예전 터널 URL 캐시 | 프로젝트 삭제, `NRM_METRO_CLEAR=1` |
