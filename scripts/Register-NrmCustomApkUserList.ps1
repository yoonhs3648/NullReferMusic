# Append custom APK build metadata to data/custom-apk/userList.json and push to origin.
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$AppName,
    [Parameter(Mandatory = $true)]
    [string]$UserName,
    [Parameter(Mandatory = $true)]
    [string]$SerialNo,
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$relPath = 'data/custom-apk/userList.json'
$jsonPath = Join-Path $RepoRoot ($relPath -replace '/', [IO.Path]::DirectorySeparatorChar)
$dir = Split-Path $jsonPath -Parent

if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$doc = @{ userList = @() }
if (Test-Path -LiteralPath $jsonPath) {
    $raw = Read-TextFileUtf8 -Path $jsonPath
    if ($raw.Trim()) {
        $parsed = $raw | ConvertFrom-Json
        if ($parsed.userList) {
            $doc.userList = @($parsed.userList)
        }
    }
}

$maxId = 0
foreach ($entry in $doc.userList) {
    $idNum = [int]$entry.id
    if ($idNum -gt $maxId) { $maxId = $idNum }
}

$newId = $maxId + 1
$newEntry = [ordered]@{
    id             = $newId
    appName        = $AppName
    userName       = $UserName
    SerialNo       = $SerialNo
    version        = $Version
    Createddate    = (Get-Date -Format 'yyyy-MM-dd')
    deviceId       = $null
    lastAccessDate = $null
}
$doc.userList += $newEntry

Write-JsonFileUtf8 -Path $jsonPath -InputObject $doc -Depth 6

Write-Host ""
Write-Host "[userList] Registered entry id=$newId in $relPath"

Push-Location $RepoRoot
try {
    & git add -- $relPath
    if ($LASTEXITCODE -ne 0) { throw 'git add failed' }

    $commitMsg = "custom-apk: register userList entry id=$newId (v$Version)"
    & git commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[userList] Nothing to commit (unchanged?) or commit failed.' -ForegroundColor Yellow
        exit 0
    }

    & git push origin HEAD
    if ($LASTEXITCODE -ne 0) {
        throw 'git push failed'
    }
    Write-Host "[userList] Pushed to origin."
}
catch {
    Write-Host "[userList] WARNING: Could not push to GitHub: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "           Entry saved locally at $relPath — push manually when ready."
    exit 0
}
finally {
    Pop-Location
}

exit 0
