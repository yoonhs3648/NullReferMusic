#Requires -Version 5.1
<#
.SYNOPSIS
  Kkonjeong/wav2vec2-base-korean ONNX export + FinDIT-Studio HF 업로드.

.DESCRIPTION
  1) library/wav2vec2-base-int8/model.onnx 생성 (FP32, ~380MB)
  2) HF_TOKEN 환경 변수로 FinDIT-Studio/wav2vec2-base-korean-onnx 업로드

  앱은 HF에서 기기로 직접 다운로드 (Whisper 모델과 동일).
#>
param(
    [switch]$SkipExport,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root 'library\wav2vec2-base-int8'
$ModelOut = Join-Path $OutDir 'model.onnx'
$RepoId = 'FinDIT-Studio/wav2vec2-base-korean-onnx'

if (-not $SkipExport) {
    & (Join-Path $PSScriptRoot 'Export-Wav2Vec2BaseInt8Onnx.ps1')
}

if (-not (Test-Path $ModelOut)) {
    Write-Error "model.onnx 없음: $ModelOut — Export-Wav2Vec2BaseInt8Onnx.ps1 먼저 실행"
}

$token = $env:HF_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  $tokenFile = Join-Path $Root 'library\.hf-token.local'
  if (Test-Path $tokenFile) {
    $token = (Get-Content $tokenFile -Raw).Trim()
  }
}
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error @"
HF_TOKEN 환경 변수 또는 library\.hf-token.local 파일이 필요합니다 (FinDIT-Studio 쓰기 권한).
  `$env:HF_TOKEN = 'hf_...'
  또는 echo hf_... > library\.hf-token.local
  .\scripts\Publish-Wav2Vec2BaseOnnx.ps1
"@
}

$py = @(
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $py) { Write-Error 'Python 3.10+ 필요' }

& $py -m pip install --quiet huggingface_hub 2>$null

$uploadPy = Join-Path $OutDir '_upload_hf.py'
@'
import os, sys
from pathlib import Path
from huggingface_hub import HfApi, create_repo

repo_id = sys.argv[1]
model_path = Path(sys.argv[2])
token = os.environ["HF_TOKEN"]

api = HfApi(token=token)
create_repo(repo_id, exist_ok=True, repo_type="model")
api.upload_file(
    path_or_fileobj=str(model_path),
    path_in_repo="model.onnx",
    repo_id=repo_id,
    repo_type="model",
    commit_message="Upload wav2vec2-base-korean ONNX for NullReferMusic FA",
)
print(f"Uploaded {model_path} -> {repo_id}/model.onnx ({model_path.stat().st_size} bytes)")
'@ | Set-Content -Path $uploadPy -Encoding UTF8

$env:HF_TOKEN = $token
& $py $uploadPy $RepoId $ModelOut
Remove-Item $uploadPy -Force -ErrorAction SilentlyContinue

Write-Host "OK: https://huggingface.co/$RepoId/resolve/main/model.onnx"
