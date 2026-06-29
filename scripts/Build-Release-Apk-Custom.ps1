param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [switch]$Customize,
    [string]$DisplayName = '',
    [string]$UserName = '',
    [string]$SerialNo = ''
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path $RepoRoot).Path
. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$AppDir = Join-Path $RepoRoot 'app'
$AndroidDir = Join-Path $AppDir 'android'
$BrandConfigPath = Join-Path $AppDir 'nrm-brand.config.json'
$ApkOutDir = Join-Path $AndroidDir 'app\build\outputs\apk\release'

if (-not (Test-Path (Join-Path $AndroidDir 'gradlew.bat'))) {
    Write-Error "android\gradlew.bat not found under $RepoRoot"
}

function Invoke-Npm {
    param([string[]]$NpmArgs)
    Push-Location $AppDir
    try {
        & npm @NpmArgs
        if ($LASTEXITCODE -ne 0) {
            throw "npm $($NpmArgs -join ' ') failed (exit $LASTEXITCODE)"
        }
    }
    finally {
        Pop-Location
    }
}

function Restore-BrandConfig {
    param([string]$OriginalJson)
    if (-not $OriginalJson) { return }
    Write-TextFileUtf8NoBom -Path $BrandConfigPath -Content $OriginalJson
    Invoke-Npm @('run', 'sync:brand')
}

$originalBrandJson = Read-TextFileUtf8 -Path $BrandConfigPath
$buildFailed = $false

try {
    $cfg = $originalBrandJson | ConvertFrom-Json

    if ($Customize) {
        if (-not $DisplayName -or -not $UserName -or -not $SerialNo) {
            throw 'Custom branding values are missing.'
        }
        $cfg.displayName = $DisplayName.Trim()
        $cfg.serialNo = $SerialNo.Trim()
        $cfg.userName = $UserName.Trim()
        $cfg.versionInfoAdminBuild = $false
    }
    else {
        $adminDefaults = Get-NrmBrandAdminDefaults -RepoRoot $RepoRoot
        $cfg.displayName = $adminDefaults.displayName.Trim()
        $cfg.serialNo = $adminDefaults.serialNo.Trim()
        $cfg.userName = $adminDefaults.userName.Trim()
        $cfg.versionInfoAdminBuild = $true
    }

    Write-JsonFileUtf8 -Path $BrandConfigPath -InputObject $cfg -Depth 8

    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Verify-AndroidReleaseAssets.ps1')
    if ($LASTEXITCODE -ne 0) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Build-Whisper-AndroidCli.ps1')
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Setup-AndroidShine.ps1')
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Build-ArgosTranslate-Android.ps1')
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Verify-AndroidReleaseAssets.ps1')
        if ($LASTEXITCODE -ne 0) {
            throw 'Native asset build/verify failed.'
        }
    }

    Invoke-Npm @('run', 'sync:brand')

    Push-Location $AppDir
    try {
        & npx tsc --noEmit
        if ($LASTEXITCODE -ne 0) {
            throw 'Typecheck failed.'
        }
    }
    finally {
        Pop-Location
    }

    Invoke-Npm @('run', 'generate:music-quotes')

    if ($Customize) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Invoke-NrmAndroidReleaseBuild.ps1') -RepoRoot $RepoRoot -ApkVariant 'custom' -ForceRebundle
    }
    else {
        # GitHub Releases 공개 채널 — suffix 없는 NullReferenceMusic-v{version}.apk
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Invoke-NrmAndroidReleaseBuild.ps1') -RepoRoot $RepoRoot -ForceRebundle
    }
    if ($LASTEXITCODE -ne 0) {
        throw 'Gradle assembleRelease failed.'
    }
}
catch {
    $buildFailed = $true
    Write-Host $_.Exception.Message
}
finally {
    try {
        Restore-BrandConfig -OriginalJson $originalBrandJson
    }
    catch {
        Write-Host $_.Exception.Message
    }
}

if ($buildFailed) {
    exit 1
}

$apkFiles = @()
if (Test-Path $ApkOutDir) {
    $apkFiles = Get-ChildItem -LiteralPath $ApkOutDir -Filter '*.apk' -File | Sort-Object LastWriteTime -Descending
}

if ($apkFiles.Count -eq 0) {
    exit 1
}

exit 0
