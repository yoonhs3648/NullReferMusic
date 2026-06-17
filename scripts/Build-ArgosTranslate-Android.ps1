param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsRoot = Join-Path $repoRoot "app/android/app/src/main/assets/libretranslate"
$libBinRoot = Join-Path $repoRoot "library/libretranslate/_bin"
$cmakeRoot = Join-Path $repoRoot "library/libretranslate"
$vendorRoot = Join-Path $repoRoot "library/libretranslate/_vendor"
$ct2Src = Join-Path $vendorRoot "CTranslate2"
$spmSrc = Join-Path $vendorRoot "sentencepiece"
$minBytes = 200000
$abis = @("arm64-v8a", "x86_64")

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
        if ($Submodules -and $Submodules.Count -gt 0) {
            foreach ($sm in $Submodules) {
                Write-Host "[argos-android] submodule $sm"
                git -c core.longpaths=true submodule update --init --depth 1 $sm
            }
        }
        Write-Host "[argos-android] submodule recursive (ruy/cpuinfo 등)"
        git -c core.longpaths=true submodule update --init --recursive --depth 1
    } finally {
        Pop-Location
    }
}

function Copy-OmpForAbi {
    param(
        [string]$Ndk,
        [string]$Abi,
        [string]$DestDir
    )
    $clangRoot = Join-Path $Ndk "toolchains/llvm/prebuilt/windows-x86_64/lib/clang"
    if (-not (Test-Path $clangRoot)) { return }
    $arch = switch ($Abi) {
        "x86_64" { "x86_64" }
        "armeabi-v7a" { "arm" }
        default { "aarch64" }
    }
    $ompCandidates = @()
    Get-ChildItem $clangRoot -Directory | ForEach-Object {
        $omp = Join-Path $_.FullName "lib/linux/$arch/libomp.so"
        if (Test-Path $omp) { $ompCandidates += Get-Item $omp }
    }
    if ($ompCandidates.Count -gt 0) {
        $omp = $ompCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        Copy-Item $omp.FullName (Join-Path $DestDir "libomp.so") -Force
        Write-Host "[argos-android] copied libomp.so ($Abi)"
    }
}

function Build-Abi {
    param(
        [string]$Abi,
        [string]$Ndk,
        [string]$Cmake,
        [string]$Ninja,
        [string]$Toolchain
    )
    $buildDir = Join-Path $vendorRoot "build-android-$Abi"
    if ($Force -and (Test-Path $buildDir)) {
        Remove-Item $buildDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

    Write-Host "[argos-android] cmake configure ($Abi)..."
    & $Cmake -G Ninja -S $cmakeRoot -B $buildDir `
        "-DCMAKE_TOOLCHAIN_FILE=$Toolchain" `
        "-DCMAKE_MAKE_PROGRAM=$Ninja" `
        "-DANDROID_ABI=$Abi" `
        -DANDROID_PLATFORM=android-24 `
        -DCMAKE_BUILD_TYPE=Release `
        "-DCT2_SRC_DIR=$($ct2Src -replace '\\','/')" `
        "-DSPM_SRC_DIR=$($spmSrc -replace '\\','/')" `
        -DBUILD_SHARED_LIBS=ON `
        -DCT2_BUILD_CLI=OFF `
        -DCT2_BUILD_TESTS=OFF `
        -DWITH_DNNL=OFF `
        -DWITH_MKL=OFF `
        -DWITH_RUY=ON `
        -DENABLE_GPU=OFF `
        -DOPENMP_RUNTIME=COMP

    $cacheFile = Join-Path $buildDir "CMakeCache.txt"
    if (-not (Select-String -Path $cacheFile -Pattern "WITH_RUY:BOOL=ON" -Quiet)) {
        throw "WITH_RUY must be ON (SGEMM backend required) for $Abi"
    }

    Write-Host "[argos-android] build ($Abi)..."
    & $Cmake --build $buildDir --target nrm-argos-translate -j 8

    $built = Get-ChildItem $buildDir -Recurse -File -Filter "nrm-argos-translate" -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -eq "" } |
        Select-Object -First 1
    if (-not $built) {
        throw "nrm-argos-translate binary not found under $buildDir"
    }
    if ($built.Length -lt $minBytes) {
        throw "nrm-argos-translate too small ($($built.Length) bytes) for $Abi"
    }

    $assetsAbiDir = Join-Path $assetsRoot $Abi
    $libBinAbiDir = Join-Path $libBinRoot "android-$Abi/bin"
    New-Item -ItemType Directory -Force -Path $assetsAbiDir | Out-Null
    New-Item -ItemType Directory -Force -Path $libBinAbiDir | Out-Null

    Copy-Item $built.FullName (Join-Path $assetsAbiDir "nrm-argos-translate") -Force
    Copy-Item $built.FullName (Join-Path $libBinAbiDir "nrm-argos-translate") -Force

    $soFiles = Get-ChildItem $buildDir -Recurse -File -Filter "*.so" -ErrorAction SilentlyContinue
    foreach ($so in $soFiles) {
        Copy-Item $so.FullName (Join-Path $assetsAbiDir $so.Name) -Force
        Write-Host "[argos-android] copied $($so.Name) ($Abi)"
    }
    Copy-OmpForAbi -Ndk $Ndk -Abi $Abi -DestDir $assetsAbiDir

    return $built
}

$allOk = $true
foreach ($abi in $abis) {
    $abiCli = Join-Path $assetsRoot "$abi/nrm-argos-translate"
    if ((Test-Path $abiCli) -and -not $Force) {
        $len = (Get-Item $abiCli).Length
        if ($len -ge $minBytes) {
            Write-Host "[argos-android] OK assets $abi/nrm-argos-translate ($len bytes)"
            continue
        }
    }
    $allOk = $false
}

if ($allOk -and -not $Force) {
    $legacyCli = Join-Path $assetsRoot "nrm-argos-translate"
    if (-not (Test-Path $legacyCli)) {
        Copy-Item (Join-Path $assetsRoot "arm64-v8a/nrm-argos-translate") $legacyCli -Force
        foreach ($name in @("libctranslate2.so", "libomp.so")) {
            $src = Join-Path $assetsRoot "arm64-v8a/$name"
            if (Test-Path $src) {
                Copy-Item $src (Join-Path $assetsRoot $name) -Force
            }
        }
    }
    Write-Host "[argos-android] all ABIs present"
    exit 0
}

Ensure-GitCheckout -Dir $ct2Src -Repo "https://github.com/OpenNMT/CTranslate2.git" -Tag "v3.24.0" -Submodules @(
    "third_party/cxxopts",
    "third_party/spdlog",
    "third_party/ruy",
    "third_party/cpu_features"
)
Ensure-GitCheckout -Dir $spmSrc -Repo "https://github.com/google/sentencepiece.git" -Tag "v0.2.0" -Submodules @()

$ndk = Resolve-NdkRoot
$cmake = Resolve-CmakeExe
$toolchain = Join-Path $ndk "build/cmake/android.toolchain.cmake"
if (-not (Test-Path $toolchain)) {
    throw "NDK toolchain missing: $toolchain"
}
$ninja = Join-Path (Split-Path $cmake -Parent) "ninja.exe"
if (-not (Test-Path $ninja)) { throw "ninja.exe not found next to cmake: $ninja" }

New-Item -ItemType Directory -Force -Path $assetsRoot | Out-Null

$lastBuilt = $null
$builtAbis = @()
foreach ($abi in $abis) {
    try {
        $lastBuilt = Build-Abi -Abi $abi -Ndk $ndk -Cmake $cmake -Ninja $ninja -Toolchain $toolchain
        $builtAbis += $abi
    } catch {
        if ($abi -eq "arm64-v8a") { throw }
        Write-Warning "[argos-android] $abi build failed (optional ABI): $_"
    }
}

if ($builtAbis.Count -eq 0) {
    throw "No ABI built successfully"
}

# verify 스크립트·구버전 경로 호환 — arm64를 flat 경로에도 복사
$arm64Dir = Join-Path $assetsRoot "arm64-v8a"
foreach ($name in @("nrm-argos-translate", "libctranslate2.so", "libomp.so")) {
    $src = Join-Path $arm64Dir $name
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $assetsRoot $name) -Force
    }
}

Write-Host "[argos-android] OK -> $assetsRoot (arm64-v8a + x86_64, $($lastBuilt.Length) bytes each ABI)"
