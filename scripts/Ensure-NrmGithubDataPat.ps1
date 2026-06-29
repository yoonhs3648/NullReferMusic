# GitHub data/*.json 쓰기용 PAT — 레거시 BuildConfig.NRM_GITHUB_DATA_PAT (Supabase 전환 후 선택)
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
    Write-Host '[nrm] GitHub data PAT not set — app uses Supabase (OK for release APK).'
    $pat = ''
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

if ($pat) {
    Write-Host '[nrm] GitHub data PAT synced to app\android\local.properties (legacy BuildConfig)'
}
else {
    Write-Host '[nrm] local.properties nrm.github.pat cleared (Supabase-only)'
}
