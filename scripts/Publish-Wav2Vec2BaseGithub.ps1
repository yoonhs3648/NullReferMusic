#Requires -Version 5.1
<#
.SYNOPSIS
  wav2vec2-base model.onnx → GitHub Release 업로드 (HF 토큰 불필요).

.DESCRIPTION
  library/wav2vec2-base-int8/model.onnx 를
  yoonhs3648/NullReferMusic 릴리스에 올립니다.
  앱은 releases/download URL 로 폰에서 직접 다운로드합니다.
#>
param(
    [string]$Tag = 'align-wav2vec2-base-v1',
    [string]$Repo = 'yoonhs3648/NullReferMusic',
    [switch]$SkipExport
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ModelOut = Join-Path $Root 'library\wav2vec2-base-int8\model.onnx'

if (-not $SkipExport -and -not (Test-Path $ModelOut)) {
    & (Join-Path $PSScriptRoot 'Export-Wav2Vec2BaseInt8Onnx.ps1')
}
if (-not (Test-Path $ModelOut)) {
    Write-Error "model.onnx 없음: $ModelOut"
}

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

$token = Get-GitHubToken
$headers = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

$releaseUrl = "https://api.github.com/repos/$Repo/releases/tags/$Tag"
$release = $null
try {
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -Method Get
    Write-Host "기존 릴리스 사용: $Tag (id=$($release.id))"
} catch {
    $body = @{
        tag_name = $Tag
        name     = 'wav2vec2-base Forced Alignment ONNX'
        body     = 'NullReferMusic FA용 Kkonjeong/wav2vec2-base-korean ONNX (~380MB). 앱 전용 — 수동 삭제 금지.'
        draft    = $false
        prerelease = $false
    } | ConvertTo-Json
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers -Method Post -Body $body -ContentType 'application/json; charset=utf-8'
    Write-Host "릴리스 생성: $Tag (id=$($release.id))"
}

foreach ($asset in @($release.assets)) {
    if ($asset.name -eq 'model.onnx') {
        Write-Host "기존 model.onnx 에셋 삭제 (id=$($asset.id))"
        Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Headers $headers -Method Delete | Out-Null
    }
}

$fileSize = (Get-Item $ModelOut).Length
Write-Host "업로드 중: $ModelOut ($fileSize bytes) ..."
$uploadHeaders = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'Content-Type' = 'application/octet-stream'
}
$uploadUri = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=model.onnx"
Invoke-RestMethod -Uri $uploadUri -Headers $uploadHeaders -Method Post -InFile $ModelOut | Out-Null

$publicUrl = "https://github.com/$Repo/releases/download/$Tag/model.onnx"
Write-Host "OK: $publicUrl"
