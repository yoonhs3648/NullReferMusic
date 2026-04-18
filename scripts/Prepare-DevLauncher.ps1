# Runs hidden from .bat: optional desktop shortcut + LAN hint file (no extra console windows).

param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot,
  [string]$LauncherBat = '',
  [switch]$SkipDesktopShortcut
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'LanHint.ps1')

$hintPath = Join-Path $env:TEMP 'NRM-LAN-HINT.txt'
(Get-LanHintLines) -join "`r`n" | Set-Content -Path $hintPath -Encoding UTF8

if (-not $SkipDesktopShortcut) {
  if (-not $LauncherBat) {
    throw 'LauncherBat is required when not using -SkipDesktopShortcut'
  }
  $desk = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $desk 'NullReferMusic-Dev.lnk'
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($lnk)
  $s.TargetPath = $LauncherBat
  $s.WorkingDirectory = $RepoRoot
  $s.Description = 'NullReferMusic: Spring + Expo LAN (web + phone)'
  $s.Save()
}
