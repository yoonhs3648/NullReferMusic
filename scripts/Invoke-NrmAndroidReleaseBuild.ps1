# Windows release APK Gradle step — avoids MAX_PATH (260) failures via subst + short GRADLE_USER_HOME.
# Does not modify app/runtime code. Safe to call from NullReferMusic-Build-Release-Apk.bat and npm android:release.
param(
    [string]$RepoRoot = "",
    [switch]$NoDaemon = $true,
    [string]$ApkSuffix = ""
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

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
if ($ApkSuffix) {
    Write-Host "[nrm] APK suffix: $ApkSuffix"
}

try {
    Push-Location "$substDrive\app\android"
    $gradleArgs = @('assembleRelease')
    if ($NoDaemon) {
        $gradleArgs += '--no-daemon'
    }
    if ($ApkSuffix) {
        $gradleArgs += "-PnrmApkSuffix=$ApkSuffix"
    }
    & .\gradlew.bat @gradleArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
    cmd /c "subst $substDrive /d" 2>$null | Out-Null
}
