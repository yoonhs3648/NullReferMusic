# Runs hidden from .bat: writes LAN hint file only (no desktop shortcut here).

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'LanHint.ps1')

$hintPath = Join-Path $env:TEMP 'NRM-LAN-HINT.txt'
(Get-LanHintLines) -join "`r`n" | Set-Content -Path $hintPath -Encoding UTF8
