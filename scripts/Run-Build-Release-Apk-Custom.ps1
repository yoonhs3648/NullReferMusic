param(

    [Parameter(Mandatory = $true)]

    [string]$RepoRoot

)



$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path $RepoRoot).Path

. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')

Initialize-NrmUtf8Console



$AppDir = Join-Path $RepoRoot 'app'

$SupabaseUrl = 'https://bwkiaapffroyveqqjhom.supabase.co'

$SupabasePublishableKey = 'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi'



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



function Read-CustomizeYn {

    while ($true) {

        $ans = Read-Host 'Do customizing?'

        if ($ans -match '^[Yy]$') { return $true }

        if ($ans -match '^[Nn]$') { return $false }

    }

}



function Test-AppName {

    param([string]$Raw)

    $t = $Raw.Trim()

    if ($t.Length -eq 0 -or $t.Length -gt 50) { return $false }

    return ($t -notmatch '[\r\n\t]')

}



function Test-CustomField {

    param([string]$Raw)

    $t = $Raw.Trim()

    if ($t.Length -eq 0 -or $t.Length -gt 50) { return $false }

    return ($t -match '^[\p{L}\p{N}]+$')

}



function Test-SerialNo {

    param([string]$Raw)

    if (-not (Test-CustomField $Raw)) { return $false }

    if ($Raw.Trim() -ieq 'admin') { return $false }

    return $true

}



function Read-AppName {

    while ($true) {

        $line = Read-Host 'Input appName'

        if (Test-AppName $line) { return $line.Trim() }

        Write-Host 'Invalid appName (1-50 chars, no line breaks)'

    }

}



function Read-UserName {

    while ($true) {

        $line = Read-Host 'Input userName'

        if (Test-CustomField $line) { return $line.Trim() }

    }

}



function Read-SerialNo {

    while ($true) {

        $line = Read-Host 'Input SerialNo'

        if (Test-SerialNo $line) { return $line.Trim() }

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



function Add-UserListEntryViaSupabase {

    param(

        [string]$AppName,

        [string]$UserName,

        [string]$SerialNo,

        [string]$Version

    )

    $headers = @{

        apikey        = $SupabasePublishableKey

        Authorization = "Bearer $SupabasePublishableKey"

    }

    Invoke-NrmGithubPostJsonUtf8 -Uri "$SupabaseUrl/rest/v1/rpc/nrm_rpc_insert_user_list" -Headers $headers -BodyObject @{

        p_app_name     = $AppName

        p_user_name    = $UserName

        p_serial_no    = $SerialNo

        p_version      = $Version

        p_created_date = (Get-Date -Format 'yyyy-MM-dd')

    } | Out-Null

}



function Show-LicenseResult {

    param([bool]$Success)

    Write-Host ''

    if ($Success) {

        Write-Host '  +--------------------------------------+' -ForegroundColor Green

        Write-Host '  |      Create License SUCCESS!         |' -ForegroundColor Green

        Write-Host '  +--------------------------------------+' -ForegroundColor Green

    }

    else {

        Write-Host '  +--------------------------------------+' -ForegroundColor Red

        Write-Host '  |      Create License Fail...          |' -ForegroundColor Red

        Write-Host '  +--------------------------------------+' -ForegroundColor Red

    }

    Write-Host ''

}



# ── 1. version ────────────────────────────────────────────────────────────────

$versionName = Get-ReleaseVersionName

Write-Host "version : $versionName"

Write-Host ''



# ── 2. customizing Y/N ───────────────────────────────────────────────────────

$userChoseCustomize = Read-CustomizeYn

$doCustomize = $userChoseCustomize



# ── 3. branding values ────────────────────────────────────────────────────────

$adminDefaults = Get-NrmBrandAdminDefaults -RepoRoot $RepoRoot

if ($doCustomize) {

    $appName = Read-AppName

    if ($appName -ieq 'admin') {

        $appName = $adminDefaults.displayName

        $userName = $adminDefaults.userName

        $serialNo = $adminDefaults.serialNo

        $doCustomize = $false

        Write-Host 'appName=admin → admin APK (local build only; GitHub Release upload skipped)'

        Write-Host ''

    }

    else {

        $userName = Read-UserName

        $serialNo = Read-SerialNo

    }

}

else {

    $appName = $adminDefaults.displayName

    $userName = $adminDefaults.userName

    $serialNo = $adminDefaults.serialNo

}



# ── 4. build APK ──────────────────────────────────────────────────────────────

$buildArgs = @{

    RepoRoot = $RepoRoot

}

if ($doCustomize) {

    $buildArgs['Customize'] = $true

    # appName은 user_list legacy 등록용. APK displayName bake에는 넣지 않음.
    $buildArgs['UserName'] = $userName

    $buildArgs['SerialNo'] = $serialNo

}



& (Join-Path $RepoRoot 'scripts\Build-Release-Apk-Custom.ps1') @buildArgs

if ($LASTEXITCODE -ne 0) {

    Read-Host | Out-Null

    exit $LASTEXITCODE

}



# ── 5. success banner ─────────────────────────────────────────────────────────

Show-ApkSuccessBanner -AppName $appName -UserName $userName -SerialNo $serialNo -Version $versionName



if (-not $userChoseCustomize) {

    Write-Host ''

    Write-Host 'Publishing release APK to GitHub + Supabase apk version...'

    & (Join-Path $RepoRoot 'scripts\Publish-NrmApkGithubRelease.ps1') -RepoRoot $RepoRoot -Version $versionName

    if ($LASTEXITCODE -ne 0) {

        Write-Host 'GitHub release publish failed.' -ForegroundColor Red

    }

    Read-Host | Out-Null

    exit 0

}



Write-Host ''

Write-Host 'GitHub Release upload skipped (Do customizing=Y → local APK only).' -ForegroundColor Cyan

Write-Host ''



# ── 6. license (customize Y + custom user only) ───────────────────────────────

if (-not $doCustomize) {

    Read-Host | Out-Null

    exit 0

}

1..5 | ForEach-Object { Write-Host '' }

Write-Host 'Create License (Supabase nrm_user_list)...'

Write-Host ''



$licenseOk = $false

try {

    Add-UserListEntryViaSupabase -AppName $appName -UserName $userName -SerialNo $serialNo -Version $versionName

    $licenseOk = $true

}

catch {

    $licenseOk = $false

}



Show-LicenseResult -Success $licenseOk

Read-Host | Out-Null

exit 0

