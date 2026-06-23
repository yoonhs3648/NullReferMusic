# Windows release APK Gradle step — avoids MAX_PATH (260) failures via subst + short GRADLE_USER_HOME.
# Does not modify app/runtime code. Safe to call from NullReferMusic-Build-Release-Apk.bat and npm android:release.
param(
    [string]$RepoRoot = "",
    [switch]$NoDaemon = $true,
    [string]$ApkVariant = "",
    # 브랜드(displayName) 변경 후 이전 release JS·리소스 캐시를 무시하고 다시 번들
    [switch]$ForceRebundle = $false
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Ensure-NrmGithubDataPat.ps1') -RepoRoot $RepoRoot

$androidDir = Join-Path $RepoRoot 'app\android'
if (-not (Test-Path (Join-Path $androidDir 'gradlew.bat'))) {
    Write-Error "gradlew.bat not found under $androidDir"
}

$gradleUserHome = 'C:\g'
if (-not (Test-Path $gradleUserHome)) {
    New-Item -ItemType Directory -Path $gradleUserHome -Force | Out-Null
}
$env:GRADLE_USER_HOME = $gradleUserHome

$substDrive = $null
foreach ($letter in @('Z', 'Y', 'X', 'W', 'V', 'N', 'M')) {
    $drive = "${letter}:"
    cmd /c "subst $drive /d" 2>$null | Out-Null
    cmd /c "subst $drive `"$RepoRoot`"" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0 -and (Test-Path "${drive}\app\android\gradlew.bat")) {
        $substDrive = $drive
        break
    }
    cmd /c "subst $drive /d" 2>$null | Out-Null
}

if (-not $substDrive) {
    Write-Error @"
Could not map a subst drive for Windows path shortening.
Repo: $RepoRoot
Use NullReferMusic-Build-Release-Apk.bat or see docs/RELEASE-APK-IPA-RULE.md section 6-3-a.
"@
}

Write-Host "[nrm] GRADLE_USER_HOME=$gradleUserHome"
Write-Host "[nrm] subst $substDrive -> $RepoRoot"
if ($ApkVariant) {
    Write-Host "[nrm] APK variant: $ApkVariant"
}
if ($ForceRebundle) {
    Write-Host "[nrm] ForceRebundle: clearing stale release JS/resource caches"
}

function Clear-NrmAndroidReleaseBrandOutputs {
    param([string]$AndroidRoot, [string]$AppRoot)
    $relPaths = @(
        'app\build\generated\assets\createBundleReleaseJsAndAssets'
        'app\build\intermediates\assets\release'
        'app\build\intermediates\compressed_assets\release'
        'app\build\intermediates\merged_res\release'
        'app\build\intermediates\packaged_res\release'
        'app\build\intermediates\incremental\release\mergeReleaseResources'
        'app\src\main\assets\index.android.bundle'
    )
    foreach ($rel in $relPaths) {
        $full = Join-Path $AndroidRoot $rel
        if (Test-Path -LiteralPath $full) {
            Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "[nrm] cleared: $rel"
        }
    }
    $metroCache = Join-Path $AppRoot 'node_modules\.cache'
    if (Test-Path -LiteralPath $metroCache) {
        Remove-Item -LiteralPath $metroCache -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[nrm] cleared: app\node_modules\.cache (Metro)"
    }
}

try {
    Push-Location "$substDrive\app\android"
    if ($ForceRebundle) {
        Clear-NrmAndroidReleaseBrandOutputs -AndroidRoot (Get-Location).Path -AppRoot "$substDrive\app"
        $bundleArgs = @(':app:createBundleReleaseJsAndAssets', '--rerun-tasks')
        if ($NoDaemon) {
            $bundleArgs += '--no-daemon'
        }
        if ($ApkVariant) {
            $bundleArgs += "-PnrmApkVariant=$ApkVariant"
        }
        & .\gradlew.bat @bundleArgs
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
    $gradleArgs = @('assembleRelease')
    if ($NoDaemon) {
        $gradleArgs += '--no-daemon'
    }
    if ($ApkVariant) {
        $gradleArgs += "-PnrmApkVariant=$ApkVariant"
    }
    & .\gradlew.bat @gradleArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
    cmd /c "subst $substDrive /d" 2>$null | Out-Null
}
