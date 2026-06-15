@echo off
setlocal EnableExtensions
title NRM Build Release APK

if defined NRM_REPO_ROOT (
  cd /d "%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0"
)
set "ROOT=%CD%"
set "APP=%ROOT%\app"
set "ANDROID=%APP%\android"

if not exist "%ANDROID%\gradlew.bat" (
  echo ERROR: android\gradlew.bat not found.
  pause
  exit /b 1
)

echo ======================================================
echo NullReferMusic RELEASE APK ^(standalone, no Metro^)
echo - Does NOT connect to PC dev server
echo - On-device download on Android ^(yt-dlp in APK^)
echo ======================================================
echo.

echo [0/3] Release native assets (whisper-cli, shineenc, nrm-argos-translate)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Verify-AndroidReleaseAssets.ps1"
if errorlevel 1 (
  echo.
  echo Missing assets — building native binaries...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-Whisper-AndroidCli.ps1"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Setup-AndroidShine.ps1"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Build-ArgosTranslate-Android.ps1"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Verify-AndroidReleaseAssets.ps1"
  if errorlevel 1 (
    echo.
    echo Native asset build/verify failed. See docs/RELEASE-APK-IPA-RULE.md section 6-1-a.
    pause
    exit /b 1
  )
)

cd /d "%APP%"
echo [1/3] Typecheck...
call npx tsc --noEmit
if errorlevel 1 (
  echo Typecheck failed.
  pause
  exit /b 1
)

echo [3/3] Gradle assembleRelease...
cd /d "%ANDROID%"
call gradlew.bat assembleRelease --no-daemon
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Done. APK folder:
echo   %ANDROID%\app\build\outputs\apk\release\
dir /b "%ANDROID%\app\build\outputs\apk\release\*.apk" 2>nul
echo.
echo Copy the APK to your phone and install. Use Expo Go only for live dev.
pause
endlocal
exit /b 0
