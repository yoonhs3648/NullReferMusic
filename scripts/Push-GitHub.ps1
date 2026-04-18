# Creates https://github.com/yoonhs3648/NullReferMusic and pushes main (requires GitHub auth once).
# Usage:
#   gh auth login
#   cd C:\NullReferMusic
#   .\scripts\Push-GitHub.ps1
#
# Or: $env:GH_TOKEN = 'ghp_...'  (classic PAT, repo scope) then run this script.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$authed = $false
gh auth status *> $null
if ($LASTEXITCODE -eq 0) { $authed = $true }

if (-not $authed) {
  if ($env:GH_TOKEN -and $env:GH_TOKEN.Length -ge 10) {
    $env:GH_TOKEN | gh auth login --with-token
    $authed = ($LASTEXITCODE -eq 0)
  }
}

if (-not $authed) {
  Write-Host @"
GitHub authentication required.

  gh auth login

Or set classic PAT (repo scope), then re-run:
  `$env:GH_TOKEN = 'ghp_...'
  .\scripts\Push-GitHub.ps1

"@
  exit 1
}

git remote remove origin 2>$null

Write-Host 'Creating repo (if missing) and pushing main...'
gh repo create NullReferMusic --public --source=. --remote=origin --push
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Create failed or repo already exists; trying push only...'
  git remote add origin https://github.com/yoonhs3648/NullReferMusic.git 2>$null
  git push -u origin main
}
