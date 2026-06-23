# Custom release APK — interactive prompts (app name, user name, serial).
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
$WorkDir = Join-Path $RepoRoot '.build-release-apk-custom'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
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
        -Hint 'Stored in APK as SerialNo (not shown in version UI). Same character rules as user name.' `
        -Validator ${function:Test-SafeCustomField} `
        -InvalidMessage 'Invalid: max 30 chars, no ", [, ], {, } or control characters.'

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
