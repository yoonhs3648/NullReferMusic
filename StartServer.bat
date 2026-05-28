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
  echo [app] node_modules missing — running npm install ...
  pushd "%ROOT%\app"
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed in app\
    popd
    timeout /t 8 /nobreak >nul
    exit /b 1
  )
  popd
)
if not exist "%ROOT%\app\node_modules\expo-notifications" set "NRM_NPM_SYNC=1"
if not exist "%ROOT%\app\node_modules\expo-image-picker" set "NRM_NPM_SYNC=1"
if defined NRM_NPM_SYNC (
  echo [app] npm dependencies out of date — running npm install ...
  pushd "%ROOT%\app"
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed. Check Node/npm and app\package-lock.json
    popd
    timeout /t 8 /nobreak >nul
    exit /b 1
  )
  popd
  if not exist "%ROOT%\app\node_modules\expo-notifications" (
    echo ERROR: expo-notifications still missing after npm install
    timeout /t 8 /nobreak >nul
    exit /b 1
  )
  if not exist "%ROOT%\app\node_modules\expo-image-picker" (
    echo ERROR: expo-image-picker still missing after npm install
    timeout /t 8 /nobreak >nul
    exit /b 1
  )
)
if not exist "%ROOT%\scripts\Get-LanIp.ps1" (
  echo ERROR: scripts\Get-LanIp.ps1 not found.
  timeout /t 8 /nobreak >nul
  exit /b 1
)

set "LAN_IP="
set "EXPO_PUBLIC_API_BASE_URL="
for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\Get-LanIp.ps1"') do set "LAN_IP=%%i"
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
if not exist "%ROOT%\library\whisper\ggml-large-v3-turbo-q5_0.bin" (
  if not exist "%ROOT%\library\whisper\ggml-large-v3-turbo.bin" (
    echo [WARN] PC Whisper: large-v3-turbo model not in library\whisper
    echo        Only tiny/base may be present — lyrics quality will be poor.
    echo        Run: powershell -File "%ROOT%\scripts\Setup-Whisper.ps1" -WhisperProfile large-v3-turbo-q5_0
  )
)
echo [1/2] Starting Spring Boot on 0.0.0.0:8787 ...
start "NRM Backend" cmd /k "cd /d "%ROOT%\backend" && mvnw.cmd spring-boot:run"
timeout /t 6 /nobreak >nul
goto :START_EXPO

:BACKEND_UP
echo [1/2] Backend already on :8787 ^(PID !LISTEN_PID!^).

:START_EXPO
if defined LAN_IP (
  echo.
  echo ========== Expo Go ^(phone^) ==========
  echo exp://!LAN_IP!:8081
  echo Open Expo Go app - Scan QR code (Metro window)
  echo Do NOT use: http://!LAN_IP!:8081
  echo =====================================
  echo.
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
echo   Release APK: NullReferMusic-Build-Release-Apk.bat
echo   Tunnel Metro: set NRM_EXPO_TUNNEL=1 before StartServer.bat
echo.
start "" cmd /c "timeout /t 12 /nobreak >nul && start http://127.0.0.1:8081/"
echo Launcher done. Backend and Expo stay open in their windows.
timeout /t 3 /nobreak >nul
endlocal
exit /b 0
