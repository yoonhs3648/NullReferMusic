#Requires -Version 5.1
<#
.SYNOPSIS
  kresnik/wav2vec2-large-xlsr-korean → ONNX export (멜론 FA용).

.DESCRIPTION
  library/wav2vec2-align/model.onnx 생성. Git 커밋하지 말 것.
  Hugging Face 등에 업로드 후 app 카탈로그 URL 갱신.
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root 'library\wav2vec2-align'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$py = @(
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $py) {
  Write-Error 'Python 3.10+ 필요'
}

& $py -m pip install --quiet --upgrade 'optimum[onnxruntime]' onnx onnxruntime 2>$null

$exportDir = Join-Path $OutDir 'onnx-export'
if (Test-Path $exportDir) { Remove-Item -Recurse -Force $exportDir }

Write-Host 'Exporting kresnik/wav2vec2-large-xlsr-korean to ONNX...'
& $py -m optimum.exporters.onnx `
  --model kresnik/wav2vec2-large-xlsr-korean `
  --task automatic-speech-recognition `
  $exportDir

$srcOnnx = Get-ChildItem -Path $exportDir -Filter 'model.onnx' -Recurse | Select-Object -First 1
if (-not $srcOnnx) {
  Write-Error "model.onnx not found under $exportDir"
}

Copy-Item $srcOnnx.FullName (Join-Path $OutDir 'model.onnx') -Force
Write-Host "OK: $(Join-Path $OutDir 'model.onnx') ($('{0:N0}' -f (Get-Item (Join-Path $OutDir 'model.onnx')).Length) bytes)"
