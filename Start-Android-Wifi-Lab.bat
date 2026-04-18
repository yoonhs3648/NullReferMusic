@echo off
setlocal EnableExtensions
title NRM-Android-WiFi-Lab

cd /d C:\NullReferMusic

if not exist "C:\NullReferMusic\backend\pom.xml" (
  echo ERROR: missing backend\pom.xml
  pause
  exit /b 1
)
if not exist "C:\NullReferMusic\app\package.json" (
  echo ERROR: missing app\package.json
  pause
  exit /b 1
)

echo === LAN IP hint (PowerShell) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Show-LanIp.ps1"

echo Starting Spring Boot API :8787 ...
start "NRM-Backend-WiFi" cmd.exe /k "cd /d C:\NullReferMusic\backend && mvnw.cmd spring-boot:run"

timeout /t 8 /nobreak >nul

echo Starting Expo Metro :8081 with --lan (same Wi-Fi QR for Expo Go) ...
start "NRM-Expo-LAN" cmd.exe /k "cd /d C:\NullReferMusic\app && npm run start:lan"

echo.
echo OPEN: two windows (Backend + Expo). Keep them running.
echo PHONE: same Wi-Fi as this PC. Expo Go app - scan QR from Expo window.
echo APP: set download server to http://YOUR_PC_IP:8787 then Save + connection test.
echo If blocked: run scripts\Open-DevFirewall.ps1 as Administrator once.
echo Manual: docs\DEV-ANDROID-WIFI.md
echo.
pause
endlocal
