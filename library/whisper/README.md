# 로컬 Whisper (속도 우선, 가사 LRC)

yt-dlp 자막 대신 **다운로드된 오디오 파일**을 whisper.cpp로 전사합니다.

## 빠른 설치 (다른 PC 공통)

저장소를 `pull`한 뒤 아래 명령으로 바이너리/모델을 자동으로 준비합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Whisper.ps1 -WhisperProfile tiny-q5_1
# APK용 모델만 assets에 복사: -AndroidAssets 추가 (whisper-cli arm64는 별도 빌드)
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Whisper.ps1 -WhisperProfile tiny-q5_1 -AndroidAssets
```

- 기본 모델은 `tiny-q5_1` (속도 우선)
- 다른 모델: `tiny`, `base.en-q5_1`, `base.en`, `large-v3-turbo-q5_0`, `large-v3`
- 재설치/강제 갱신: `-Force`

> 주의: `library/whisper/*.bin`, `*.dll`, `*.exe`, `*.zip` 은 용량 때문에 Git 추적 대상이 아닙니다.
> 이 스크립트가 팀 공통 부트스트랩 경로입니다.

## PC 백엔드 (Windows)

1. [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 릴리스에서 `whisper-cli.exe`(또는 `main.exe`)를 이 폴더에 둡니다.
2. 속도 최우선이면 아래 모델 중 하나를 둡니다 (위일수록 빠름):
   - `ggml-tiny-q5_1.bin` (권장, 가장 빠름)
   - `ggml-tiny.bin`
   - `ggml-base.en-q5_1.bin`
   - `ggml-base.en.bin`
   - (느리지만 품질↑) `ggml-large-v3-turbo-q5_0.bin`, `ggml-large-v3.bin`

```
library/whisper/
  whisper-cli.exe   (또는 main.exe)
  ggml-tiny-q5_1.bin
```

`application.properties` (선택):

```properties
nrm.whisper-cli=
nrm.whisper-model=
nrm.whisper-dir=
```

## LRC 전사 인자 (APK·백엔드)

- **VAD 없음** (1.5.17~): 전곡 전사, 가사 있는 구간만 LRC 타임스탬프.
- `-nth 0.30` `-lpt -1.25` `-et 3.00` `-tp 0` — 앞·약한 보컬·노래 구간 유지
- `-l auto` — 한·영 팝 혼용
- APK 단일 곡: `-bs 5 -bo 5`, 큐 1곡: `-bs 4 -bo 3`, 2곡+: `-bs 2 -bo 2`
- 모델: `ggml-*.bin` 우선, 기본 추천 ID `whisper:large-v3`

## Android APK (용량 최소화)

- **APK assets (Git 형상관리)**: `app/android/app/src/main/assets/whisper/whisper-cli` (arm64). `ggml-*.bin` Whisper 본체 모델은 APK·Git 모두에 넣지 않습니다.
- **모델**: 메뉴에서 선택한 5종(`large-v3-turbo` … `base`) 중 하나를 **기기가 Hugging Face에서 직접** 받아 `files/whisper/` 에 저장합니다 (백엔드 통신 없음).
- CLI 빌드·assets 복사: `powershell -ExecutionPolicy Bypass -File .\scripts\Build-Whisper-AndroidCli.ps1`
- 릴리스 APK 전 검증: `scripts/Verify-AndroidReleaseAssets.ps1` (또는 Gradle `verifyReleaseNativeAssets`)

## 웹 (브라우저)

`app/public/whisper-large-v3/` 에 Xenova ONNX 변환 모델을 두고, `app/public/onnx/` 에 WASM 런타임을 둡니다.  
`env.allowRemoteModels = false` 로 Hugging Face CDN을 쓰지 않습니다.
