# Custom release APK — interactive prompts (GitHub PAT, app name, user name, serial).
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
$WorkDir = Join-Path $RepoRoot '.build-release-apk-custom'
$SecretsPath = Join-Path $RepoRoot '.secrets\nrm-github-data.pat'
$NrmGithubRepo = 'yoonhs3648/NullReferMusic'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
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
            Authorization  = "Bearer $t"
            'User-Agent'   = 'NullReferMusic-Build'
            Accept         = 'application/vnd.github+json'
        }
        Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers -Method Get -ErrorAction Stop | Out-Null
        Invoke-RestMethod -Uri "https://api.github.com/repos/$NrmGithubRepo/contents/data/custom-apk/userList.json" -Headers $headers -Method Get -ErrorAction Stop | Out-Null
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

function Read-ValidatedGithubPat {
    while ($true) {
        Write-Host ""
        Write-Host 'GitHub PAT is required for custom APK builds (embedded for GitHub data/*.json read/write).'
        Write-Host "Repo: $NrmGithubRepo — token needs repo contents read/write scope."
        $line = Read-Host 'GitHub PAT (ghp_... or github_pat_...)'
        if (-not (Test-GithubPatFormat $line)) {
            Write-Host 'Invalid: enter a GitHub personal access token (ghp_... or github_pat_...).' -ForegroundColor Yellow
            continue
        }
        Write-Host 'Validating GitHub PAT...'
        if (Test-GithubPatValid $line) {
            Save-GithubPat -Pat $line
            Write-Host 'GitHub PAT validated and saved to .secrets\nrm-github-data.pat'
            return $line.Trim()
        }
        Write-Host 'Invalid or unauthorized PAT. Check token scope (repo) and try again.' -ForegroundColor Yellow
    }
}

function Test-TwoWordAppName {
    param([string]$Raw)
    $t = $Raw.Trim()
    if (-not $t) { return $false }
    if ($t -match '\s{2,}') { return $false }
    $parts = $t -split '\s+'
    return ($parts.Count -eq 2 -and $parts[0].Length -gt 0 -and $parts[1].Length -gt 0)
}

function Test-SafeCustomField {
    param([string]$Raw)
    $t = $Raw.Trim()
    if (-not $t) { return $false }
    if ($t.Length -gt 30) { return $false }
    if ($t -match '["\[\]{}]') { return $false }
    if ($t -match '[\x00-\x1F\x7F]') { return $false }
    return $true
}

function Test-SerialNotReserved {
    param([string]$Raw)
    $t = $Raw.Trim()
    if ($t -ieq 'Admin') { return $false }
    return $true
}

function Read-ValidatedLine {
    param(
        [string]$Prompt,
        [string]$Hint,
        [scriptblock]$Validator,
        [string]$InvalidMessage
    )
    while ($true) {
        Write-Host ""
        if ($Hint) { Write-Host $Hint }
        $line = Read-Host $Prompt
        if (& $Validator $line) {
            return $line.Trim()
        }
        Write-Host $InvalidMessage -ForegroundColor Yellow
    }
}

if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
}

$flagPath = Join-Path $WorkDir 'customize.flag'
$namePath = Join-Path $WorkDir 'display-name.txt'
$userPath = Join-Path $WorkDir 'user-name.txt'
$serialPath = Join-Path $WorkDir 'serial-no.txt'

foreach ($p in @($flagPath, $namePath, $userPath, $serialPath)) {
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
}

Write-Host ""
$doCustom = Read-Host 'do customizing? [Y/N]'
if ($doCustom -match '^(?i)Y$') {
    $null = Read-ValidatedGithubPat

    $appName = Read-ValidatedLine `
        -Prompt 'app name (two words, one space)' `
        -Hint 'Launcher / logo name — exactly two words separated by a single space (e.g. Hyun Music).' `
        -Validator ${function:Test-TwoWordAppName} `
        -InvalidMessage 'Invalid: enter exactly two words with one space between them.'

    $userName = Read-ValidatedLine `
        -Prompt 'user name' `
        -Hint 'Up to 30 characters. No quotes or JSON brackets { } [ ].' `
        -Validator ${function:Test-SafeCustomField} `
        -InvalidMessage 'Invalid: max 30 chars, no ", [, ], {, } or control characters.'

    $serialNo = Read-ValidatedLine `
        -Prompt 'product serial number' `
        -Hint 'Stored in APK as SerialNo (not shown in version UI). Same character rules as user name. "Admin" is reserved.' `
        -Validator {
            param($line)
            (Test-SafeCustomField $line) -and (Test-SerialNotReserved $line)
        } `
        -InvalidMessage 'Invalid: max 30 chars, no quotes/brackets, and "Admin" is reserved for system use.'

    Write-Utf8NoBom -Path $flagPath -Content '1'
    Write-Utf8NoBom -Path $namePath -Content $appName
    Write-Utf8NoBom -Path $userPath -Content $userName
    Write-Utf8NoBom -Path $serialPath -Content $serialNo

    Write-Host ""
    Write-Host "Custom build: app=""$appName"", user=""$userName"", serial=""$serialNo"""
    exit 0
}

if ($doCustom -match '^(?i)N$') {
    Write-Host ""
    Write-Host 'Building with default branding (NullReference Music).'
    exit 0
}

Write-Host ""
Write-Host 'Please enter Y or N.' -ForegroundColor Red
exit 1
