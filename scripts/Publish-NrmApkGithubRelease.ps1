#Requires -Version 5.1
<#
.SYNOPSIS
  do-custom=N 릴리스 APK → data/apkVersion.json 갱신 + GitHub Release 업로드.

.DESCRIPTION
  - Supabase nrm_apk_version INSERT
  - tag v{version} 릴리스에 NullReferenceMusic-v{version}.apk 업로드 (빌드 PC git credential)
  - 앱은 Supabase 버전 확인 + GitHub Releases APK 다운로드
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$Repo = 'yoonhs3648/NullReferMusic'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

function Get-GitHubToken {
    $inputText = "protocol=https`nhost=github.com`n`n"
    $out = $inputText | git credential fill 2>$null
    foreach ($line in ($out -split "`n")) {
        if ($line -like 'password=*') {
            return $line.Substring(9)
        }
    }
    Write-Error 'GitHub credential 없음 — git push 한 적 있는 PC에서 다시 실행하세요.'
}

$ApkOutDir = Join-Path $RepoRoot 'app\android\app\build\outputs\apk\release'
$ApkFileName = "NullReferenceMusic-v$Version.apk"
$ApkPath = Join-Path $ApkOutDir $ApkFileName
$ApkVersionPath = Join-Path $RepoRoot 'data\apkVersion.json'
$Tag = "v$Version"

if (-not (Test-Path -LiteralPath $ApkPath)) {
    $fallback = Get-ChildItem -LiteralPath $ApkOutDir -Filter '*.apk' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($fallback) {
        $ApkPath = $fallback.FullName
        Write-Host "Using APK: $($fallback.Name)"
    }
    else {
        Write-Error "Release APK not found: $ApkPath"
    }
}

$createdDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
$apkVersionDoc = [ordered]@{
    version     = $Version
    createdDate = $createdDate
}
Write-JsonFileUtf8 -Path $ApkVersionPath -InputObject $apkVersionDoc -Depth 4
Write-Host "Updated local: data/apkVersion.json ($Version, $createdDate)"

$SupabaseUrl = 'https://bwkiaapffroyveqqjhom.supabase.co'
$SupabasePublishableKey = 'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi'
$supabaseHeaders = @{
    apikey        = $SupabasePublishableKey
    Authorization = "Bearer $SupabasePublishableKey"
}
Invoke-NrmGithubPostJsonUtf8 -Uri "$SupabaseUrl/rest/v1/rpc/nrm_rpc_insert_apk_version" -Headers $supabaseHeaders -BodyObject @{
    p_version      = $Version
    p_created_date = $createdDate
} | Out-Null
Write-Host "Inserted: Supabase nrm_apk_version ($Version)"

$token = Get-GitHubToken
$headers = @{
    Authorization = "Bearer $token"
    'User-Agent'  = 'NullReferMusic-Build'
    Accept        = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

$releaseUrl = "https://api.github.com/repos/$Repo/releases/tags/$Tag"
$releaseBodyText = Get-NrmGithubReleaseApkBodyText -RepoRoot $RepoRoot
$release = $null
try {
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -Method Get
    Write-Host "Existing release: $Tag (id=$($release.id))"
}
catch {
    $release = Invoke-NrmGithubPostJsonUtf8 -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers -BodyObject @{
        tag_name   = $Tag
        name       = "NullReferMusic v$Version"
        body       = $releaseBodyText
        draft      = $false
        prerelease = $false
    }
    Write-Host "Created release: $Tag (id=$($release.id))"
}

Invoke-NrmGithubPatchJsonUtf8 -Uri "https://api.github.com/repos/$Repo/releases/$($release.id)" -Headers $headers -BodyObject @{
    name = "NullReferMusic v$Version"
    body = $releaseBodyText
} | Out-Null
Write-Host 'Updated release notes (UTF-8).'

foreach ($asset in @($release.assets)) {
    if ($asset.name -eq $ApkFileName) {
        Write-Host "Deleting old asset: $($asset.name) (id=$($asset.id))"
        Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Headers $headers -Method Delete | Out-Null
    }
}

$fileSize = (Get-Item -LiteralPath $ApkPath).Length
Write-Host "Uploading $ApkFileName ($fileSize bytes) ..."
$uploadHeaders = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'Content-Type' = 'application/octet-stream'
}
$uploadUri = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$ApkFileName"
Invoke-RestMethod -Uri $uploadUri -Headers $uploadHeaders -Method Post -InFile $ApkPath | Out-Null

$publicUrl = "https://github.com/$Repo/releases/download/$Tag/$ApkFileName"
Write-Host "OK: $publicUrl"
exit 0
