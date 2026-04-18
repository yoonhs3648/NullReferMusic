@echo off
setlocal
title NRM-push-github
cd /d C:\NullReferMusic

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Push-GitHub.ps1"
set ERR=%ERRORLEVEL%
if not %ERR%==0 pause
exit /b %ERR%
