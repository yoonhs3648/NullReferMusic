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
  echo ERROR: app\node_modules missing. Run: cd app ^&^& npm install
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
if defined LAN_IP set "LAN_IP=!LAN_IP: =!"
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
if defined LAN_IP (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Show-ExpoGo-Url.ps1" -LanIp "!LAN_IP!"
) else (
  echo [WARN] LAN IP unknown. Expo Go URL may be exp://YOUR_PC_IP:8081
)
echo [2/2] Starting Metro for Expo Go ^(exp:// QR^) ...
if defined LAN_IP (
  set "NRM_LAN_IP=!LAN_IP!"
) else (
  set "NRM_LAN_IP=127.0.0.1"
)

set "EXPO_CMD=cd /d "%ROOT%\app""
if defined EXPO_PUBLIC_API_BASE_URL set "EXPO_CMD=!EXPO_CMD! && set EXPO_PUBLIC_API_BASE_URL=!EXPO_PUBLIC_API_BASE_URL!"
if not "!NRM_LAN_IP!"=="127.0.0.1" set "EXPO_CMD=!EXPO_CMD! && set REACT_NATIVE_PACKAGER_HOSTNAME=!NRM_LAN_IP!"
if /i "%NRM_EXPO_TUNNEL%"=="1" (
  set "EXPO_CMD=!EXPO_CMD! && npx expo start --tunnel --port 8081"
) else (
  set "EXPO_CMD=!EXPO_CMD! && npx expo start --lan --port 8081"
)
start "NRM Expo Go" cmd /k "!EXPO_CMD!"

echo.
echo --- NRM dev stack ---
echo   API  PC : http://localhost:8787
if defined LAN_IP echo   API  phone: http://!LAN_IP!:8787  ^(same Wi-Fi, firewall TCP 8787^)
echo   Web  PC : http://localhost:8081  ^(opens in ~12 sec^)
if defined LAN_IP echo   Phone Expo Go: exp://!LAN_IP!:8081  ^(scan inside Expo Go app^)
echo   Release APK: scripts\Build-Release-Apk.bat
echo   Tunnel Metro: set NRM_EXPO_TUNNEL=1 before StartServer.bat
echo.
start "" cmd /c "timeout /t 12 /nobreak >nul && start http://127.0.0.1:8081/"
echo Launcher done. Backend and Expo stay open in their windows.
timeout /t 3 /nobreak >nul
endlocal
exit /b 0
