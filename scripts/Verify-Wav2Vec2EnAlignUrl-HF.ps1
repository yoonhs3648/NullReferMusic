#Requires -Version 5.1
$url = 'https://huggingface.co/FinDIT-Studio/wav2vec2-base-english-onnx/resolve/main/model.onnx'
try {
  $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing
  $len = $r.Headers['Content-Length']
  Write-Host "OK ($($r.StatusCode)): $url size=$len"
  if ([long]$len -lt 360000000) {
    Write-Host "WARN: Content-Length가 360MB 미만입니다."
    exit 1
  }
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "FAIL ($code): $url"
  Write-Host "FinDIT-Studio에 model.onnx가 없습니다. Publish-Wav2Vec2EnOnnx.ps1 실행 필요."
  Write-Host "상세 절차: docs/WAV2VEC2-BASE-ALIGN-HF-MIGRATION.md"
  exit 1
}
