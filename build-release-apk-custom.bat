@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Run-Build-Release-Apk-Custom.ps1" -RepoRoot "%CD%"
exit /b %ERRORLEVEL%
