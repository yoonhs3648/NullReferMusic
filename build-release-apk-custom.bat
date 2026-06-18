@echo off
setlocal EnableExtensions
title NRM Build Release APK (Custom)

if defined NRM_REPO_ROOT (
  cd /d "%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0"
)
set "ROOT=%CD%"
set "APP=%ROOT%\app"
set "ANDROID=%APP%\android"
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
echo - Brand display name can be customized for one build only
echo ======================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Show-NrmReleaseApkVersion.ps1" -RepoRoot "%ROOT%"

echo.
set "DO_CUSTOM="
set /p "DO_CUSTOM=do customizing? [Y/N]: "

set "CUSTOMIZE_FLAG="

if /i "%DO_CUSTOM%"=="Y" (
  set "CUSTOMIZE_FLAG=1"
  if not exist "%WORK%" mkdir "%WORK%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$n = Read-Host 'rewrite app name'; if ([string]::IsNullOrWhiteSpace($n)) { Write-Error 'App name cannot be empty.' }; [IO.File]::WriteAllText('%WORK%\display-name.txt', $n.Trim())"
  if errorlevel 1 (
    echo.
    echo Custom name input failed.
    pause
    exit /b 1
  )
) else (
  if /i not "%DO_CUSTOM%"=="N" (
    echo.
    echo Please enter Y or N.
    pause
    exit /b 1
  )
)

echo.
if defined CUSTOMIZE_FLAG (
  for /f "usebackq delims=" %%A in ("%WORK%\display-name.txt") do (
    echo Building release APK with temporary display name: %%A
  )
) else (
  echo Building release APK with default branding ^(NullReference Music^)...
)
echo.

if defined CUSTOMIZE_FLAG (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-Release-Apk-Custom.ps1" -RepoRoot "%ROOT%" -Customize
) else (
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
