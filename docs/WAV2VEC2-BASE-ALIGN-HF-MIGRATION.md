# wav2vec2-base Forced Alignment — HF(FinDIT-Studio) 호스팅 복귀 가이드

> **AI 에이전트·다른 PC 작업자용.** 이 문서는 대화/히스토리 없이도 GitHub 우회 경로를 FinDIT-Studio(Hugging Face) 정식 경로로 되돌릴 수 있게 한다.

---

## 1. 배경 (왜 GitHub와 HF가 둘 다 있는가)

| 시점 | 상황 |
|------|------|
| **원래 설계** | `model.onnx`(~380MB)는 **APK에 넣지 않음**. 폰 설정에서 **HTTP로 다운로드** (Whisper 모델과 동일). |
| **FinDIT-Studio** | Hugging Face 조직. 예전에 `wav2vec2-large-xlsr-53-korean-onnx` 등 **다른 ONNX 모델을 올려 두고 앱에서 HF URL로 받던** 계정. |
| **2026-06 (HF 토큰 없는 PC)** | `FinDIT-Studio/wav2vec2-base-korean-onnx`에 `model.onnx`가 없어 401/404. 임시로 **GitHub Release**에 업로드하고 카탈로그 URL을 GitHub로 변경. |
| **HF 토큰 있는 다른 PC** | 아래 절차로 HF에 업로드 후 **카탈로그 URL을 FinDIT-Studio로 되돌리면** 예전 large 모델과 같은 방식으로 앱 내 다운로드. |

**폰 동작은 동일:** 설치 버튼 → 통신으로 `filesDir/wav2vec2-base/`에 저장. APK 크기는 늘지 않음.

---

## 2. FinDIT-Studio / HF 토큰이란

- **Hugging Face (HF)**: 모델 파일 호스팅 사이트. 앱은 `https://huggingface.co/.../resolve/main/파일명` URL로 다운로드.
- **FinDIT-Studio**: 이 프로젝트가 쓰는 HF **조직(org) 이름**. large wav2vec2 ONNX 등이 이미 공개되어 있음.
- **HF 토큰**: PC에서 **1회 업로드**할 때만 필요. `hf_...` 형식. **폰·APK에는 넣지 않음.**
  - 환경 변수: `$env:HF_TOKEN = 'hf_...'`
  - 또는 (Git 커밋 금지): `library/.hf-token.local` 한 줄에 토큰 저장

---

## 3. HF PC에서 할 일 (체크리스트)

### 3-1. ONNX export + HF 업로드

```powershell
cd <NullReferMusic 저장소 루트>

# 토큰 (둘 중 하나)
$env:HF_TOKEN = 'hf_...'   # FinDIT-Studio 쓰기 권한
# 또는 library\.hf-token.local 파일

# export(없으면) + FinDIT-Studio 업로드
powershell -ExecutionPolicy Bypass -File .\scripts\Publish-Wav2Vec2BaseOnnx.ps1

# URL 확인 (200 + Content-Length ~377000000)
powershell -ExecutionPolicy Bypass -File .\scripts\Verify-Wav2Vec2BaseAlignUrl-HF.ps1
```

업로드 대상 저장소: **`FinDIT-Studio/wav2vec2-base-korean-onnx`**  
공개 URL: `https://huggingface.co/FinDIT-Studio/wav2vec2-base-korean-onnx/resolve/main/model.onnx`

`vocab.json` / `config.json` / `preprocessor_config.json`은 계속 **Kkonjeong/wav2vec2-base-korean** HF에서 받음 (변경 없음).

### 3-2. 앱 카탈로그 URL을 FinDIT-Studio로 수정 (필수)

아래 **두 파일**의 `BASE_ONNX` 상수를 GitHub → FinDIT-Studio로 바꾼다. (`model.onnx` URL만; Kkonjeong BASE_KOREAN은 그대로)

**`app/lib/nrmAlignModelCatalog.ts`**

```typescript
const BASE_ONNX =
  'https://huggingface.co/FinDIT-Studio/wav2vec2-base-korean-onnx/resolve/main/';
```

**`app/android/app/src/main/java/com/nullrefer/music/ondevice/AlignModelCatalog.kt`**

```kotlin
private const val BASE_ONNX =
    "https://huggingface.co/FinDIT-Studio/wav2vec2-base-korean-onnx/resolve/main/"
```

### 3-3. 검증 스크립트 기본 URL (선택·권장)

`scripts/Verify-Wav2Vec2BaseAlignUrl.ps1`의 `$url`을 HF 주소로 맞춘다.  
또는 `Verify-Wav2Vec2BaseAlignUrl-HF.ps1` 사용.

### 3-4. 빌드 검증

```powershell
cd app
npx tsc --noEmit
```

HF URL 반영 후 **APK 재빌드**해야 폰에 새 다운로드 주소가 들어간다.

---

## 4. GitHub 우회 경로 (HF 토큰 없을 때만)

| 항목 | 값 |
|------|-----|
| 스크립트 | `scripts/Publish-Wav2Vec2BaseGithub.ps1` |
| 릴리스 태그 | `align-wav2vec2-base-v1` |
| URL | `https://github.com/yoonhs3648/NullReferMusic/releases/download/align-wav2vec2-base-v1/model.onnx` |

HF 업로드·카탈로그 복귀 후에도 GitHub Release는 남겨 둬도 무방(미사용). 카탈로그만 HF를 가리키면 된다.

---

## 5. 관련 파일 맵

| 파일 | 역할 |
|------|------|
| `scripts/Export-Wav2Vec2BaseInt8Onnx.ps1` | Kkonjeong → `library/wav2vec2-base-int8/model.onnx` (Git 커밋 금지) |
| `scripts/Publish-Wav2Vec2BaseOnnx.ps1` | **HF(FinDIT-Studio) 업로드** — 정식 |
| `scripts/Publish-Wav2Vec2BaseGithub.ps1` | GitHub Release 업로드 — HF 토큰 없을 때 임시 |
| `scripts/Setup-Wav2Vec2BaseAlign-HF.ps1` | HF 경로 래퍼 (Publish-Wav2Vec2BaseOnnx) |
| `scripts/Setup-Wav2Vec2BaseAlign.ps1` | GitHub 경로 래퍼 (현재 HF 없는 PC 기본) |
| `app/lib/nrmAlignModelCatalog.ts` | TS 카탈로그 (JS/UI) |
| `app/android/.../AlignModelCatalog.kt` | Kotlin 카탈로그 (네이티브 다운로드) |
| `library/wav2vec2-base-int8/README.md` | 모델 개요 |

---

## 6. AI 에이전트 지침

1. 사용자가 **「HF PC에서 FinDIT-Studio로 되돌려」**라고 하면 이 문서 **3절 전체**를 수행한다.
2. **APK에 model.onnx를 번들하지 않는다.** (대용량 바이너리 부트스트랩 규칙)
3. HF 업로드 후 `Verify-Wav2Vec2BaseAlignUrl-HF.ps1`가 **200 OK**일 때만 카탈로그 URL을 HF로 바꾼다.
4. `nrmAlignModelCatalog.ts`와 `AlignModelCatalog.kt`는 **항상 동기** 유지.
5. 참고: 예전 large FA 모델 ID `whisperx:forced-align` → 마이그레이션 시 `align:wav2vec2-base`로 매핑됨.

---

## 7. 참고 — FinDIT-Studio에 이미 있는 공개 모델

- `FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx` (~1.2GB) — **구버전 large FA**, 앱에서 제거됨
- `FinDIT-Studio/wav2vec2-base-korean-onnx` — **base FA용**, `model.onnx` 업로드 필요 시 이 저장소 사용
