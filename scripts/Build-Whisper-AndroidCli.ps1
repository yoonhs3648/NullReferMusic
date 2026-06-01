param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsCli = Join-Path $repoRoot "app/android/app/src/main/assets/whisper/whisper-cli"
$libBin = Join-Path $repoRoot "library/whisper/_bin/android-arm64-v8a/bin/whisper-cli"
$minBytes = 500000

function Resolve-AndroidSdk {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { return $env:ANDROID_HOME }
    $local = Join-Path $env:LOCALAPPDATA "Android/Sdk"
    if (Test-Path $local) { return $local }
    throw "Android SDK not found. Set ANDROID_HOME or install Android Studio."
}

function Resolve-CmakeExe {
    $sdk = Resolve-AndroidSdk
    $cmakeDir = Join-Path $sdk "cmake"
    if (Test-Path $cmakeDir) {
        $exe = Get-ChildItem $cmakeDir -Recurse -File -Filter "cmake.exe" -ErrorAction SilentlyContinue |
            Sort-Object { [version]($_.Directory.Parent.Name) } -Descending |
            Select-Object -First 1
        if ($exe) { return $exe.FullName }
    }
    $cmd = Get-Command cmake -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "cmake not found. Install via Android SDK Manager (cmake;3.22.1) or add cmake to PATH."
}

function Resolve-NdkRoot {
    if ($env:ANDROID_NDK_HOME -and (Test-Path $env:ANDROID_NDK_HOME)) {
        return $env:ANDROID_NDK_HOME
    }
    $ndkParent = Join-Path (Resolve-AndroidSdk) "ndk"
    if (Test-Path $ndkParent) {
        return (Get-ChildItem $ndkParent -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
    }
    throw "Android NDK not found. Set ANDROID_NDK_HOME or install NDK via Android Studio."
}

if ((Test-Path $assetsCli) -and -not $Force) {
    $len = (Get-Item $assetsCli).Length
    if ($len -ge $minBytes) {
        Write-Host "[whisper-android] OK assets whisper-cli ($len bytes)"
        exit 0
    }
}

$ndk = Resolve-NdkRoot
$cmake = Resolve-CmakeExe
$toolchain = Join-Path $ndk "build/cmake/android.toolchain.cmake"
if (-not (Test-Path $toolchain)) {
    throw "NDK toolchain missing: $toolchain"
}

$work = Join-Path $env:TEMP ("nrm-whisper-cpp-" + [guid]::NewGuid().ToString("N"))
$buildDir = Join-Path $work "build-android"
Write-Host "[whisper-android] cloning whisper.cpp (shallow)..."
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git $work | Out-Null

$ninja = Join-Path (Split-Path $cmake -Parent) "ninja.exe"
if (-not (Test-Path $ninja)) { throw "ninja.exe not found next to cmake: $ninja" }

Write-Host "[whisper-android] cmake=$cmake ninja=$ninja"
Write-Host "[whisper-android] cmake + build whisper-cli (arm64-v8a)..."
& $cmake -G Ninja -S $work -B $buildDir `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    "-DCMAKE_MAKE_PROGRAM=$ninja" `
    -DANDROID_ABI=arm64-v8a `
    -DANDROID_PLATFORM=android-28 `
    -DCMAKE_BUILD_TYPE=Release `
    -DGGML_OPENMP=ON `
    -DBUILD_SHARED_LIBS=OFF
if ($LASTEXITCODE -ne 0) { throw "cmake configure failed" }

& $cmake --build $buildDir --config Release --target whisper-cli -j
if ($LASTEXITCODE -ne 0) { throw "cmake build failed" }

$built = Get-ChildItem -Path $buildDir -Recurse -File -Filter "whisper-cli" | Select-Object -First 1
if (-not $built) {
    throw "whisper-cli binary not found under $buildDir"
}

$assetsDir = Split-Path $assetsCli -Parent
$libDir = Split-Path $libBin -Parent
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
New-Item -ItemType Directory -Path $libDir -Force | Out-Null

Copy-Item -Path $built.FullName -Destination $assetsCli -Force
Copy-Item -Path $built.FullName -Destination $libBin -Force

$bytes = (Get-Item $assetsCli).Length
Write-Host "[whisper-android] OK -> $assetsCli ($bytes bytes)"
Write-Host "[whisper-android] mirror -> $libBin"

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

if ($bytes -lt $minBytes) {
    throw "whisper-cli too small ($bytes < $minBytes)"
}
