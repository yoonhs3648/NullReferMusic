@echo off
setlocal EnableExtensions
title NRM APK USB Logcat

set "ROOT=C:\NullReferMusic"
set "DL=%ROOT%\downloads"
set "TOOLS_DIR=%DL%\platform-tools"
set "ADB=%TOOLS_DIR%\adb.exe"
set "ZIP=%DL%\platform-tools-latest-windows.zip"
set "PS_TEE=%TEMP%\nrm_usb_log_tee.ps1"

if not exist "%DL%" mkdir "%DL%"

echo ======================================================
echo NullReferMusic APK USB Crash Log Collector
echo ======================================================
echo [Guide]
echo 1) Phone USB connected
echo 2) USB mode = File transfer
echo 3) USB debugging = ON and authorized
echo.

call :ENSURE_ADB
if errorlevel 1 goto :FAIL

echo [INFO] Restarting adb server...
"%ADB%" kill-server >nul 2>nul
"%ADB%" start-server >nul 2>nul

echo [INFO] Checking connected devices...
"%ADB%" devices -l
for /f "skip=1 tokens=1,2" %%A in ('"%ADB%" devices') do (
  if "%%B"=="device" set "HAS_DEVICE=1"
)
if not defined HAS_DEVICE (
  echo.
  echo [ERROR] No authorized USB device detected.
  echo - Reconnect cable
  echo - Accept USB debugging popup on phone
  echo - Run this BAT again
  goto :CLEAN
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%I"
set "LOG_FILE=%DL%\usb-crash-log-%TS%.txt"

echo.
echo [INFO] Clearing old logs...
"%ADB%" logcat -c
echo [INFO] Starting live error logs...
echo [INFO] File: %LOG_FILE%
echo [INFO] Reproduce crash now. Press Ctrl+C to stop.
echo.

call :MAKE_TEE_PS
if errorlevel 1 goto :FAIL
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TEE%" "%ADB%" "%LOG_FILE%"

echo.
echo [DONE] Saved log file:
echo %LOG_FILE%
goto :CLEAN

:ENSURE_ADB
if exist "%ADB%" exit /b 0
echo [INFO] Downloading platform-tools...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile '%ZIP%'; Expand-Archive -Path '%ZIP%' -DestinationPath '%DL%' -Force"
if not exist "%ADB%" exit /b 1
exit /b 0

:MAKE_TEE_PS
> "%PS_TEE%" echo param([string]$adb,[string]$logPath)
>> "%PS_TEE%" echo $ErrorActionPreference='Stop'
>> "%PS_TEE%" echo ^& $adb logcat "*:E" ^| Tee-Object -FilePath $logPath
exit /b 0

:FAIL
echo.
echo [ERROR] Failed. Please retry.

:CLEAN
if exist "%PS_TEE%" del /q "%PS_TEE%" >nul 2>nul
echo.
pause
endlocal
exit /b 0
