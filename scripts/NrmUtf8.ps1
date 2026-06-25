# UTF-8 helpers for custom APK build scripts (PowerShell 5.1+ on Windows).
# Dot-source: . (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')

function Initialize-NrmUtf8Console {
    try {
        chcp 65001 | Out-Null
    }
    catch {
        # ignore
    }
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $script:OutputEncoding = $utf8
}

function Read-TextFileUtf8 {
    param([Parameter(Mandatory)][string]$Path)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    return [System.IO.File]::ReadAllText($Path, $utf8)
}

function Write-TextFileUtf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Content
    )
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Read-JsonFileUtf8 {
    param([Parameter(Mandatory)][string]$Path)
    $raw = Read-TextFileUtf8 -Path $Path
    if (-not $raw.Trim()) { return $null }
    return $raw | ConvertFrom-Json
}

function ConvertTo-NrmJson {
    param(
        [Parameter(Mandatory)]$InputObject,
        [int]$Depth = 6,
        [switch]$Compress
    )
    if ($Compress) {
        return ($InputObject | ConvertTo-Json -Depth $Depth -Compress)
    }
    return ($InputObject | ConvertTo-Json -Depth $Depth)
}

function Write-JsonFileUtf8 {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)]$InputObject,
        [int]$Depth = 6
    )
    $json = ConvertTo-NrmJson -InputObject $InputObject -Depth $Depth
    Write-TextFileUtf8NoBom -Path $Path -Content ($json + "`n")
}

function Get-NrmBrandAdminDefaults {
    param([Parameter(Mandatory)][string]$RepoRoot)
    $path = Join-Path $RepoRoot 'scripts\data\brand-admin-defaults.json'
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing brand admin defaults: $path"
    }
    $doc = Read-JsonFileUtf8 -Path $path
    return [ordered]@{
        displayName = [string]$doc.displayName
        userName    = [string]$doc.userName
        serialNo    = [string]$doc.serialNo
    }
}

function Invoke-NrmGithubPutJsonUtf8 {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)]$BodyObject
    )
    $bodyJson = ConvertTo-NrmJson -InputObject $BodyObject -Depth 10 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
    return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Put -Body $bodyBytes -ContentType 'application/json; charset=utf-8'
}
