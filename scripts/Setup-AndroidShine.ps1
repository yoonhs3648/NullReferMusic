param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $repoRoot "app/android/app/src/main/assets/shine"
$ndkRoot = $env:ANDROID_NDK_HOME
if (-not $ndkRoot -and $env:ANDROID_HOME) {
    $ndkRoot = Join-Path $env:ANDROID_HOME "ndk"
}
if (-not $ndkRoot) {
    $ndkRoot = Join-Path $env:LOCALAPPDATA "Android/Sdk/ndk"
}

if (-not (Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
}

$dest = Join-Path $assetsDir "shineenc"
if ((Test-Path $dest) -and -not $Force) {
    Write-Host "[shine-setup] shineenc already exists at $dest"
    exit 0
}

$ndkVer = Get-ChildItem $ndkRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
if (-not $ndkVer) {
    throw "Android NDK not found under $ndkRoot"
}

$cc = Join-Path $ndkVer.FullName "toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android28-clang.cmd"
if (-not (Test-Path $cc)) {
    throw "NDK clang not found: $cc"
}

$work = Join-Path $env:TEMP "nrm-shine-build"
if (Test-Path $work) {
    Remove-Item $work -Recurse -Force
}

Write-Host "[shine-setup] cloning savonet/shine..."
git clone --depth 1 https://github.com/savonet/shine.git $work | Out-Null

$lib = Get-ChildItem "$work/src/lib/*.c" | ForEach-Object { $_.FullName }
$bin = Get-ChildItem "$work/src/bin/*.c" | ForEach-Object { $_.FullName }
$tmpOut = Join-Path $work "shineenc"

Write-Host "[shine-setup] building arm64-v8a shineenc (PIE, dynamic)..."
& $cc -O2 -fPIE -pie -o $tmpOut @lib @bin "-I$work/src/lib" "-I$work/src/bin" -lm
if ($LASTEXITCODE -ne 0) {
    throw "shineenc build failed"
}

Copy-Item -Path $tmpOut -Destination $dest -Force
Write-Host "[shine-setup] OK -> $dest ($((Get-Item $dest).Length) bytes)"
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
