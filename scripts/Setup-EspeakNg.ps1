#Requires -Version 5.1
<#
.SYNOPSIS
  eSpeak NG Android arm64 패키지 준비 (공식 APK 데이터 + NDK CLI).

.DESCRIPTION
  1. espeak-ng 1.52.0 공식 APK에서 libttsespeak.so · espeak-data 추출
  2. NDK로 espeak-ng CLI (arm64) 빌드 — whisper-cli 와 동일 방식
  3. library/espeak-ng/_bin/android-arm64-v8a/ 에 3개 파일 배치
     → Publish-EspeakNgGithub.ps1 로 Release 업로드
#>
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tag = '1.52.0'
$outRoot = Join-Path $repoRoot 'library\espeak-ng\_bin\android-arm64-v8a'
$outBin = Join-Path $outRoot 'espeak-ng'
$outLib = Join-Path $outRoot 'libespeak-ng.so'
$outDataZip = Join-Path $outRoot 'espeak-data.zip'
$srcDir = Join-Path $repoRoot 'library\espeak-ng\_src_espeak-ng'
$apkUrl = "https://github.com/espeak-ng/espeak-ng/releases/download/$tag/espeak-$tag-signed.apk"

function Resolve-AndroidSdk {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { return $env:ANDROID_HOME }
    $local = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (Test-Path $local) { return $local }
    throw 'Android SDK not found.'
}

function Resolve-CmakeExe {
    $sdk = Resolve-AndroidSdk
    $cmakeDir = Join-Path $sdk 'cmake'
    if (Test-Path $cmakeDir) {
        $exe = Get-ChildItem $cmakeDir -Recurse -File -Filter 'cmake.exe' -ErrorAction SilentlyContinue |
            Sort-Object { [version]($_.Directory.Parent.Name) } -Descending |
            Select-Object -First 1
        if ($exe) { return $exe.FullName }
    }
    throw 'cmake not found (Android SDK cmake).'
}

function Resolve-NdkRoot {
    if ($env:ANDROID_NDK_HOME -and (Test-Path $env:ANDROID_NDK_HOME)) { return $env:ANDROID_NDK_HOME }
    $ndkParent = Join-Path (Resolve-AndroidSdk) 'ndk'
    return (Get-ChildItem $ndkParent -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
}

function Test-Ready {
    return (Test-Path $outBin) -and (Test-Path $outLib) -and (Test-Path $outDataZip) `
        -and (Get-Item $outBin).Length -ge 50000 `
        -and (Get-Item $outLib).Length -ge 200000 `
        -and (Get-Item $outDataZip).Length -ge 5000000
}

if ((Test-Ready) -and -not $Force) {
    Write-Host "[espeak-ng] OK existing package: $outRoot"
    exit 0
}

New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

# --- 1) 공식 APK에서 lib + data ---
$work = Join-Path $env:TEMP ("nrm-espeak-pkg-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$apk = Join-Path $work 'espeak.apk'
$zip = Join-Path $work 'espeak.zip'
$unzip = Join-Path $work 'apk'

Write-Host "[espeak-ng] download official APK ..."
Invoke-WebRequest -Uri $apkUrl -OutFile $apk -UseBasicParsing
Copy-Item $apk $zip -Force
Expand-Archive $zip $unzip -Force

$libSrc = Join-Path $unzip 'lib\arm64-v8a\libttsespeak.so'
if (-not (Test-Path $libSrc)) { throw "libttsespeak.so not found in APK" }
Copy-Item $libSrc $outLib -Force
Write-Host "[espeak-ng] lib -> $outLib ($((Get-Item $outLib).Length) bytes)"

$dataZipSrc = Get-ChildItem -Path (Join-Path $unzip 'res') -Filter '*.zip' -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 1
if (-not $dataZipSrc) { throw 'espeak data zip not found in APK res/' }

$dataExtract = Join-Path $work 'data-src'
Expand-Archive $dataZipSrc.FullName $dataExtract -Force
$dataInner = Join-Path $dataExtract 'espeak-ng-data'
if (-not (Test-Path (Join-Path $dataInner 'phondata'))) {
    throw "phondata missing in $($dataZipSrc.Name)"
}

if (Test-Path $outDataZip) { Remove-Item $outDataZip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipArchive = [System.IO.Compression.ZipFile]::Open($outDataZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem -Path $dataInner -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($dataInner.Length).TrimStart('\', '/')
        $entryName = $rel -replace '\\', '/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $_.FullName, $entryName) | Out-Null
    }
} finally {
    $zipArchive.Dispose()
}
Write-Host "[espeak-ng] data zip -> $outDataZip ($((Get-Item $outDataZip).Length) bytes)"

# --- 2) NDK espeak-ng CLI ---
if (-not (Test-Path (Join-Path $srcDir '.git'))) {
    if (Test-Path $srcDir) { Remove-Item $srcDir -Recurse -Force }
    Write-Host "[espeak-ng] clone source $tag ..."
    git clone --depth 1 --branch $tag https://github.com/espeak-ng/espeak-ng.git $srcDir
}

$cmake = Resolve-CmakeExe
$ninja = Join-Path (Split-Path $cmake -Parent) 'ninja.exe'
$ndk = Resolve-NdkRoot
$toolchain = Join-Path $ndk 'build\cmake\android.toolchain.cmake'
$androidBuild = Join-Path $srcDir 'build-android-arm64'

if ($Force -and (Test-Path $androidBuild)) { Remove-Item $androidBuild -Recurse -Force }

Write-Host '[espeak-ng] NDK build espeak-ng CLI (arm64) ...'
& $cmake -G Ninja -S $srcDir -B $androidBuild `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    "-DCMAKE_MAKE_PROGRAM=$ninja" `
    -DANDROID_ABI=arm64-v8a `
    -DANDROID_PLATFORM=android-28 `
    -DCMAKE_BUILD_TYPE=Release `
    -DBUILD_SHARED_LIBS=ON `
    -DUSE_LIBPCAUDIO=OFF `
    -DUSE_MBROLA=OFF `
    -DUSE_ASYNC=OFF
if ($LASTEXITCODE -ne 0) { throw 'android cmake configure failed' }

& $cmake --build $androidBuild --target espeak-ng-bin -j
if ($LASTEXITCODE -ne 0) { throw 'android espeak-ng-bin build failed' }

$builtBin = Join-Path $androidBuild 'src\espeak-ng'
if (-not (Test-Path $builtBin)) {
    $builtBin = Get-ChildItem -Path $androidBuild -Recurse -File -Filter 'espeak-ng' -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -eq '' -and $_.Length -ge 50000 } |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $builtBin -or -not (Test-Path $builtBin)) { throw 'espeak-ng binary not found after NDK build' }
Copy-Item $builtBin $outBin -Force
Write-Host "[espeak-ng] bin -> $outBin ($((Get-Item $outBin).Length) bytes)"

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Ready)) { throw 'package validation failed' }
Write-Host "[espeak-ng] package ready: $outRoot"
