@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NRM-StartServer

if defined NRM_REPO_ROOT (
  cd /d "%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0"
)
set "ROOT=%CD%"

if not exist "%ROOT%\backend\pom.xml" (
  echo ERROR: backend\pom.xml not found under %ROOT%
  echo Set NRM_REPO_ROOT to your clone folder, or run this .bat from repo root.
  timeout /t 8 /nobreak >nul
  exit /b 1
)
if not exist "%ROOT%\app\package.json" (
  echo ERROR: app\package.json not found under %ROOT%
  timeout /t 8 /nobreak >nul
  exit /b 1
)
if not exist "%ROOT%\app\node_modules" (
  echo ERROR: app\node_modules missing. Run Setup-Dependencies.bat once first.
  timeout /t 8 /nobreak >nul
  exit /b 1
)
if not exist "%ROOT%\scripts\resolve-lan-ip.ps1" (
  echo ERROR: scripts\resolve-lan-ip.ps1 not found.
  timeout /t 8 /nobreak >nul
  exit /b 1
)

set "LAN_IP="
set "EXPO_PUBLIC_API_BASE_URL="
for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\resolve-lan-ip.ps1"') do set "LAN_IP=%%i"
if defined LAN_IP (
  set "EXPO_PUBLIC_API_BASE_URL=http://!LAN_IP!:8787"
  echo [INFO] API for phone/Expo bundle: !EXPO_PUBLIC_API_BASE_URL!
) else (
  echo [WARN] LAN IP not found. Set download server URL in the app manually.
)

set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R /C:":8787 .*LISTENING"') do (
  set "LISTEN_PID=%%P"
  goto :BACKEND_UP
)
echo [1/2] Starting Spring Boot on 0.0.0.0:8787 ...
start "NRM Backend" cmd /k "cd /d "%ROOT%\backend" && mvnw.cmd spring-boot:run"
timeout /t 6 /nobreak >nul
goto :START_EXPO

:BACKEND_UP
echo [1/2] Backend already on :8787 ^(PID !LISTEN_PID!^).

:START_EXPO
echo [2/2] Starting Expo Metro --lan --web ^(PC web + Expo Go QR^) ...
if defined EXPO_PUBLIC_API_BASE_URL (
  start "NRM Expo" cmd /k "cd /d "%ROOT%\app" && set EXPO_PUBLIC_API_BASE_URL=!EXPO_PUBLIC_API_BASE_URL! && npx expo start --lan --web"
) else (
  start "NRM Expo" cmd /k "cd /d "%ROOT%\app" && npx expo start --lan --web"
)

echo.
echo --- NRM dev stack ---
echo   API  PC : http://localhost:8787
if defined LAN_IP echo   API  phone: http://!LAN_IP!:8787  ^(same Wi-Fi, allow firewall TCP 8787^)
echo   Web  PC : http://localhost:8081  ^(opens in ~12 sec^)
echo   Phone: scan QR in the Expo window ^(Expo Go, same Wi-Fi^)
echo.
start "" cmd /c "timeout /t 12 /nobreak >nul && start http://127.0.0.1:8081/"
echo Launcher done. Backend and Expo stay open in their windows.
timeout /t 3 /nobreak >nul
endlocal
exit /b 0
