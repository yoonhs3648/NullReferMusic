# Creates Desktop\NullReferMusic-Dev.lnk -> Start-Dev-Full.bat

param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$bat = Join-Path $RepoRoot 'Start-Dev-Full.bat'
if (-not (Test-Path -LiteralPath $bat)) {
  throw "Not found: $bat"
}

$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'NullReferMusic-Dev.lnk'
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnk)
$s.TargetPath = $bat
$s.WorkingDirectory = $RepoRoot
$s.Description = 'NullReferMusic: one click = backend + Expo LAN + browser'
$s.Save()

Write-Output "OK: $lnk"
