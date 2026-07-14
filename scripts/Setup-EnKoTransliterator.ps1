#requires -Version 5.1
<#
.SYNOPSIS
  eunsour/en-ko-transliterator 를 HF에서 받아 ONNX 패키지로 변환.
.NOTES
  - HuggingFace 공식 Xet CDN 이 401 을 내는 환경이 있음 → huggingface_hub snapshot 사용.
  - 결과물은 실행 바이너리가 아닌 데이터(ONNX/토크나이저)만.
#>
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$HfDir = Join-Path $RepoRoot 'library\en-ko-transliterator\_hf'
$BinDir = Join-Path $RepoRoot 'library\en-ko-transliterator\_bin'
$Py = Join-Path $RepoRoot 'scripts\export_en_ko_transliterator_onnx.py'

New-Item -ItemType Directory -Force -Path $HfDir, $BinDir | Out-Null

Write-Host '[en-ko] snapshot_download eunsour/en-ko-transliterator ...'
$env:HF_HUB_DISABLE_XET = '0'
& py -3.10 -c @"
from huggingface_hub import snapshot_download
p = snapshot_download(
    'eunsour/en-ko-transliterator',
    local_dir=r'$($HfDir -replace '\\','\\')',
    ignore_patterns=['optimizer.pt','scheduler.pt','training_args.bin','eval_results.txt','*.bin'],
)
print(p)
"@
if ($LASTEXITCODE -ne 0) { throw 'HF snapshot_download failed' }

Write-Host '[en-ko] export onnx ...'
& py -3.10 $Py --model $HfDir --out $BinDir
if ($LASTEXITCODE -ne 0) { throw 'onnx export failed' }

Get-ChildItem $BinDir | ForEach-Object { Write-Host ("  {0} {1:N0} bytes" -f $_.Name, $_.Length) }
Write-Host '[en-ko] OK. Next: .\scripts\Publish-EnKoTransliteratorGithub.ps1'
