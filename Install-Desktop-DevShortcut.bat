@echo off
setlocal EnableExtensions
title NRM-install-desktop-shortcut

cd /d "%~dp0"
if not exist "%CD%\Start-Dev-Full.bat" (
  echo ERROR: run this from repo root ^(Start-Dev-Full.bat missing^)
  timeout /t 6 /nobreak >nul
  exit /b 1
)

powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass ^
  -File "%CD%\scripts\Install-DevShortcut.ps1" -RepoRoot "%CD%"
if errorlevel 1 (
  echo Shortcut install failed.
  timeout /t 6 /nobreak >nul
  exit /b 1
)

echo.
echo Done. On Desktop open:  NullReferMusic-Dev
echo That runs Start-Dev-Full.bat ^(backend + Expo + browser^).
echo.
timeout /t 5 /nobreak >nul
endlocal
exit /b 0
