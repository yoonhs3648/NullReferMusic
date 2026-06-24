param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
$AppDir = Join-Path $RepoRoot 'app'
$SecretsPath = Join-Path $RepoRoot '.secrets\nrm-github-data.pat'
$NrmGithubRepo = 'yoonhs3648/NullReferMusic'
$UserListApiUri = "https://api.github.com/repos/$NrmGithubRepo/contents/data/custom-apk/userList.json"

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Get-ReleaseVersionName {
    $pkg = Get-Content (Join-Path $AppDir 'package.json') -Raw | ConvertFrom-Json
    $gradle = Get-Content (Join-Path $AppDir 'android\app\build.gradle') -Raw
    $versionName = $pkg.version
    if ($gradle -match 'versionName\s+"([^"]+)"') {
        $versionName = $matches[1]
    }
    return $versionName
}

function Test-GithubPatFormat {
    param([string]$Raw)
    $t = $Raw.Trim()
    if (-not $t) { return $false }
    return ($t -match '^(ghp_|github_pat_)')
}

function Test-GithubPatValid {
    param([string]$Pat)
    $t = $Pat.Trim()
    if (-not (Test-GithubPatFormat $t)) { return $false }
    try {
        $headers = @{
            Authorization = "Bearer $t"
            'User-Agent'  = 'NullReferMusic-Build'
            Accept        = 'application/vnd.github+json'
        }
        Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers -Method Get -ErrorAction Stop | Out-Null
        Invoke-RestMethod -Uri $UserListApiUri -Headers $headers -Method Get -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Save-GithubPat {
    param([string]$Pat)
    $dir = Split-Path $SecretsPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Write-Utf8NoBom -Path $SecretsPath -Content $Pat.Trim()
}

function Read-CustomizeYn {
    while ($true) {
        $ans = Read-Host 'Do customizing?'
        if ($ans -match '^[Yy]$') { return $true }
        if ($ans -match '^[Nn]$') { return $false }
    }
}

function Read-GithubPat {
    while ($true) {
        $pat = Read-Host 'Input github pat'
        if (Test-GithubPatValid $pat) {
            Save-GithubPat -Pat $pat
            return $pat.Trim()
        }
        Write-Host 'Invalid github pat'
    }
}

function Test-AppName {
    param([string]$Raw)
    $t = $Raw.Trim()
    if ($t.Length -eq 0 -or $t.Length -gt 50) { return $false }
    return ($t -match '^[\p{L}\p{N}]+ [\p{L}\p{N}]+$')
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
        $line = Read-Host 'Input appName(two words)'
        if (Test-AppName $line) { return $line.Trim() }
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

function Add-UserListEntryViaGithub {
    param(
        [string]$Pat,
        [string]$AppName,
        [string]$UserName,
        [string]$SerialNo,
        [string]$Version
    )
    $headers = @{
        Authorization = "Bearer $Pat"
        'User-Agent'  = 'NullReferMusic-Build'
        Accept        = 'application/vnd.github+json'
    }

    $resp = Invoke-RestMethod -Uri $UserListApiUri -Headers $headers -Method Get
    $sha = $resp.sha
    $rawJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($resp.content -replace "`n", '')))
    $doc = @{ userList = @() }
    if ($rawJson.Trim()) {
        $parsed = $rawJson | ConvertFrom-Json
        if ($parsed.userList) {
            $doc.userList = @($parsed.userList)
        }
    }

    $maxId = 0
    foreach ($entry in $doc.userList) {
        $idNum = [int]$entry.id
        if ($idNum -gt $maxId) { $maxId = $idNum }
    }
    $newId = $maxId + 1

    $newEntry = [ordered]@{
        id             = $newId
        appName        = $AppName
        userName       = $UserName
        SerialNo       = $SerialNo
        version        = $Version
        Createddate    = (Get-Date -Format 'yyyy-MM-dd')
        deviceId       = $null
        lastAccessDate = $null
    }
    $doc.userList += $newEntry

    $json = ($doc | ConvertTo-Json -Depth 6) + "`n"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    $body = @{
        message = "custom-apk: register userList entry id=$newId (v$Version)"
        content = $b64
        sha     = $sha
    } | ConvertTo-Json -Depth 6

    Invoke-RestMethod -Uri $UserListApiUri -Headers $headers -Method Put -Body $body -ContentType 'application/json; charset=utf-8'
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
$doCustomize = Read-CustomizeYn

# ── 3. GitHub PAT ─────────────────────────────────────────────────────────────
$githubPat = Read-GithubPat

# ── 4. branding values ────────────────────────────────────────────────────────
if ($doCustomize) {
    $appName = Read-AppName
    $userName = Read-UserName
    $serialNo = Read-SerialNo
}
else {
    $appName = 'NullReference Music'
    $userName = '관리자'
    $serialNo = 'admin'
}

# ── 5. build APK ──────────────────────────────────────────────────────────────
$buildArgs = @{
    RepoRoot = $RepoRoot
}
if ($doCustomize) {
    $buildArgs['Customize'] = $true
    $buildArgs['DisplayName'] = $appName
    $buildArgs['UserName'] = $userName
    $buildArgs['SerialNo'] = $serialNo
}

& (Join-Path $RepoRoot 'scripts\Build-Release-Apk-Custom.ps1') @buildArgs
if ($LASTEXITCODE -ne 0) {
    Read-Host | Out-Null
    exit $LASTEXITCODE
}

# ── 6. success banner ─────────────────────────────────────────────────────────
Show-ApkSuccessBanner -AppName $appName -UserName $userName -SerialNo $serialNo -Version $versionName

if (-not $doCustomize) {
    Read-Host | Out-Null
    exit 0
}

# ── 7. license (customize Y only) ─────────────────────────────────────────────
1..5 | ForEach-Object { Write-Host '' }
Write-Host 'Create License...'
Write-Host ''

$licenseOk = $false
try {
    Add-UserListEntryViaGithub -Pat $githubPat -AppName $appName -UserName $userName -SerialNo $serialNo -Version $versionName
    $licenseOk = $true
}
catch {
    $licenseOk = $false
}

Show-LicenseResult -Success $licenseOk
Read-Host | Out-Null
exit 0
