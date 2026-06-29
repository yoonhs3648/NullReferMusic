#Requires -Version 5.1
<#
.SYNOPSIS
  GitHub Release 본문(body) 한글 깨짐 수정 — UTF-8 PATCH만 수행 (APK 재업로드 없음).

.EXAMPLE
  .\scripts\Fix-NrmGithubReleaseNotesUtf8.ps1 -Tag v2.5.0 -Pat ghp_...
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Tag,
    [string]$Pat = '',
    [string]$Repo = 'yoonhs3648/NullReferMusic',
    [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
else {
    $RepoRoot = (Resolve-Path $RepoRoot).Path
}
. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$Body = Get-NrmGithubReleaseApkBodyText -RepoRoot $RepoRoot

if (-not $Pat) {
    $secretsPath = Join-Path $RepoRoot '.secrets\nrm-github-data.pat'
    if (Test-Path -LiteralPath $secretsPath) {
        $Pat = (Read-TextFileUtf8 -Path $secretsPath).Trim()
    }
}
if (-not $Pat) {
    Write-Error 'GitHub PAT 필요: -Pat 또는 .secrets/nrm-github-data.pat'
}

$headers = @{
    Authorization = "Bearer $($Pat.Trim())"
    'User-Agent'  = 'NullReferMusic-Build'
    Accept        = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $headers -Method Get
Invoke-NrmGithubPatchJsonUtf8 -Uri "https://api.github.com/repos/$Repo/releases/$($release.id)" -Headers $headers -BodyObject @{
    body = $Body
} | Out-Null

Write-Host "OK: $Tag release notes updated (UTF-8)."
exit 0
