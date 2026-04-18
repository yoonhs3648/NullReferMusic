@echo off
setlocal EnableExtensions
set "NRM=C:\NullReferMusic"

if not exist "%NRM%\backend\pom.xml" (
  echo ERROR: missing %NRM%\backend\pom.xml
  pause
  exit /b 1
)
if not exist "%NRM%\app\package.json" (
  echo ERROR: missing %NRM%\app\package.json
  pause
  exit /b 1
)

echo Starting Spring Boot API (8787) in new window...
start "NRM-Server" cmd.exe /k "cd /d C:\NullReferMusic\backend && mvnw.cmd spring-boot:run"

timeout /t 6 /nobreak >nul

echo Starting Expo web in new window...
start "NRM-Web" cmd.exe /k "cd /d C:\NullReferMusic\app && npm run web"

echo.
echo IMPORTANT:
echo   - Keep open: NRM-Server + NRM-Web  (2 windows)
echo   - Wait until NRM-Web shows Web Bundled / Metro ready (first run is slow)
echo   - Then open: http://127.0.0.1:8081/  or  http://localhost:8081/
echo.
echo Opening browser in 25 seconds (first bundle may need time)...
timeout /t 25 /nobreak >nul

start "" "http://127.0.0.1:8081/"

echo.
echo You can CLOSE this window now. Server and Web keep running in the other two.
timeout /t 4 /nobreak >nul
endlocal
