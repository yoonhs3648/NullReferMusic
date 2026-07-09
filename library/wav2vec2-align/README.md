# wav2vec2 XLS-R CTC Forced Alignment

`align:wav2vec2-xlsr` — kresnik/wav2vec2-large-xlsr-korean ONNX (~1.27GB).

- **vocab/config/preprocessor**: Hugging Face `kresnik/wav2vec2-large-xlsr-korean`
- **model.onnx**: Hugging Face `FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx`

## PC dev 수동 설치

```text
library/wav2vec2-align/wav2vec2-xlsr/
  vocab.json
  config.json
  preprocessor_config.json
  model.onnx
```

## ONNX export (1회)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Export-Wav2Vec2AlignOnnx.ps1
```

산출물 `library/wav2vec2-align/model.onnx` — Git 커밋 금지.

## URL 검증

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Verify-Wav2Vec2XlsrAlignUrl.ps1
```
