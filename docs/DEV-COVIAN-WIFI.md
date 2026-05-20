# covian Wi-Fi — loca.lt 가 되는 이유

## 두 가지 “연결”이 다름

| 방식 | 경로 | covian 결과 |
|------|------|-------------|
| **PC IP** `http://10.11.x.x:8787` | 폰 → 같은 Wi-Fi로 PC 직접 | **실패** (AP 격리) |
| **loca.lt** `https://xxx.loca.lt` | 폰 → **인터넷** → PC | **됨** (thick-walls 때 확인) |

loca.lt 가 열렸다 = **covian Wi-Fi로 인터넷은 쓸 수 있고**, PC의 API가 터널로 노출됨.  
**폰 모바일 데이터 요금이 아님** (회사 Wi-Fi 회선으로 나감).

---

## 그럼 Expo Go 실시간은?

| 부분 | covian |
|------|--------|
| **API** (다운로드·검색) | loca.lt 로 **가능** |
| **Metro** (JS 실시간) | `exp://10.x.x.x` **불가**, **ngrok** 는 회사망에서 **막힘** |

그래서 **“완전한 Expo Go 라이브”만** covian만으로는 **지금 불가**에 가깝고,  
**API + PC 웹** 조합은 **가능**합니다.

---

## 실행 (covian, 데이터 0원)

**`StartCovianWifi-Dev.bat`** → **`1`**

1. Backend + API loca.lt + PC Metro  
2. **PC:** `http://localhost:8081`  
3. **폰 Chrome:** `https://xxx.loca.lt/api/health` (IP 입력 후 JSON)  
4. **폰 앱:** 다운로드 서버 URL에 `https://xxx.loca.lt` 저장  

Expo Go QR 실시간이 꼭 필요하면 **`2`** (NGROK_AUTHTOKEN) 또는 **IT에 AP 격리 해제** 요청.

---

## IT 요청 (Expo Go까지 Wi-Fi만으로 하려면)

> PC(10.x.x.x) ↔ 휴대폰 TCP 8081·8787 허용 또는 AP 격리 해제

승인 후: `StartServer.bat` + `exp://PC_IP:8081`
