# Exec path regression guard — API 29+ W^X / linker64
# 저장소 루트에서: pwsh -File scripts/Verify-ExecPaths.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$failures = @()

function Assert-NotMatch {
    param([string]$Label, [string]$Path, [string]$Pattern)
    if (-not (Test-Path $Path)) {
        $script:failures += "$Label — file missing: $Path"
        return
    }
    $content = Get-Content -Raw -Path $Path
    if ($content -match $Pattern) {
        $script:failures += "$Label — forbidden pattern in $Path : $Pattern"
    }
}

function Assert-Match {
    param([string]$Label, [string]$Path, [string]$Pattern)
    if (-not (Test-Path $Path)) {
        $script:failures += "$Label — file missing: $Path"
        return
    }
    $content = Get-Content -Raw -Path $Path
    if ($content -notmatch $Pattern) {
        $script:failures += "$Label — required pattern missing in $Path : $Pattern"
    }
}

$transcodeModule = 'app/android/app/src/main/java/com/nullrefer/music/ondevice/OnDeviceDownloadModule.kt'
$ffmpegExec = 'app/android/app/src/main/java/com/nullrefer/music/ondevice/FfmpegExec.kt'
$ffmpegTranscode = 'app/android/app/src/main/java/com/nullrefer/music/ondevice/FfmpegTranscode.kt'
$execFile = 'app/android/app/src/main/java/com/nullrefer/music/ondevice/NrmExecutableFile.kt'
$whisperBoot = 'app/android/app/src/main/java/com/nullrefer/music/ondevice/WhisperBootstrap.kt'
$whisperMod = 'app/android/app/src/main/java/com/nullrefer/music/ondevice/NrmWhisperModule.kt'
$pyBridge = 'app/android/app/src/main/python/nrm_ytdlp_bridge.py'

# transcodeAudio must NOT call Python subprocess for ffmpeg
Assert-NotMatch 'transcode-no-python' $transcodeModule 'transcode_audio'
Assert-Match 'transcode-uses-kotlin' $transcodeModule 'FfmpegTranscode\.transcode'

# Kotlin ffmpeg paths use buildExecArgv
Assert-Match 'ffmpeg-exec-argv' $ffmpegExec 'buildExecArgv'
Assert-Match 'encoder-support' $ffmpegTranscode 'FfmpegEncoderSupport\.plan'
Assert-Match 'transcode-ffmpeg-exec' $ffmpegTranscode 'FfmpegExec\.runWithPaths'
Assert-Match 'whisper-libomp' $whisperBoot 'libomp'

# W^X linker fallback + whisper probe variants
Assert-Match 'wx-fallback' $execFile 'isWxorDirectExecBlocked'
Assert-Match 'probe-help' $execFile 'PROBE_HELP'
Assert-Match 'whisper-probe' $whisperBoot 'PROBE_HELP'

# Whisper runProcess uses buildExecArgv
Assert-Match 'whisper-build-argv' $whisperMod 'buildExecArgv'

# Python defense-in-depth: linker marker
Assert-Match 'py-linker-marker' $pyBridge '_read_linker_marker'
Assert-Match 'py-build-cmd' $pyBridge '_build_ffmpeg_cmd'

if ($failures.Count -gt 0) {
    Write-Host 'Verify-ExecPaths FAILED:' -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host 'Verify-ExecPaths OK — all exec path checks passed.' -ForegroundColor Green
exit 0
