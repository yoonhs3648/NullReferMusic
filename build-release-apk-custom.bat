@echo off
setlocal EnableExtensions
title NRM Build Release APK (Custom)

if defined NRM_REPO_ROOT (
  cd /d "%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0"
)
set "ROOT=%CD%"
set "ANDROID=%ROOT%\app\android"
set "WORK=%ROOT%\.build-release-apk-custom"

if not exist "%ANDROID%\gradlew.bat" (
  echo ERROR: android\gradlew.bat not found.
  echo Expected: %ANDROID%\gradlew.bat
  pause
  exit /b 1
)

echo ======================================================
echo NullReferMusic RELEASE APK ^(custom branding optional^)
echo - Standalone APK ^(no Metro / PC dev server^)
echo - GitHub PAT (saved in .secrets after first valid entry; reused on later builds)
echo - Y: custom app name, user name, serial number
echo - N: admin APK (NullReference Music / 관리자 / SerialNo Admin)
echo ======================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Show-NrmReleaseApkVersion.ps1" -RepoRoot "%ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Prompt-NrmCustomApkBuild.ps1" -RepoRoot "%ROOT%"
set "PROMPT_EXIT=%ERRORLEVEL%"
if not "%PROMPT_EXIT%"=="0" (
  echo.
  echo Input cancelled or invalid.
  pause
  exit /b 1
)

echo.
if exist "%WORK%\customize.flag" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$n=[IO.File]::ReadAllText('%WORK%\display-name.txt').Trim(); Write-Host ('Building release APK with temporary display name: ' + $n)"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-Release-Apk-Custom.ps1" -RepoRoot "%ROOT%" -Customize
) else (
  echo Building admin APK (NullReference Music / SerialNo Admin)...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-Release-Apk-Custom.ps1" -RepoRoot "%ROOT%"
)

set "BUILD_EXIT=%ERRORLEVEL%"

echo.
if not "%BUILD_EXIT%"=="0" (
  echo Build failed. See messages above.
  pause
  exit /b 1
)

pause
endlocal
exit /b 0
