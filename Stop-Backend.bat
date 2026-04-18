@echo off
setlocal
title NRM-stop-backend-8787
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-Backend-8787.ps1"
echo.
pause
endlocal
