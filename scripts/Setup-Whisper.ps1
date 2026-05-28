param(
    [ValidateSet("tiny-q5_1", "tiny", "base.en-q5_1", "base.en", "large-v3-turbo-q5_0", "large-v3")]
    [string]$Model = "tiny-q5_1",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$whisperDir = Join-Path $repoRoot "library/whisper"

if (-not (Test-Path $whisperDir)) {
    New-Item -ItemType Directory -Path $whisperDir | Out-Null
}

function Download-File {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )
    Write-Host "[whisper-setup] download: $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutputPath
}

function Ensure-WhisperCli {
    param(
        [string]$TargetDir,
        [switch]$ForceDownload
    )

    $cliPath = Join-Path $TargetDir "whisper-cli.exe"
    if ((Test-Path $cliPath) -and -not $ForceDownload) {
        Write-Host "[whisper-setup] whisper-cli.exe already exists."
        return
    }

    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest"
    $asset = $release.assets | Where-Object { $_.name -eq "whisper-bin-x64.zip" } | Select-Object -First 1
    if (-not $asset) {
        throw "Cannot find whisper-bin-x64.zip in latest whisper.cpp release."
    }

    $zipPath = Join-Path $env:TEMP "whisper-bin-x64.zip"
    Download-File -Url $asset.browser_download_url -OutputPath $zipPath

    $extractDir = Join-Path $env:TEMP ("whisper-bin-x64-" + [guid]::NewGuid().ToString("N"))
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $candidates = @(
        "whisper-cli.exe",
        "main.exe",
        "whisper.dll",
        "ggml.dll",
        "ggml-base.dll",
        "ggml-cpu.dll"
    )

    foreach ($name in $candidates) {
        $found = Get-ChildItem -Path $extractDir -Recurse -File -Filter $name | Select-Object -First 1
        if ($found) {
            Copy-Item -Path $found.FullName -Destination (Join-Path $TargetDir $name) -Force
        }
    }

    if (-not (Test-Path $cliPath)) {
        throw "whisper-cli.exe is not installed. Please check release asset format."
    }

    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}

function Ensure-Model {
    param(
        [string]$TargetDir,
        [string]$ModelName,
        [switch]$ForceDownload
    )

    $modelFile = "ggml-$ModelName.bin"
    $modelPath = Join-Path $TargetDir $modelFile
    if ((Test-Path $modelPath) -and -not $ForceDownload) {
        Write-Host "[whisper-setup] $modelFile already exists."
        return
    }

    $url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$modelFile?download=true"
    Download-File -Url $url -OutputPath $modelPath
}

Write-Host "[whisper-setup] target dir: $whisperDir"
Ensure-WhisperCli -TargetDir $whisperDir -ForceDownload:$Force
Ensure-Model -TargetDir $whisperDir -ModelName $Model -ForceDownload:$Force

Write-Host "[whisper-setup] done."
Write-Host "[whisper-setup] installed files:"
Get-ChildItem -Path $whisperDir -File | Select-Object Name, Length | Format-Table -AutoSize
