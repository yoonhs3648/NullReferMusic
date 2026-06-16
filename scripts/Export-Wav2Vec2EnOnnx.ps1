#Requires -Version 5.1
<#
.SYNOPSIS
  facebook/wav2vec2-base-960h → ONNX export (영어 FA용).

.DESCRIPTION
  library/wav2vec2-base-en/model.onnx 생성. Git 커밋하지 말 것.
  scripts/Publish-Wav2Vec2EnGithub.ps1 로 GitHub Release 업로드.
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root 'library\wav2vec2-base-en'
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

Write-Host 'Exporting facebook/wav2vec2-base-960h to ONNX...'
& $py -m optimum.exporters.onnx `
  --model facebook/wav2vec2-base-960h `
  --task automatic-speech-recognition `
  $exportDir

$srcOnnx = Get-ChildItem -Path $exportDir -Filter 'model.onnx' -Recurse | Select-Object -First 1
if (-not $srcOnnx) {
  Write-Error "model.onnx not found under $exportDir"
}

Copy-Item $srcOnnx.FullName (Join-Path $OutDir 'model.onnx') -Force
Write-Host "OK: $(Join-Path $OutDir 'model.onnx') ($('{0:N0}' -f (Get-Item (Join-Path $OutDir 'model.onnx')).Length) bytes)"
