param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [string]$GithubBranch = 'main',
    [switch]$UpdateLocalJson,
    [switch]$UseRpc
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path $RepoRoot).Path
. (Join-Path $RepoRoot 'scripts\NrmUtf8.ps1')
Initialize-NrmUtf8Console

$SupabaseUrl = 'https://bwkiaapffroyveqqjhom.supabase.co'
$SupabasePublishableKey = 'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi'
$headers = @{
    apikey        = $SupabasePublishableKey
    Authorization = "Bearer $SupabasePublishableKey"
    Prefer        = 'return=minimal'
}

$adminSerial = (Get-NrmBrandAdminDefaults -RepoRoot $RepoRoot).serialNo

function ConvertTo-IsoTimestamptz {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
    $t = $Raw.Trim()
    if ($t -match '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$') {
        $t = $t -replace ' ', 'T'
        if ($t -notmatch '\.\d+$') { $t += '.000' }
        return "${t}Z"
    }
    return $t
}

function Get-GithubUserListDoc {
    param([string]$Branch)
    $uri = "https://raw.githubusercontent.com/yoonhs3648/NullReferMusic/$Branch/data/custom-apk/userList.json"
    Write-Host "Fetch GitHub: $uri"
    $raw = Invoke-RestMethod -Uri $uri -Method Get
    if ($raw -is [string]) {
        return $raw | ConvertFrom-Json
    }
    return $raw
}

function Get-SupabaseUserListRows {
    $uri = "$SupabaseUrl/rest/v1/nrm_user_list?select=id,app_name,user_name,serial_no,version,created_date,device_id,last_access_date&order=id.asc"
    return @(Invoke-RestMethod -Uri $uri -Headers $headers -Method Get)
}

function Normalize-DeviceId {
    param($Value)
    if ($null -eq $Value) { return $null }
    $s = [string]$Value
    if ($s.Length -eq 0) { return '' }
    return $s
}

function Normalize-AccessDate {
    param($Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    return [string]$Value
}

$ghDoc = Get-GithubUserListDoc -Branch $GithubBranch
$ghRows = @($ghDoc.userList)
if ($ghRows.Count -eq 0) {
    throw 'GitHub userList is empty'
}

$sbRows = Get-SupabaseUserListRows
$sbById = @{}
foreach ($r in $sbRows) { $sbById[[int]$r.id] = $r }

$patched = 0
$inserted = 0
$unchanged = 0

foreach ($row in $ghRows) {
    $id = [int]$row.id
    $deviceId = Normalize-DeviceId $row.deviceId
    $lastAccess = ConvertTo-IsoTimestamptz -Raw ([string]$row.lastAccessDate)
    $body = @{
        app_name         = [string]$row.appName
        user_name        = [string]$row.userName
        serial_no        = [string]$row.SerialNo
        version          = [string]$row.version
        created_date     = [string]$row.Createddate
        device_id        = $deviceId
        last_access_date = $lastAccess
    }

    if ($sbById.ContainsKey($id)) {
        $cur = $sbById[$id]
        $same = (
            [string]$cur.app_name -eq $body.app_name -and
            [string]$cur.user_name -eq $body.user_name -and
            [string]$cur.serial_no -eq $body.serial_no -and
            [string]$cur.version -eq $body.version -and
            [string]$cur.created_date -eq $body.created_date -and
            (Normalize-DeviceId $cur.device_id) -eq $deviceId -and
            (Normalize-AccessDate $cur.last_access_date) -eq (Normalize-AccessDate $lastAccess)
        )
        if ($same) {
            $unchanged++
            continue
        }
        Write-Host "SYNC id=$id ($($body.user_name))" -ForegroundColor Yellow
        if ($UseRpc) {
            Invoke-NrmGithubPostJsonUtf8 -Uri "$SupabaseUrl/rest/v1/rpc/nrm_rpc_admin_sync_user_list_row" -Headers $headers -BodyObject @{
                p_caller_serial    = $adminSerial
                p_id               = $id
                p_app_name         = $body.app_name
                p_user_name        = $body.user_name
                p_serial_no        = $body.serial_no
                p_version          = $body.version
                p_created_date     = $body.created_date
                p_device_id        = $deviceId
                p_last_access_date = $lastAccess
            } | Out-Null
        }
        else {
            Invoke-NrmGithubPatchJsonUtf8 -Uri "$SupabaseUrl/rest/v1/nrm_user_list?id=eq.$id" -Headers $headers -BodyObject $body | Out-Null
        }
        $patched++
    }
    else {
        Write-Host "INSERT id=$id ($($body.user_name))" -ForegroundColor Cyan
        if ($UseRpc) {
            Invoke-NrmGithubPostJsonUtf8 -Uri "$SupabaseUrl/rest/v1/rpc/nrm_rpc_admin_sync_user_list_row" -Headers $headers -BodyObject @{
                p_caller_serial    = $adminSerial
                p_id               = $id
                p_app_name         = $body.app_name
                p_user_name        = $body.user_name
                p_serial_no        = $body.serial_no
                p_version          = $body.version
                p_created_date     = $body.created_date
                p_device_id        = $deviceId
                p_last_access_date = $lastAccess
            } | Out-Null
        }
        else {
            $insertBody = $body.Clone()
            $insertBody['id'] = $id
            Invoke-NrmGithubPostJsonUtf8 -Uri "$SupabaseUrl/rest/v1/nrm_user_list" -Headers $headers -BodyObject $insertBody | Out-Null
        }
        $inserted++
    }
}

if ($UpdateLocalJson) {
    $localPath = Join-Path $RepoRoot 'data\custom-apk\userList.json'
    Write-JsonFileUtf8 -Path $localPath -InputObject $ghDoc
    Write-Host "Updated local: $localPath"
}

Write-Host ''
Write-Host "Sync done: patched=$patched inserted=$inserted unchanged=$unchanged githubRows=$($ghRows.Count) supabaseRows=$($sbRows.Count)"
