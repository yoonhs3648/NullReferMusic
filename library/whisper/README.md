# 로컬 Whisper (속도 우선, 가사 LRC)

yt-dlp 자막 대신 **다운로드된 오디오 파일**을 whisper.cpp로 전사합니다.

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

## Android APK

`app/android/app/src/main/assets/whisper/` 에 동일 파일을 넣고 빌드합니다 (네트워크 다운로드 없음).
앱은 아래 우선순위로 모델을 자동 선택합니다:
`tiny-q5_1 -> tiny -> base.en-q5_1 -> base.en -> ... -> large-v3`

- `whisper-cli` (arm64 바이너리, 실행 권한)
- `ggml-tiny-q5_1.bin` (속도 우선 권장)

## 웹 (브라우저)

`app/public/whisper-large-v3/` 에 Xenova ONNX 변환 모델을 두고, `app/public/onnx/` 에 WASM 런타임을 둡니다.  
`env.allowRemoteModels = false` 로 Hugging Face CDN을 쓰지 않습니다.
