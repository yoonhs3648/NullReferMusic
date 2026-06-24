@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NRM Build Release APK (Custom)

if defined NRM_REPO_ROOT (
  cd /d "%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0"
)
set "ROOT=%CD%"
set "ANDROID=%ROOT%\app\android"
set "WORK=%ROOT%\.build-release-apk-custom"
set "BUILD_EXIT=1"

if not exist "%ANDROID%\gradlew.bat" (
  echo ERROR: android\gradlew.bat not found.
  echo Expected: %ANDROID%\gradlew.bat
  goto :finish
)

echo ======================================================
echo NullReferMusic RELEASE APK ^(custom branding optional^)
echo - Standalone APK ^(no Metro / PC dev server^)
echo - GitHub PAT required after Y/N ^(validated each build; saved to .secrets on success^)
echo - Y: custom app name, user name, serial number
echo - N: admin APK ^(NullReference Music / 관리자 / SerialNo Admin^)
echo ======================================================
echo.

call powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Show-NrmReleaseApkVersion.ps1" -RepoRoot "%ROOT%"

call powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Prompt-NrmCustomApkBuild.ps1" -RepoRoot "%ROOT%"
set "PROMPT_EXIT=!ERRORLEVEL!"
if not "!PROMPT_EXIT!"=="0" (
  echo.
  echo Input cancelled or invalid.
  set "BUILD_EXIT=!PROMPT_EXIT!"
  goto :finish
)

echo.
if exist "%WORK%\customize.flag" (
  if exist "%WORK%\display-name.txt" (
    set /p NRM_DISPLAY_NAME=<"%WORK%\display-name.txt"
    echo Building release APK with temporary display name: !NRM_DISPLAY_NAME!
  ) else (
    echo Building custom release APK...
  )
  call powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-Release-Apk-Custom.ps1" -RepoRoot "%ROOT%" -Customize
) else (
  echo Building admin APK ^(NullReference Music / SerialNo Admin^)...
  call powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-Release-Apk-Custom.ps1" -RepoRoot "%ROOT%"
)

set "BUILD_EXIT=!ERRORLEVEL!"

:finish
echo.
echo ======================================================
if "!BUILD_EXIT!"=="0" (
  echo [OK] Release APK build script finished successfully.
) else (
  echo [FAIL] Release APK build script failed. Exit code: !BUILD_EXIT!
  echo       Scroll up for error details.
)
echo ======================================================
echo.
echo This window stays open. Close it manually when you are done reviewing the log.
cmd /k
