#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$url = 'https://github.com/yoonhs3648/NullReferMusic/releases/download/align-wav2vec2-base-v1/model.onnx'
try {
  $r = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 5 -ErrorAction Stop
  Write-Host "OK: $url"
  Write-Host "Status: $($r.StatusCode) Content-Length: $($r.Headers['Content-Length'])"
  exit 0
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "FAIL ($code): $url"
  Write-Host "GitHub Release에 model.onnx가 없습니다. Publish-Wav2Vec2BaseGithub.ps1 실행 필요."
  exit 1
}
