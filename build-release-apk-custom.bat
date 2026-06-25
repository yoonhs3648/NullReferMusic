@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Run-Build-Release-Apk-Custom.ps1" -RepoRoot "%CD%"
exit /b %ERRORLEVEL%
