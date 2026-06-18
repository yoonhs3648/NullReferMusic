#Requires -Version 5.1

<#

.SYNOPSIS

  wav2vec2-base Forced Alignment ONNX — export + GitHub Release 업로드 (1회).



.EXAMPLE

  powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Wav2Vec2BaseAlign.ps1

#>

param(

    [switch]$SkipExport,

    [switch]$Force

)



$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'Publish-Wav2Vec2BaseGithub.ps1') @PSBoundParameters

