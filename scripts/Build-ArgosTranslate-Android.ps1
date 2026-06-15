param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsCli = Join-Path $repoRoot "app/android/app/src/main/assets/libretranslate/nrm-argos-translate"
$libBin = Join-Path $repoRoot "library/libretranslate/_bin/android-arm64-v8a/bin/nrm-argos-translate"
$cmakeRoot = Join-Path $repoRoot "library/libretranslate"
$vendorRoot = Join-Path $repoRoot "library/libretranslate/_vendor"
$ct2Src = Join-Path $vendorRoot "CTranslate2"
$spmSrc = Join-Path $vendorRoot "sentencepiece"
$minBytes = 200000

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

function Ensure-GitCheckout {
    param(
        [string]$Dir,
        [string]$Repo,
        [string]$Tag,
        [string[]]$Submodules
    )
    New-Item -ItemType Directory -Force -Path (Split-Path $Dir -Parent) | Out-Null
    if (-not (Test-Path (Join-Path $Dir ".git"))) {
        if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force }
        Write-Host "[argos-android] clone $Repo ($Tag)..."
        git -c core.longpaths=true clone --depth 1 --branch $Tag $Repo $Dir
    }
    Push-Location $Dir
    try {
        git -c core.longpaths=true submodule sync --recursive 2>$null
        foreach ($sm in $Submodules) {
            Write-Host "[argos-android] submodule $sm"
            git -c core.longpaths=true submodule update --init --depth 1 $sm
        }
    } finally {
        Pop-Location
    }
}

if ((Test-Path $assetsCli) -and -not $Force) {
    $len = (Get-Item $assetsCli).Length
    if ($len -ge $minBytes) {
        Write-Host "[argos-android] OK assets nrm-argos-translate ($len bytes)"
        exit 0
    }
}

Ensure-GitCheckout -Dir $ct2Src -Repo "https://github.com/OpenNMT/CTranslate2.git" -Tag "v3.24.0" -Submodules @(
    "third_party/cxxopts",
    "third_party/spdlog",
    "third_party/ruy"
)
Ensure-GitCheckout -Dir $spmSrc -Repo "https://github.com/google/sentencepiece.git" -Tag "v0.2.0" -Submodules @()

$ndk = Resolve-NdkRoot
$cmake = Resolve-CmakeExe
$toolchain = Join-Path $ndk "build/cmake/android.toolchain.cmake"
if (-not (Test-Path $toolchain)) {
    throw "NDK toolchain missing: $toolchain"
}

$buildDir = Join-Path $vendorRoot "build-android-arm64"
if ($Force -and (Test-Path $buildDir)) {
    Remove-Item $buildDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$ninja = Join-Path (Split-Path $cmake -Parent) "ninja.exe"
if (-not (Test-Path $ninja)) { throw "ninja.exe not found next to cmake: $ninja" }

Write-Host "[argos-android] cmake configure..."
& $cmake -G Ninja -S $cmakeRoot -B $buildDir `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    "-DCMAKE_MAKE_PROGRAM=$ninja" `
    -DANDROID_ABI=arm64-v8a `
    -DANDROID_PLATFORM=android-24 `
    -DCMAKE_BUILD_TYPE=Release `
    -DCT2_SRC_DIR="$($ct2Src -replace '\\','/')" `
    -DSPM_SRC_DIR="$($spmSrc -replace '\\','/')" `
    -DBUILD_SHARED_LIBS=ON `
    -DCT2_BUILD_CLI=OFF `
    -DCT2_BUILD_TESTS=OFF `
    -DWITH_DNNL=OFF `
    -DWITH_MKL=OFF `
    -DENABLE_GPU=OFF `
    -DOPENMP_RUNTIME=COMP

Write-Host "[argos-android] build..."
& $cmake --build $buildDir --target nrm-argos-translate -j 8

$built = Get-ChildItem $buildDir -Recurse -File -Filter "nrm-argos-translate" -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -eq "" } |
    Select-Object -First 1
if (-not $built) {
    throw "nrm-argos-translate binary not found under $buildDir"
}
$lenBuilt = $built.Length
if ($lenBuilt -lt $minBytes) {
    throw "nrm-argos-translate too small ($lenBuilt bytes)"
}

$assetsDir = Split-Path $assetsCli -Parent
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $libBin -Parent) | Out-Null
Copy-Item $built.FullName $assetsCli -Force
Copy-Item $built.FullName $libBin -Force

$soFiles = Get-ChildItem $buildDir -Recurse -File -Filter "*.so" -ErrorAction SilentlyContinue
foreach ($so in $soFiles) {
    Copy-Item $so.FullName (Join-Path $assetsDir $so.Name) -Force
    Write-Host "[argos-android] copied $($so.Name)"
}

Write-Host "[argos-android] OK -> $assetsCli ($lenBuilt bytes)"

# OpenMP 런타임 (CTranslate2 / whisper 와 동일)
$sdk = Resolve-AndroidSdk
$ndk = Resolve-NdkRoot
$clangRoot = Join-Path $ndk "toolchains/llvm/prebuilt/windows-x86_64/lib/clang"
$ompCandidates = @()
if (Test-Path $clangRoot) {
    Get-ChildItem $clangRoot -Directory | ForEach-Object {
        $omp = Join-Path $_.FullName "lib/linux/aarch64/libomp.so"
        if (Test-Path $omp) { $ompCandidates += Get-Item $omp }
    }
}
if ($ompCandidates.Count -gt 0) {
    $omp = $ompCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Copy-Item $omp.FullName (Join-Path $assetsDir "libomp.so") -Force
    Write-Host "[argos-android] copied libomp.so"
}
