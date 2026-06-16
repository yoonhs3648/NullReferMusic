#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$url = 'https://huggingface.co/FinDIT-Studio/wav2vec2-base-korean-onnx/resolve/main/model.onnx'
try {
  $r = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 5 -ErrorAction Stop
  Write-Host "OK: $url"
  Write-Host "Status: $($r.StatusCode) Content-Length: $($r.Headers['Content-Length'])"
  exit 0
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "FAIL ($code): $url"
  Write-Host "FinDIT-Studio에 model.onnx가 없습니다. Publish-Wav2Vec2BaseOnnx.ps1 실행 필요."
  Write-Host "자세한 절차: docs/WAV2VEC2-BASE-ALIGN-HF-MIGRATION.md"
  exit 1
}
