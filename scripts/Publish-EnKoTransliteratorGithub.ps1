#Requires -Version 5.1
<#
.SYNOPSIS
  en-ko-transliterator ONNX 패키지 → GitHub Release 업로드.

.DESCRIPTION
  library/en-ko-transliterator/_bin/ 산출물을
  yoonhs3648/NullReferMusic 릴리스 en-ko-transliterator-v1 에 올립니다.
  대용량 파일은 curl로 업로드 (Invoke-RestMethod 타임아웃/끊김 회피).
#>
param(
    [string]$Tag = 'en-ko-transliterator-v2',
    [string]$Repo = 'yoonhs3648/NullReferMusic'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$BinDir = Join-Path $Root 'library\en-ko-transliterator\_bin'
$Required = @(
    'encoder.onnx',
    'decoder.onnx',
    'spiece.model',
    'unigram_pieces.tsv',
    'tokenizer_meta.json'
)

$files = @()
foreach ($name in $Required) {
    $p = Join-Path $BinDir $name
    if (-not (Test-Path $p)) {
        Write-Error "패키지 파일 없음: $p — Setup-EnKoTransliterator.ps1 먼저 실행"
    }
    $files += @{ Name = $name; Path = $p }
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
    Authorization          = "Bearer $token"
    Accept                 = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

$releaseBodyText = @'
NullReferMusic FA 전처리용 en-ko-transliterator (eunsour/en-ko-transliterator → ONNX INT8).
실행 바이너리 없음 — encoder/decoder/tokenizer 데이터만. 앱 설정 > EN→KO 발음 에서 설치.
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
            name       = 'en-ko-transliterator (ONNX INT8)'
            body       = $releaseBodyText
            draft      = $false
            prerelease = $false
        } | ConvertTo-Json) -ContentType 'application/json; charset=utf-8'
    Write-Host "릴리스 생성: $Tag (id=$($release.id))"
}

foreach ($f in $files) {
    foreach ($asset in @($release.assets)) {
        if ($asset.name -eq $f.Name) {
            Write-Host "기존 $($f.Name) 삭제 (id=$($asset.id))"
            Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Headers $headers -Method Delete | Out-Null
        }
    }
    $fileSize = (Get-Item $f.Path).Length
    Write-Host ("업로드 중: {0} ({1:N1} MB) ..." -f $f.Name, ($fileSize / 1MB))
    $uploadUri = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$($f.Name)"
    $tmpOut = Join-Path $env:TEMP ("gh-enko-upload-{0}.json" -f $f.Name)
    & curl.exe -L --fail --retry 5 --retry-all-errors --retry-delay 3 `
        -X POST `
        -H "Authorization: Bearer $token" `
        -H "Accept: application/vnd.github+json" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$($f.Path)" `
        -o $tmpOut `
        $uploadUri
    if ($LASTEXITCODE -ne 0) {
        Write-Error "업로드 실패: $($f.Name) (curl exit=$LASTEXITCODE)"
    }
    $publicUrl = "https://github.com/$Repo/releases/download/$Tag/$($f.Name)"
    Write-Host "OK: $publicUrl"
}

Write-Host 'en-ko-transliterator GitHub Release 업로드 완료.'
Write-Host "https://github.com/$Repo/releases/tag/$Tag"
