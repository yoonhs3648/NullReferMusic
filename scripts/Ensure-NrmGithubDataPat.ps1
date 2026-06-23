# GitHub data/*.json 쓰기용 PAT — APK BuildConfig.NRM_GITHUB_DATA_PAT 에 주입
# 소스(우선순위): 환경변수 NRM_GITHUB_DATA_PAT > .secrets/nrm-github-data.pat
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path

$secretsPath = Join-Path $RepoRoot '.secrets\nrm-github-data.pat'
$localPropsPath = Join-Path $RepoRoot 'app\android\local.properties'

function Get-PatFromEnvOrSecrets {
    $fromEnv = [Environment]::GetEnvironmentVariable('NRM_GITHUB_DATA_PAT')
    if ($fromEnv -and $fromEnv.Trim()) {
        return $fromEnv.Trim()
    }
    if (-not (Test-Path -LiteralPath $secretsPath)) {
        return ''
    }
    return [System.IO.File]::ReadAllText($secretsPath).Trim()
}

$pat = Get-PatFromEnvOrSecrets
if (-not $pat) {
    throw @"
GitHub data PAT is not configured.

문의하기·알림 등록 등 GitHub data/*.json 쓰기는 APK 빌드 시 PAT가 내장되어야 합니다.

다음 중 하나를 설정한 뒤 릴리스 APK를 다시 빌드하세요:
  1) $secretsPath  (한 줄, ghp_... — Git에 커밋 금지)
  2) 환경변수 NRM_GITHUB_DATA_PAT

예시 파일: .secrets/nrm-github-data.pat.example
문서: docs/RELEASE-APK-IPA-RULE.md §6-1-c, docs/NRM-GITHUB-DATA.md
"@
}

$lines = New-Object System.Collections.Generic.List[string]
if (Test-Path -LiteralPath $localPropsPath) {
    foreach ($line in [System.IO.File]::ReadAllLines($localPropsPath)) {
        if ($line -match '^\s*nrm\.github\.pat\s*=') { continue }
        if ($line.Trim()) { [void]$lines.Add($line) }
    }
}
[void]$lines.Add("nrm.github.pat=$pat")

$dir = Split-Path $localPropsPath -Parent
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($localPropsPath, $lines.ToArray(), $utf8NoBom)

Write-Host "[nrm] GitHub data PAT synced to app\android\local.properties (BuildConfig.NRM_GITHUB_DATA_PAT)"
