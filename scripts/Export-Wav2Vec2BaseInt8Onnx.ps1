#Requires -Version 5.1
<#
.SYNOPSIS
  Kkonjeong/wav2vec2-base-korean → ONNX INT8 export (Forced Alignment용).

.DESCRIPTION
  library/wav2vec2-base-int8/model.onnx 생성. Git 커밋하지 말 것.
  Hugging Face(FinDIT-Studio/wav2vec2-base-korean-onnx)에 업로드 후
  app/lib/nrmAlignModelCatalog.ts · AlignModelCatalog.kt URL 갱신.
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root 'library\wav2vec2-base-int8'
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

Write-Host 'Exporting Kkonjeong/wav2vec2-base-korean to ONNX...'
& $py -m optimum.exporters.onnx `
  --model Kkonjeong/wav2vec2-base-korean `
  --task automatic-speech-recognition `
  $exportDir

$srcOnnx = Get-ChildItem -Path $exportDir -Filter 'model.onnx' -Recurse | Select-Object -First 1
if (-not $srcOnnx) {
  Write-Error "model.onnx not found under $exportDir"
}

$fp32Out = Join-Path $OutDir 'model.fp32.onnx'
Copy-Item $srcOnnx.FullName $fp32Out -Force

Write-Host 'Quantizing to INT8 (dynamic)...'
$quantOk = $false
try {
  $quantScript = @'
import sys
from pathlib import Path
from onnxruntime.quantization import QuantType, quantize_dynamic

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
print(f"OK: {dst} ({dst.stat().st_size} bytes)")
'@
  $quantPy = Join-Path $OutDir '_quantize.py'
  Set-Content -Path $quantPy -Value $quantScript -Encoding UTF8
  & $py $quantPy $fp32Out (Join-Path $OutDir 'model.onnx')
  Remove-Item $quantPy -Force -ErrorAction SilentlyContinue
  $quantOk = $true
} catch {
  Write-Warning "INT8 quantize failed — FP32 model.onnx 사용: $($_.Exception.Message)"
}

if (-not $quantOk -or -not (Test-Path (Join-Path $OutDir 'model.onnx'))) {
  Copy-Item $fp32Out (Join-Path $OutDir 'model.onnx') -Force
  Write-Host "Using FP32 model.onnx ($('{0:N0}' -f (Get-Item (Join-Path $OutDir 'model.onnx')).Length) bytes)"
}

Write-Host "OK: $(Join-Path $OutDir 'model.onnx')"
