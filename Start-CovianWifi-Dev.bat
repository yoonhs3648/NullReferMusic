@echo off
setlocal EnableExtensions
title NRM Covian Wi-Fi Dev

if defined NRM_REPO_ROOT (
  cd /d "%NRM_REPO_ROOT%"
) else (
  cd /d "%~dp0"
)

if not exist "%CD%\app\package.json" (
  echo ERROR: app\package.json not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\Start-CovianWifi-Dev.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" pause
exit /b %EC%
