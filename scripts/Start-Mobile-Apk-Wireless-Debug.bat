@echo off
setlocal EnableExtensions
title NRM APK Wireless Debug Helper

set "ROOT=C:\NullReferMusic"
set "DL=%ROOT%\downloads"
set "TOOLS_DIR=%DL%\platform-tools"
set "ADB=%TOOLS_DIR%\adb.exe"
set "ZIP=%DL%\platform-tools-latest-windows.zip"
set "PS_TEE=%TEMP%\nrm_log_tee.ps1"
set "CFG=%DL%\adb-wireless-debug.env"

if not exist "%DL%" mkdir "%DL%"

echo ======================================================
echo NullReferMusic APK Wireless Debug (ADB over Wi-Fi)
echo ======================================================
echo This window will stay open. Follow prompts below.
echo.

call :ENSURE_ADB
if errorlevel 1 goto :FAIL

echo [Guide-KR]
echo 1) Phone/PC must be on same Wi-Fi
echo 2) Android: Developer options ON
echo 3) Android: Wireless debugging ON
echo 4) Open "pair by pairing code" on phone before input
echo 5) PAIR_ADDR/PAIR_CODE = bottom popup values
echo 6) CONNECT_ADDR = top main screen value
echo.

call :TRY_AUTO_CONNECT
if errorlevel 1 (
  echo [INFO] Auto connect failed. First-time pair is required.
  call :FIRST_TIME_PAIR
  if errorlevel 1 goto :FAIL
)
"%ADB%" devices

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%I"
set "LOG_FILE=%DL%\crash-log-%TS%.txt"

echo [INFO] Clearing log buffer...
"%ADB%" logcat -c
echo [INFO] Live logs start now. Press Ctrl+C to stop.
echo [INFO] Log file: %LOG_FILE%
echo.

call :MAKE_TEE_PS
if errorlevel 1 goto :FAIL
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TEE%" "%ADB%" "%LOG_FILE%"
goto :DONE

:TRY_AUTO_CONNECT
set "CONNECT_ADDR="
if exist "%CFG%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%CFG%") do (
    if /i "%%A"=="CONNECT_ADDR" set "CONNECT_ADDR=%%B"
  )
)
if "%CONNECT_ADDR%"=="" exit /b 1
echo [INFO] Trying saved CONNECT_ADDR: %CONNECT_ADDR%
"%ADB%" connect %CONNECT_ADDR%
if errorlevel 1 exit /b 1
"%ADB%" get-state >nul 2>nul
if errorlevel 1 exit /b 1
echo [OK] Auto connected by saved address.
exit /b 0

:FIRST_TIME_PAIR
set /p PAIR_ADDR=PAIR_ADDR (?? ?? IP:PORT) ??: 
if "%PAIR_ADDR%"=="" exit /b 1
set /p PAIR_CODE=PAIR_CODE (?? ?? 6??) ??: 
if "%PAIR_CODE%"=="" exit /b 1

echo [INFO] Running adb pair...
"%ADB%" kill-server >nul 2>nul
"%ADB%" start-server >nul 2>nul
"%ADB%" pair %PAIR_ADDR% %PAIR_CODE%
if errorlevel 1 (
  echo [ERROR] adb pair failed. Re-open "pair by code" on phone and retry.
  exit /b 1
)

set /p CONNECT_ADDR=CONNECT_ADDR (? ???? IP:PORT) ??: 
if "%CONNECT_ADDR%"=="" exit /b 1
"%ADB%" connect %CONNECT_ADDR%
if errorlevel 1 (
  echo [ERROR] adb connect failed. Check CONNECT address from main wireless debugging screen.
  exit /b 1
)

> "%CFG%" echo CONNECT_ADDR=%CONNECT_ADDR%
echo [OK] Saved fixed Wi-Fi connect address.
exit /b 0

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
echo [ERROR] Failed. Check prompts and retry.
goto :CLEAN

:DONE
echo.
echo [DONE] Log saved to:
echo %LOG_FILE%
goto :CLEAN

:CLEAN
if exist "%PS_TEE%" del /q "%PS_TEE%" >nul 2>nul
echo.
pause
endlocal
exit /b 0
