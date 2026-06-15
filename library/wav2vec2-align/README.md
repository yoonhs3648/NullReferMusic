# wav2vec2 CTC Forced Alignment (WhisperX FA)

멜론 가사 싱크용 **wav2vec2 ONNX** 모델입니다. APK에 포함하지 않으며, 앱 설정에서 Hugging Face로부터 기기에 다운로드합니다.

## 앱이 받는 파일 (`filesDir/whisperx-align/`)

| 파일 | 출처 |
|------|------|
| `vocab.json` | [kresnik/wav2vec2-large-xlsr-korean](https://huggingface.co/kresnik/wav2vec2-large-xlsr-korean) |
| `config.json` | 동일 |
| `preprocessor_config.json` | 동일 |
| `model.onnx` | [FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx](https://huggingface.co/FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx) |

`model.onnx` URL이 404이면 아래 스크립트로 ONNX를 생성·업로드한 뒤 카탈로그 URL을 갱신하세요.

## ONNX export (PC, 1회)

```powershell
.\scripts\Export-Wav2Vec2AlignOnnx.ps1
```

출력: `library/wav2vec2-align/model.onnx` (Git 커밋 금지 — 대용량 바이너리 규칙)

## 동작

1. FFmpeg → 16kHz mono WAV
2. ONNX Runtime + wav2vec2 → CTC log-prob
3. 멜론 가사(known transcript) → CTC trellis forced alignment → LRC
4. 실패 시 다른 엔진(Whisper 전사 등)으로 대체하지 않음 — 가사 미생성·실패 알림
