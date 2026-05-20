@echo off
setlocal EnableExtensions
title NRM Install Desktop Shortcuts

cd /d "%~dp0.."
set "ROOT=%CD%"
set "DESKTOP=%USERPROFILE%\Desktop"

if not exist "%ROOT%\StartServer.bat" (
  echo ERROR: StartServer.bat not found under %ROOT%
  pause
  exit /b 1
)
if not exist "%ROOT%\scripts\Build-Release-Apk.bat" (
  echo ERROR: scripts\Build-Release-Apk.bat not found.
  pause
  exit /b 1
)

if exist "%DESKTOP%\StartServer-Usb.bat" del /f /q "%DESKTOP%\StartServer-Usb.bat"
if exist "%DESKTOP%\NullReferMusic-Usb-Logcat.bat" del /f /q "%DESKTOP%\NullReferMusic-Usb-Logcat.bat"

call :WRITE_BAT "%DESKTOP%\StartServer.bat" "%ROOT%\StartServer.bat"
call :WRITE_BAT "%DESKTOP%\NullReferMusic-Build-Release-Apk.bat" "%ROOT%\scripts\Build-Release-Apk.bat"

echo.
echo Created on Desktop:
echo   %DESKTOP%\StartServer.bat
echo   %DESKTOP%\NullReferMusic-Build-Release-Apk.bat
echo.
echo Removed legacy USB shortcuts if present.
echo NRM_REPO_ROOT=%ROOT%
pause
exit /b 0

:WRITE_BAT
set "OUT=%~1"
set "TARGET=%~2"
> "%OUT%" echo @echo off
>> "%OUT%" echo setlocal EnableExtensions
>> "%OUT%" echo set "NRM_REPO_ROOT=%ROOT%"
>> "%OUT%" echo call "%TARGET%"
>> "%OUT%" echo endlocal
exit /b 0
