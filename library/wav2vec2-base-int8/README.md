# wav2vec2-base Forced Alignment (ONNX)

멜론 가사 CTC forced alignment용 **경량 wav2vec2-base** 모델입니다. APK에 포함하지 않으며, 앱 설정에서 온라인으로 기기에 다운로드합니다 (Whisper 모델과 동일).

## 앱 설치 경로

`filesDir/wav2vec2-base/`

| 파일 | 출처 |
|------|------|
| `vocab.json` | [Kkonjeong/wav2vec2-base-korean](https://huggingface.co/Kkonjeong/wav2vec2-base-korean) |
| `config.json` | 동일 |
| `preprocessor_config.json` | 동일 |
| `model.onnx` | FinDIT-Studio HF(정식) 또는 GitHub Release(임시) — 아래 참고 (~380 MB FP32) |

## PC에서 1회 업로드

| 환경 | 명령 |
|------|------|
| **HF 토큰 + FinDIT-Studio (정식)** | `Setup-Wav2Vec2BaseAlign-HF.ps1` → **`docs/WAV2VEC2-BASE-ALIGN-HF-MIGRATION.md`** |
| **HF 토큰 없음 (임시)** | `Setup-Wav2Vec2BaseAlign.ps1` → GitHub Release |

HF PC에서 카탈로그 URL을 FinDIT-Studio로 되돌리는 절차는 **`docs/WAV2VEC2-BASE-ALIGN-HF-MIGRATION.md`** 에 AI·작업자용으로 정리되어 있다.

출력(로컬): `library/wav2vec2-base-int8/model.onnx` (Git 커밋 금지)

INT8 dynamic quantize는 wav2vec2 구조상 실패할 수 있어 **FP32 ONNX**를 사용합니다 (~380 MB, large 1.2 GB 대비 경량).

## 동작

1. FFmpeg → 16kHz mono WAV
2. ONNX Runtime + wav2vec2-base → CTC log-prob
3. 멜론 가사 → CTC trellis forced alignment → LRC
4. 실패 시 균등 분배 폴백 없음 — 가사 미생성·실패 알림
