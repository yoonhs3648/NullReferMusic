param(
    [ValidateSet("tiny-q5_1", "tiny", "base.en-q5_1", "base.en", "large-v3-turbo-q5_0", "large-v3")]
    [Alias("Model")]
    [string]$WhisperProfile = "tiny-q5_1",
    [switch]$Force,
    [switch]$AndroidAssets,
    [switch]$AllCatalogModels
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

    $url = ('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{0}?download=true' -f $modelFile)
    Download-File -Url $url -OutputPath $modelPath
}

function Ensure-AndroidAssets {
    param(
        [string]$WhisperDir,
        [switch]$ForceCopy
    )

    $assetsDir = Join-Path $repoRoot "app/android/app/src/main/assets/whisper"
    if (-not (Test-Path $assetsDir)) {
        New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
    }

    # APK 용량 최소화: 모델은 APK에 넣지 않음 (기기에서 HF 다운로드 — WhisperModelDownloader.kt)
    Get-ChildItem -Path $assetsDir -File -Filter "ggml-*.bin" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "[whisper-setup] removing bundled model from APK assets: $($_.Name)"
        Remove-Item $_.FullName -Force
    }

    $winCli = Join-Path $WhisperDir "whisper-cli.exe"
    $cliDest = Join-Path $assetsDir "whisper-cli"
    if ((Test-Path $cliDest) -and -not $ForceCopy) {
        Write-Host "[whisper-setup] Android whisper-cli asset already present."
        return
    }

    $armBuild = Join-Path $repoRoot "library/whisper/_bin/android-arm64-v8a/bin/whisper-cli"
    if (Test-Path $armBuild) {
        Copy-Item -Path $armBuild -Destination $cliDest -Force
        Write-Host "[whisper-setup] copied arm64 whisper-cli -> $cliDest"
        return
    }

    Write-Host "[whisper-setup] Android whisper-cli missing in assets."
    Write-Host "[whisper-setup] Build arm64 (NDK) into library/whisper/_bin/android-arm64-v8a/bin/whisper-cli or copy to:"
    Write-Host "              $cliDest"
}

$CatalogModelNames = @(
    "large-v3-turbo-q5_0",
    "large-v3-q5_0",
    "medium-q5_0",
    "small-q5_1",
    "base-q5_1",
    "base"
)

Write-Host "[whisper-setup] target dir: $whisperDir"
Ensure-WhisperCli -TargetDir $whisperDir -ForceDownload:$Force
if ($AllCatalogModels) {
    foreach ($name in $CatalogModelNames) {
        Ensure-Model -TargetDir $whisperDir -ModelName $name -ForceDownload:$Force
    }
} else {
    Ensure-Model -TargetDir $whisperDir -ModelName $WhisperProfile -ForceDownload:$Force
}
if ($AndroidAssets) {
    Ensure-AndroidAssets -WhisperDir $whisperDir -ForceCopy:$Force
}

Write-Host "[whisper-setup] done."
Write-Host "[whisper-setup] installed files:"
Get-ChildItem -Path $whisperDir -File | Select-Object Name, Length | Format-Table -AutoSize
