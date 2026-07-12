#Requires -Version 5.1
<#
.SYNOPSIS
  eSpeak NG Android arm64 패키지 → GitHub Release 업로드.

.DESCRIPTION
  library/espeak-ng/_bin/android-arm64-v8a/ 의
  espeak-ng, libespeak-ng.so, espeak-data.zip 을
  yoonhs3648/NullReferMusic 릴리스 espeak-ng-v2 에 올립니다.
#>
param(
    [string]$Tag = 'espeak-ng-v2',
    [string]$Repo = 'yoonhs3648/NullReferMusic',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$pkgDir = Join-Path $Root 'library\espeak-ng\_bin\android-arm64-v8a'
$files = @(
    @{ Name = 'espeak-ng'; Path = Join-Path $pkgDir 'espeak-ng' },
    @{ Name = 'libespeak-ng.so'; Path = Join-Path $pkgDir 'libespeak-ng.so' },
    @{ Name = 'espeak-data.zip'; Path = Join-Path $pkgDir 'espeak-data.zip' }
)

if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot 'Setup-EspeakNg.ps1')
}

foreach ($f in $files) {
    if (-not (Test-Path $f.Path)) {
        Write-Error "패키지 파일 없음: $($f.Path) — Setup-EspeakNg.ps1 먼저 실행"
    }
}

function Get-GitHubToken {
    $secretsPath = Join-Path $Root '.secrets\nrm-github-data.pat'
    if (Test-Path $secretsPath) {
        $fromSecrets = [System.IO.File]::ReadAllText($secretsPath).Trim()
        if ($fromSecrets) { return $fromSecrets }
    }
    $inputText = "protocol=https`nhost=github.com`n`n"
    $out = $inputText | git credential fill 2>$null
    foreach ($line in ($out -split "`n")) {
        if ($line -like 'password=*') {
            return $line.Substring(9)
        }
    }
    Write-Error 'GitHub credential 없음 — .secrets\nrm-github-data.pat 또는 git push 인증이 필요합니다.'
}

$token = Get-GitHubToken
$headers = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

$releaseBodyText = @'
NullReferMusic FA 전처리용 eSpeak NG (Android arm64-v8a, v1.52.0).
CLI와 libespeak-ng.so 는 동일 NDK 빌드 산출물입니다 (v1의 APK lib 혼용 링크 오류 수정).
앱 설정 > eSpeak NG 설치에서 다운로드합니다. 수동 삭제 금지.
'@

$releaseUrl = "https://api.github.com/repos/$Repo/releases/tags/$Tag"
$release = $null
try {
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -Method Get
    Write-Host "기존 릴리스 사용: $Tag (id=$($release.id))"
    Invoke-NrmGithubPatchJsonUtf8 -Uri "https://api.github.com/repos/$Repo/releases/$($release.id)" -Headers $headers -BodyObject @{
        body = $releaseBodyText
    } | Out-Null
} catch {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers -Method Post -Body (@{
        tag_name   = $Tag
        name       = 'eSpeak NG (Android arm64-v8a)'
        body       = $releaseBodyText
        draft      = $false
        prerelease = $false
    } | ConvertTo-Json) -ContentType 'application/json; charset=utf-8'
    Write-Host "릴리스 생성: $Tag (id=$($release.id))"
}

$uploadHeaders = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'Content-Type' = 'application/octet-stream'
}

foreach ($f in $files) {
    foreach ($asset in @($release.assets)) {
        if ($asset.name -eq $f.Name) {
            Write-Host "기존 $($f.Name) 삭제 (id=$($asset.id))"
            Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Headers $headers -Method Delete | Out-Null
        }
    }
    $fileSize = (Get-Item $f.Path).Length
    Write-Host "업로드 중: $($f.Name) ($fileSize bytes) ..."
    $uploadUri = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$($f.Name)"
    Invoke-RestMethod -Uri $uploadUri -Headers $uploadHeaders -Method Post -InFile $f.Path | Out-Null
    $publicUrl = "https://github.com/$Repo/releases/download/$Tag/$($f.Name)"
    Write-Host "OK: $publicUrl"
}

Write-Host 'eSpeak NG GitHub Release 업로드 완료.'
