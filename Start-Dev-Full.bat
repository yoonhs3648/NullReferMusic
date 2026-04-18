@echo off
setlocal EnableExtensions
title NRM-Dev-Full

cd /d "%~dp0"
set "NRM_ROOT=%CD%"
set "NRM_DEV_BAT=%~f0"

if not exist "%NRM_ROOT%\backend\pom.xml" (
  echo ERROR: missing backend\pom.xml
  pause
  exit /b 1
)
if not exist "%NRM_ROOT%\app\package.json" (
  echo ERROR: missing app\package.json
  pause
  exit /b 1
)

REM Desktop shortcut (create/update each run)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk=[Environment]::GetFolderPath('Desktop'); $lnk=Join-Path $desk 'NullReferMusic-Dev.lnk'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath=$env:NRM_DEV_BAT; $d=$env:NRM_ROOT; $s.WorkingDirectory=$d; $s.Description='NullReferMusic: Spring + Expo LAN (web + phone)'; $s.Save(); Write-Host ('Shortcut: ' + $lnk)"

echo.
echo === LAN IP (phone: same Wi-Fi, API http://IP:8787) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%NRM_ROOT%\scripts\Show-LanIp.ps1"

echo Starting Spring Boot :8787 ...
start "NRM-Backend" cmd.exe /k "cd /d %NRM_ROOT%\backend && mvnw.cmd spring-boot:run"

timeout /t 8 /nobreak >nul

echo Starting Expo Metro :8081 --lan (web: w or browser, phone: Expo Go QR) ...
start "NRM-Expo-LAN" cmd.exe /k "cd /d %NRM_ROOT%\app && npm run start:lan"

echo.
echo WEB:   http://127.0.0.1:8081/  (opens in ~25s) or press w in Expo window
echo PHONE: Expo Go - scan QR. Set download server http://PC_IP:8787 in app.
echo Firewall: scripts\Open-DevFirewall.ps1 as Admin if phone cannot connect.
echo Docs: docs\DEV-ANDROID-WIFI.md
echo.
echo Opening browser for web dev...
timeout /t 25 /nobreak >nul
start "" "http://127.0.0.1:8081/"

echo You can close THIS window. Keep Backend + Expo open.
timeout /t 5 /nobreak >nul
endlocal
exit /b 0
