param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
$AppDir = Join-Path $RepoRoot 'app'

$pkg = Get-Content (Join-Path $AppDir 'package.json') -Raw | ConvertFrom-Json
$gradle = Get-Content (Join-Path $AppDir 'android\app\build.gradle') -Raw
$brand = Get-Content (Join-Path $AppDir 'nrm-brand.config.json') -Raw | ConvertFrom-Json

$versionName = $pkg.version
$versionCode = '?'
if ($gradle -match 'versionName\s+"([^"]+)"') {
    $versionName = $matches[1]
}
if ($gradle -match 'versionCode\s+(\d+)') {
    $versionCode = $matches[1]
}

Write-Host "Current release APK version: $versionName  (versionCode $versionCode)"
Write-Host "Current display name: $($brand.displayName)"
