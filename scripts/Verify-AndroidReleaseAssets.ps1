param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$required = @(
    @{
        Path = "app/android/app/src/main/assets/whisper/whisper-cli"
        MinBytes = 500000
        Purpose = "Whisper LRC (on-device transcription)"
    },
    @{
        Path = "app/android/app/src/main/assets/shine/shineenc"
        MinBytes = 40000
        Purpose = "MP3 encode when FFmpeg has no libshine/libmp3lame"
    },
    @{
        Path = "app/android/app/src/main/assets/libretranslate/nrm-argos-translate"
        MinBytes = 200000
        Purpose = "LibreTranslate offline translate CLI (Argos / CTranslate2)"
    },
    @{
        Path = "app/android/app/src/main/assets/libretranslate/libctranslate2.so"
        MinBytes = 1000000
        Purpose = "LibreTranslate CTranslate2 native library"
    }
)

$missing = @()
foreach ($item in $required) {
    $full = Join-Path $repoRoot $item.Path
    if (-not (Test-Path $full)) {
        $missing += "$($item.Path) — $($item.Purpose)"
        continue
    }
    $len = (Get-Item $full).Length
    if ($len -lt $item.MinBytes) {
        $missing += "$($item.Path) ($len bytes < $($item.MinBytes)) — $($item.Purpose)"
    }
}

if ($missing.Count -gt 0) {
    if (-not $Quiet) {
        Write-Host "[verify-assets] RELEASE APK requires these files in Git / assets:" -ForegroundColor Red
        foreach ($m in $missing) { Write-Host "  - $m" }
        Write-Host ""
        Write-Host "Prepare:" -ForegroundColor Yellow
        Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\Build-Whisper-AndroidCli.ps1"
        Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\Setup-AndroidShine.ps1"
        Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\Build-ArgosTranslate-Android.ps1"
        Write-Host "See docs/RELEASE-APK-IPA-RULE.md section 6-1-a."
    }
    exit 1
}

if (-not $Quiet) {
    Write-Host "[verify-assets] OK — whisper-cli, shineenc, nrm-argos-translate present."
}
exit 0
