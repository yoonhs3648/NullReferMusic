# en-ko-transliterator (FA 전처리 전용)

멜론 plain 가사의 **영어 단어를 한국어 발음 표기로 임시 변환**한 뒤, 기존 wav2vec2-base Forced Alignment에 넣습니다.  
LRC 생성 후 **원문 가사로 복원**합니다. FA 엔진 코드는 변경하지 않습니다.

원본 모델: [eunsour/en-ko-transliterator](https://huggingface.co/eunsour/en-ko-transliterator) (mT5-base fine-tune)

## 앱 동작

- 오프라인, 기기 내부에서만 동작 (ONNX Runtime — APK에 이미 포함)
- `가사 언어 탐지 설정` → **EN→KO 발음** 선택 시 전처리 적용
- 같은 화면의 **en-ko-transliterator** 카드에서 다운로드·설치

## 설계 원칙 (eSpeak NG 실패 교훈)

| 원칙 | 내용 |
|------|------|
| 실행파일 금지 | CLI/`chmod`/`linker`/W^X 경로를 **쓰지 않음** — 데이터 파일만 `filesDir`에 저장 |
| 설치 = 프로브 성공 | `hello` → 한글 결과가 나와야만 installed |
| 배포 경로 | HuggingFace 직접 수신 금지(Xet 401 등) → **GitHub Release**만 |
| 재시도 | `NrmResilientHttpDownload` + `NrmModelInstallQueue` |

## GitHub Release

태그: `en-ko-transliterator-v1`

| 파일 | 설명 |
|------|------|
| `encoder.onnx` | mT5 encoder |
| `decoder.onnx` | mT5 decoder (logits) |
| `spiece.model` | SentencePiece |
| `unigram_pieces.tsv` | Kotlin Unigram용 piece/score |
| `tokenizer_meta.json` | pad/eos/unk/decoder_start |

## PC에서 1회 패키징

```powershell
cd D:\AIProj\CsTool\NullReferMusic
.\scripts\Setup-EnKoTransliterator.ps1
# GitHub CLI(gh) 로그인 후:
.\scripts\Publish-EnKoTransliteratorGithub.ps1
```

로컬에 이미 `_bin` 산출물(INT8 ONNX)이 있으면 Setup 없이 Publish만 해도 됩니다.

`_bin/` · `_hf/` 는 대용량이라 Git에 커밋하지 말 것.
