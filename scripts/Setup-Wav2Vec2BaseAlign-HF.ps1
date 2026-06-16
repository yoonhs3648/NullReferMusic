#Requires -Version 5.1
<#
.SYNOPSIS
  wav2vec2-base Forced Alignment ONNX — export + FinDIT-Studio(HF) 업로드 (1회).

.EXAMPLE
  $env:HF_TOKEN = 'hf_...'
  powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Wav2Vec2BaseAlign-HF.ps1

  자세한 HF 복귀·카탈로그 수정: docs/WAV2VEC2-BASE-ALIGN-HF-MIGRATION.md
#>
param(
    [switch]$SkipExport,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Publish-Wav2Vec2BaseOnnx.ps1') @PSBoundParameters
