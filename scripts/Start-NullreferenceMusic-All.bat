@echo off
setlocal EnableExtensions EnableDelayedExpansion
if defined NRM_REPO_ROOT (
  set "ROOT=%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0.."
  set "ROOT=%CD%"
)
set "LISTEN_PID="

title NullRefer Music — start all

if not exist "!ROOT!\backend\pom.xml" (
  echo [ERROR] backend pom.xml not found: !ROOT!\backend\pom.xml
  pause
  exit /b 1
)
if not exist "!ROOT!\app\package.json" (
  echo [ERROR] app package.json not found: !ROOT!\app\package.json
  pause
  exit /b 1
)
if not exist "!ROOT!\scripts\resolve-lan-ip.ps1" (
  echo [ERROR] resolve-lan-ip.ps1 not found: !ROOT!\scripts\resolve-lan-ip.ps1
  pause
  exit /b 1
)

call :SET_EXPO_PUBLIC_API

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8787 .*LISTENING"') do (
  set "LISTEN_PID=%%P"
  goto :ASK_KILL8787
)
goto :START_ALL

:ASK_KILL8787
echo [WARN] Port 8787 is already in use by PID !LISTEN_PID!.
choice /C YN /N /M "Kill that PID and continue? (Y/N): "
if errorlevel 2 (
  echo [INFO] Keeping existing process on 8787.
) else (
  echo [INFO] Killing PID !LISTEN_PID! ...
  taskkill /PID !LISTEN_PID! /F >nul 2>nul
)

:START_ALL
call :START_BACKEND
echo.
echo [2/2] Starting Expo: web + Expo Go (LAN) — same Metro, Fast Refresh for app + web.
echo        PC: browser will open. Phone: same Wi-Fi, scan QR in the Expo window.
rem  -c 제거: 매번 캐시를 지우면 HMR/저장 반영이 느려짐. 캐시 클리어는 Expo 창에서 Shift+R 또는 npx expo start -c
start "NRM Expo (LAN+Web)" cmd /k "cd /d !ROOT!\app && npx expo start --lan --web"
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:8081/"
goto :DONE

:START_BACKEND
set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8787 .*LISTENING"') do (
  set "LISTEN_PID=%%P"
  goto :BACKEND_EXISTS
)
echo [1/2] Starting backend on 0.0.0.0:8787 (Spring DevTools: Java 저장/빌드 시 자동 재시작) ...
start "NRM Backend (Spring)" cmd /k "cd /d !ROOT!\backend && mvn spring-boot:run"
timeout /t 3 /nobreak >nul
goto :eof

:BACKEND_EXISTS
echo [INFO] Backend already listening on :8787 ^(PID !LISTEN_PID!^).
goto :eof

:SET_EXPO_PUBLIC_API
set "EXPO_PUBLIC_API_BASE_URL="
set "LAN_IP="
for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "!ROOT!\scripts\resolve-lan-ip.ps1"') do set "LAN_IP=%%i"
if defined LAN_IP (
  set "EXPO_PUBLIC_API_BASE_URL=http://!LAN_IP!:8787"
  echo [INFO] EXPO_PUBLIC_API_BASE_URL=!EXPO_PUBLIC_API_BASE_URL! ^(Expo/Metro가 이 주소로 API 번들^)
) else (
  echo [WARN] LAN IP를 못 찾았습니다. 모바일 API는 app 설정에서 PC URL을 직접 넣으세요.
)
goto :eof

:DONE
echo.
echo --- 실행 요약 ---
echo   PC   API     : http://localhost:8787
if defined LAN_IP (
  echo   폰   API   : http://!LAN_IP!:8787  ^(PC와 같은 Wi-Fi, 방화벽 8787 허용^)
)
echo   PC   웹     : http://localhost:8081  ^(8초 뒤 브라우저. Expo가 다른 포트면 터미널 URL 사용^)
echo   실시간 반영 : 앱/웹 - Metro 켜둔 채 저장하면 Fast Refresh. Java - spring-boot:run + 컴파일되면 DevTools 재시작.
echo.
pause
endlocal
