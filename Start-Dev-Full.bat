@echo off
setlocal EnableExtensions
title NRM-Dev-Full

cd /d "%~dp0"
set "NRM_ROOT=%CD%"
set "NRM_DEV_BAT=%~f0"
set "NRM_LOCK=%TEMP%\NRM-DevStack-Lock"

if not exist "%NRM_ROOT%\backend\pom.xml" (
  echo ERROR: missing backend\pom.xml
  timeout /t 6 /nobreak >nul
  exit /b 1
)
if not exist "%NRM_ROOT%\app\package.json" (
  echo ERROR: missing app\package.json
  timeout /t 6 /nobreak >nul
  exit /b 1
)

mkdir "%NRM_LOCK%" 2>nul
if errorlevel 1 (
  echo Another dev launcher may be running. Wait, or close duplicate Backend/Expo windows.
  echo If nothing is running, delete folder: %NRM_LOCK%
  timeout /t 6 /nobreak >nul
  exit /b 1
)

REM One hidden PowerShell: shortcut + LAN hint file (no extra CMD popups)
powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass ^
  -File "%NRM_ROOT%\scripts\Prepare-DevLauncher.ps1" -RepoRoot "%NRM_ROOT%" -LauncherBat "%NRM_DEV_BAT%"
if errorlevel 1 (
  rmdir "%NRM_LOCK%" 2>nul
  echo Prepare-DevLauncher.ps1 failed.
  timeout /t 6 /nobreak >nul
  exit /b 1
)

if exist "%TEMP%\NRM-LAN-HINT.txt" type "%TEMP%\NRM-LAN-HINT.txt"

echo Starting Spring Boot :8787 ...
start "NRM-Backend" cmd.exe /k "cd /d %NRM_ROOT%\backend && mvnw.cmd spring-boot:run"

timeout /t 8 /nobreak >nul

echo Starting Expo Metro :8081 --lan ...
start "NRM-Expo-LAN" cmd.exe /k "cd /d %NRM_ROOT%\app && npm run start:lan"

rmdir "%NRM_LOCK%" 2>nul

echo.
echo WEB:   http://127.0.0.1:8081/  opens in ~25 sec, or press w in Expo window
echo PHONE: Expo Go QR. App server: http://PC_IP:8787
echo.
echo Opening browser...
timeout /t 25 /nobreak >nul
start "" "http://127.0.0.1:8081/"

echo Launcher done. Backend + Expo stay open in their windows.
timeout /t 2 /nobreak >nul
endlocal
exit /b 0
