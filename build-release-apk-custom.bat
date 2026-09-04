@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

for /f "usebackq delims=" %%V in (`node -p "require('./app/package.json').version"`) do set "CURRENT_VERSION=%%V"
if not defined CURRENT_VERSION (
  echo 현재 버전을 확인하지 못했습니다.
  exit /b 1
)

echo 현재 버전: %CURRENT_VERSION%

:ASK_UPDATE
set "UPDATE_VERSION="
set /p "UPDATE_VERSION=버전을 올리시겠습니까? [Y/N]: "
if /i "!UPDATE_VERSION!"=="N" exit /b 0
if /i not "!UPDATE_VERSION!"=="Y" (
  echo Y 또는 N을 입력해 주세요.
  goto ASK_UPDATE
)

:ASK_VERSION
set "NRM_NEW_VERSION="
set /p "NRM_NEW_VERSION=새 버전을 입력해 주세요: "
powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidate=$env:NRM_NEW_VERSION; $current=$env:CURRENT_VERSION; if ($candidate -notmatch '^\d+\.\d+(?:\.\d+){0,2}$') { exit 2 }; $a=$current.Split('.'); $b=$candidate.Split('.'); $length=[Math]::Max($a.Length,$b.Length); for ($i=0; $i -lt $length; $i++) { $left=if ($i -lt $a.Length) { [System.Numerics.BigInteger]::Parse($a[$i]) } else { [System.Numerics.BigInteger]::Zero }; $right=if ($i -lt $b.Length) { [System.Numerics.BigInteger]::Parse($b[$i]) } else { [System.Numerics.BigInteger]::Zero }; if ($right -gt $left) { exit 0 }; if ($right -lt $left) { exit 3 } }; exit 3"
if "!ERRORLEVEL!"=="2" (
  echo 올바르지않은 버전입니다
  goto ASK_VERSION
)
if "!ERRORLEVEL!"=="3" (
  echo 입력한 버전이 현재 버전보다 높지 않습니다. 더 높은 버전을 입력해 주세요.
  goto ASK_VERSION
)
if errorlevel 1 (
  echo 버전 검사 중 오류가 발생했습니다.
  exit /b !ERRORLEVEL!
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; . '%~dp0scripts\NrmUtf8.ps1'; $version=$env:NRM_NEW_VERSION; $pkgPath='%~dp0app\package.json'; $lockPath='%~dp0app\package-lock.json'; $configPath='%~dp0app\app.config.ts'; $gradlePath='%~dp0app\android\app\build.gradle'; $jsonPattern=[regex]::new('(\x22version\x22\s*:\s*\x22)[^\x22]+(\x22)'); $pkg=Read-TextFileUtf8 -Path $pkgPath; if ($jsonPattern.Matches($pkg).Count -lt 1) { throw 'package.json version not found' }; $pkg=$jsonPattern.Replace($pkg,{param($m) $m.Groups[1].Value+$version+$m.Groups[2].Value},1); Write-TextFileUtf8NoBom -Path $pkgPath -Content $pkg; $lock=Read-TextFileUtf8 -Path $lockPath; if ($jsonPattern.Matches($lock).Count -lt 2) { throw 'package-lock.json versions not found' }; $lock=$jsonPattern.Replace($lock,{param($m) $m.Groups[1].Value+$version+$m.Groups[2].Value},2); Write-TextFileUtf8NoBom -Path $lockPath -Content $lock; $configPattern=[regex]::new('(version:\s*\x27)[^\x27]+(\x27)'); $config=Read-TextFileUtf8 -Path $configPath; if ($configPattern.Matches($config).Count -lt 1) { throw 'app.config.ts version not found' }; $config=$configPattern.Replace($config,{param($m) $m.Groups[1].Value+$version+$m.Groups[2].Value},1); Write-TextFileUtf8NoBom -Path $configPath -Content $config; $versionNamePattern=[regex]::new('(versionName\s+\x22)[^\x22]+(\x22)'); $versionCodePattern=[regex]::new('(versionCode\s+)(\d+)'); $gradle=Read-TextFileUtf8 -Path $gradlePath; if ($versionNamePattern.Matches($gradle).Count -lt 1 -or $versionCodePattern.Matches($gradle).Count -lt 1) { throw 'build.gradle version not found' }; $gradle=$versionNamePattern.Replace($gradle,{param($m) $m.Groups[1].Value+$version+$m.Groups[2].Value},1); $gradle=$versionCodePattern.Replace($gradle,{param($m) $m.Groups[1].Value+([int64]::Parse($m.Groups[2].Value)+1)},1); Write-TextFileUtf8NoBom -Path $gradlePath -Content $gradle"
if errorlevel 1 (
  echo 버전 반영에 실패했습니다.
  exit /b !ERRORLEVEL!
)

echo 새 버전 !NRM_NEW_VERSION!을 반영했습니다.
echo Y| powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Run-Build-Release-Apk-Custom.ps1" -RepoRoot "%CD%"
exit /b !ERRORLEVEL!
