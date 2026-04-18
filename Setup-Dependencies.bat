@echo off
setlocal
title NRM-deps

echo === C:\NullReferMusic\backend (Maven) ===
cd /d C:\NullReferMusic\backend
call mvnw.cmd -q -DskipTests package
if errorlevel 1 goto err

echo.
echo === C:\NullReferMusic\app (npm) ===
cd /d C:\NullReferMusic\app
call npm install
if errorlevel 1 goto err

echo.
echo Done.
pause
exit /b 0

:err
echo Dependency setup failed
pause
exit /b 1
