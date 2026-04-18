@echo off
setlocal EnableExtensions

if not exist "C:\NullReferMusic\backend\pom.xml" (
  echo ERROR: missing C:\NullReferMusic\backend\pom.xml
  pause
  exit /b 1
)
if not exist "C:\NullReferMusic\app\package.json" (
  echo ERROR: missing C:\NullReferMusic\app\package.json
  pause
  exit /b 1
)

start "NRM-Server" cmd.exe /k "cd /d C:\NullReferMusic\backend && mvnw.cmd spring-boot:run"
timeout /t 6 /nobreak >nul
start "NRM-Expo" cmd.exe /k "cd /d C:\NullReferMusic\app && npm start"

echo Server + Expo windows opened.
pause
endlocal
