param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$AppDir = Join-Path $RepoRoot 'app'

function Get-ReleaseVersionName {
    $pkgRaw = Read-TextFileUtf8 -Path (Join-Path $AppDir 'package.json')
    $pkg = $pkgRaw | ConvertFrom-Json
    $gradle = Read-TextFileUtf8 -Path (Join-Path $AppDir 'android\app\build.gradle')
    $versionName = $pkg.version
    if ($gradle -match 'versionName\s+"([^"]+)"') {
        $versionName = $matches[1]
    }
    return $versionName
}

function Read-BuildYn {
    while ($true) {
        $ans = Read-Host 'Build this version? [Y/N]'
        if ($ans -match '^[Yy]$') { return $true }
        if ($ans -match '^[Nn]$') { return $false }
    }
}

function Show-ApkSuccessBanner {
    param(
        [string]$AppName,
        [string]$UserName,
        [string]$SerialNo,
        [string]$Version
    )
    1..10 | ForEach-Object { Write-Host '' }
    Write-Host ''
    Write-Host '  +======================================================+' -ForegroundColor Green
    Write-Host '  |                                                      |' -ForegroundColor Green
    Write-Host '  |            <<<APK CREATE SUCESSS>>>                 |' -ForegroundColor Green
    Write-Host '  |                                                      |' -ForegroundColor Green
    Write-Host '  +======================================================+' -ForegroundColor Green
    Write-Host ''
    Write-Host "  appName  : $AppName"
    Write-Host "  userName : $UserName"
    Write-Host "  SerialNo : $SerialNo"
    Write-Host "  version  : $Version"
    Write-Host ''
    Write-Host '  +======================================================+' -ForegroundColor Green
    Write-Host ''
}

# ── 1. version ────────────────────────────────────────────────────────────────
$versionName = Get-ReleaseVersionName
Write-Host "version : $versionName"
Write-Host ''

# ── 2. confirm Y/N ────────────────────────────────────────────────────────────
if (-not (Read-BuildYn)) {
    Write-Host 'Cancelled.'
    Read-Host | Out-Null
    exit 0
}

$adminDefaults = Get-NrmBrandAdminDefaults -RepoRoot $RepoRoot
$appName = $adminDefaults.displayName
$userName = $adminDefaults.userName
$serialNo = $adminDefaults.serialNo

# ── 3. build APK ──────────────────────────────────────────────────────────────
& (Join-Path $RepoRoot 'scripts\Build-Release-Apk-Custom.ps1') -RepoRoot $RepoRoot
if ($LASTEXITCODE -ne 0) {
    Read-Host | Out-Null
    exit $LASTEXITCODE
}

# ── 4. success banner ─────────────────────────────────────────────────────────
Show-ApkSuccessBanner -AppName $appName -UserName $userName -SerialNo $serialNo -Version $versionName

Write-Host ''
Write-Host 'Publishing release APK to GitHub + Supabase apk version...'
& (Join-Path $RepoRoot 'scripts\Publish-NrmApkGithubRelease.ps1') -RepoRoot $RepoRoot -Version $versionName
if ($LASTEXITCODE -ne 0) {
    Write-Host 'GitHub release publish failed.' -ForegroundColor Red
}

Read-Host | Out-Null
exit 0
