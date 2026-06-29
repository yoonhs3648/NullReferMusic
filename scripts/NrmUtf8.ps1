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

function Get-NrmGithubReleaseApkBodyText {
    param([Parameter(Mandatory)][string]$RepoRoot)
    $path = Join-Path $RepoRoot 'scripts\data\github-release-apk-body.md'
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing GitHub release body template: $path"
    }
    return (Read-TextFileUtf8 -Path $path).Trim()
}

function Invoke-NrmGithubJsonUtf8 {
    param(
        [Parameter(Mandatory)][ValidateSet('POST', 'PUT', 'PATCH')]
        [string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)]$BodyObject
    )
    $bodyJson = ConvertTo-NrmJson -InputObject $BodyObject -Depth 10 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)

    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = $Method
    $request.ContentType = 'application/json; charset=utf-8'
    $request.ContentLength = $bodyBytes.Length
    foreach ($key in $Headers.Keys) {
        $k = [string]$key
        $v = [string]$Headers[$key]
        if ($k -ieq 'Content-Type') { continue }
        if ($k -ieq 'Accept') {
            $request.Accept = $v
            continue
        }
        if ($k -ieq 'User-Agent') {
            $request.UserAgent = $v
            continue
        }
        if ($k -ieq 'Authorization') {
            $request.Headers.Add('Authorization', $v) | Out-Null
            continue
        }
        $request.Headers.Add($k, $v) | Out-Null
    }
    $stream = $request.GetRequestStream()
    try {
        $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    }
    finally {
        $stream.Close()
    }
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), ([System.Text.UTF8Encoding]::new($false)))
        $text = $reader.ReadToEnd()
        $reader.Close()
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return $text | ConvertFrom-Json
    }
    finally {
        $response.Close()
    }
}

function Invoke-NrmGithubPutJsonUtf8 {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)]$BodyObject
    )
    return Invoke-NrmGithubJsonUtf8 -Method PUT -Uri $Uri -Headers $Headers -BodyObject $BodyObject
}

function Invoke-NrmGithubPostJsonUtf8 {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)]$BodyObject
    )
    return Invoke-NrmGithubJsonUtf8 -Method POST -Uri $Uri -Headers $Headers -BodyObject $BodyObject
}

function Invoke-NrmGithubPatchJsonUtf8 {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][hashtable]$Headers,
        [Parameter(Mandatory)]$BodyObject
    )
    return Invoke-NrmGithubJsonUtf8 -Method PATCH -Uri $Uri -Headers $Headers -BodyObject $BodyObject
}
