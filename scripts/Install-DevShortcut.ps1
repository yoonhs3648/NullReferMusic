# Creates Desktop\NullReferMusic-Dev.lnk -> runs StartServer.bat from repo root.

param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$bat = Join-Path $RepoRoot 'StartServer.bat'
if (-not (Test-Path -LiteralPath $bat)) {
  throw "Not found: $bat"
}

$cmd = $env:ComSpec
if ([string]::IsNullOrWhiteSpace($cmd)) {
  $cmd = Join-Path $env:SystemRoot 'System32\cmd.exe'
}

$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'NullReferMusic-Dev.lnk'
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnk)
$s.TargetPath = $cmd
$s.Arguments = "/c cd /d `"$RepoRoot`" && call `"$bat`""
$s.WorkingDirectory = $RepoRoot
$s.Description = 'NullReferMusic: backend + Expo web + Expo Go (LAN)'
$s.Save()

Write-Output "OK: $lnk"
