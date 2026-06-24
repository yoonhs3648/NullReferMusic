# Custom / default release APK build — temporarily overrides nrm-brand.config.json displayName only.
# Source config is always restored in finally (no permanent repo changes).
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [switch]$Customize
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path $RepoRoot).Path
$AppDir = Join-Path $RepoRoot 'app'
$AndroidDir = Join-Path $AppDir 'android'
$BrandConfigPath = Join-Path $AppDir 'nrm-brand.config.json'
$WorkDir = Join-Path $RepoRoot '.build-release-apk-custom'
$ApkOutDir = Join-Path $AndroidDir 'app\build\outputs\apk\release'

if (-not (Test-Path (Join-Path $AndroidDir 'gradlew.bat'))) {
    Write-Error "android\gradlew.bat not found under $RepoRoot"
}

function Get-ReleaseVersionInfo {
    $pkg = Get-Content (Join-Path $AppDir 'package.json') -Raw | ConvertFrom-Json
    $gradle = Get-Content (Join-Path $AppDir 'android\app\build.gradle') -Raw
    $versionName = $pkg.version
    $versionCode = ''
    if ($gradle -match 'versionName\s+"([^"]+)"') {
        $versionName = $matches[1]
    }
    if ($gradle -match 'versionCode\s+(\d+)') {
        $versionCode = $matches[1]
    }
    return [PSCustomObject]@{
        PackageVersion = $pkg.version
        VersionName    = $versionName
        VersionCode    = $versionCode
    }
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

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Restore-BrandConfig {
    param([string]$OriginalJson)
    if (-not $OriginalJson) { return }
    Write-Utf8NoBom -Path $BrandConfigPath -Content $OriginalJson
    Invoke-Npm @('run', 'sync:brand')
}

$originalBrandJson = Get-Content -LiteralPath $BrandConfigPath -Raw -Encoding UTF8
$buildFailed = $false

try {
    if ($Customize) {
        $namePath = Join-Path $WorkDir 'display-name.txt'
        $serialPath = Join-Path $WorkDir 'serial-no.txt'
        $userPath = Join-Path $WorkDir 'user-name.txt'
        if (-not (Test-Path -LiteralPath $namePath)) {
            throw "Custom display name file not found: $namePath"
        }
        if (-not (Test-Path -LiteralPath $serialPath)) {
            throw "Custom serial number file not found: $serialPath"
        }
        if (-not (Test-Path -LiteralPath $userPath)) {
            throw "Custom user name file not found: $userPath"
        }
        $name = [System.IO.File]::ReadAllText($namePath).Trim()
        $serialNo = [System.IO.File]::ReadAllText($serialPath).Trim()
        $userName = [System.IO.File]::ReadAllText($userPath).Trim()
        if (-not $name) {
            throw 'Custom display name is empty.'
        }
        if (-not $serialNo) {
            throw 'Custom serial number is empty.'
        }
        if (-not $userName) {
            throw 'Custom user name is empty.'
        }
        $cfg = $originalBrandJson | ConvertFrom-Json
        $cfg.displayName = $name
        $cfg.serialNo = $serialNo
        $cfg.userName = $userName
        Write-Utf8NoBom -Path $BrandConfigPath -Content ($cfg | ConvertTo-Json -Depth 5)
        Write-Host ""
        Write-Host "[brand] Temporary display name for this build: $name"
        Write-Host "[brand] SerialNo embedded in APK (NrmBrand.SERIAL_NO); not shown in version UI."
        Write-Host "[brand] UserName embedded in APK (NrmBrand.USER_NAME); not shown in version UI."
        Write-Host "[brand] Version info label stays versionInfoProductName (default NullReference Music)."
    }
    else {
        Write-Host ""
        Write-Host "[brand] Admin APK — NullReference Music / user=관리자 / SerialNo=Admin"
        $cfg = $originalBrandJson | ConvertFrom-Json
        $cfg.displayName = 'NullReference Music'
        $cfg.serialNo = 'Admin'
        $cfg.userName = '관리자'
        $cfg.versionInfoAdminBuild = $true
        Write-Utf8NoBom -Path $BrandConfigPath -Content ($cfg | ConvertTo-Json -Depth 5)
        Write-Host "[brand] SerialNo embedded in APK (NrmBrand.SERIAL_NO); license check skipped at runtime."
        Write-Host "[brand] UserName embedded in APK (NrmBrand.USER_NAME)."
    }

    Write-Host ""
    Write-Host "[0/4] Release native assets (whisper-cli, shineenc, nrm-argos-translate)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Verify-AndroidReleaseAssets.ps1')
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Missing assets — building native binaries..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Build-Whisper-AndroidCli.ps1')
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Setup-AndroidShine.ps1')
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Build-ArgosTranslate-Android.ps1')
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Verify-AndroidReleaseAssets.ps1')
        if ($LASTEXITCODE -ne 0) {
            throw 'Native asset build/verify failed. See docs/RELEASE-APK-IPA-RULE.md section 6-1-a.'
        }
    }

    Write-Host "[1/5] Brand sync (nrm-brand.config.json)..."
    Invoke-Npm @('run', 'sync:brand')

    Write-Host "[2/5] Typecheck..."
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

    Write-Host "[3/5] Music quotes from Excel (data\nrm-music-quotes.xlsx)..."
    Invoke-Npm @('run', 'generate:music-quotes')

    if ($Customize) {
        Write-Host "[4/5] Gradle assembleRelease (force rebundle for custom branding)..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Invoke-NrmAndroidReleaseBuild.ps1') -RepoRoot $RepoRoot -ApkVariant 'custom' -ForceRebundle
    }
    else {
        Write-Host "[4/5] Gradle assembleRelease (force rebundle for admin branding)..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Invoke-NrmAndroidReleaseBuild.ps1') -RepoRoot $RepoRoot -ApkVariant 'admin' -ForceRebundle
    }
    if ($LASTEXITCODE -ne 0) {
        throw 'Gradle assembleRelease failed.'
    }
}
catch {
    $buildFailed = $true
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Write-Host ""
    Write-Host "[restore] Reverting nrm-brand.config.json and synced brand files..."
    try {
        Restore-BrandConfig -OriginalJson $originalBrandJson
        Write-Host "[restore] Brand config restored to pre-build state."
    }
    catch {
        Write-Host "WARNING: Could not restore brand config automatically: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "         Check app\nrm-brand.config.json and run: cd app && npm run sync:brand"
    }
}

Write-Host ""
if ($buildFailed) {
    Write-Host "Build failed. Brand config was restored (if possible)." -ForegroundColor Red
    exit 1
}

$apkFiles = @()
if (Test-Path $ApkOutDir) {
    $apkFiles = Get-ChildItem -LiteralPath $ApkOutDir -Filter '*.apk' -File | Sort-Object LastWriteTime -Descending
}

Write-Host "======================================================"
Write-Host "Release APK build completed successfully."
Write-Host "======================================================"
$ver = Get-ReleaseVersionInfo
Write-Host "Version: $($ver.VersionName) (versionCode $($ver.VersionCode))"
Write-Host ""
Write-Host "APK output directory:"
Write-Host "  $ApkOutDir"
Write-Host ""

if ($apkFiles.Count -eq 0) {
    Write-Host "WARNING: No .apk files found in the output directory." -ForegroundColor Yellow
    exit 1
}

Write-Host "Generated APK file(s):"
foreach ($apk in $apkFiles) {
    Write-Host "  $($apk.FullName)"
}

if ($Customize) {
    $userPath = Join-Path $WorkDir 'user-name.txt'
    $namePath = Join-Path $WorkDir 'display-name.txt'
    $serialPath = Join-Path $WorkDir 'serial-no.txt'
    if ((Test-Path -LiteralPath $userPath) -and (Test-Path -LiteralPath $namePath) -and (Test-Path -LiteralPath $serialPath)) {
        $regAppName = [System.IO.File]::ReadAllText($namePath).Trim()
        $regUserName = [System.IO.File]::ReadAllText($userPath).Trim()
        $regSerialNo = [System.IO.File]::ReadAllText($serialPath).Trim()
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\Register-NrmCustomApkUserList.ps1') `
            -RepoRoot $RepoRoot `
            -AppName $regAppName `
            -UserName $regUserName `
            -SerialNo $regSerialNo `
            -Version $ver.VersionName
    }
    else {
        Write-Host "[userList] WARNING: Custom metadata files missing; skipped userList registration." -ForegroundColor Yellow
    }
}

exit 0
