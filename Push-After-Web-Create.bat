@echo off
setlocal
title NRM-push-after-web-create
cd /d C:\NullReferMusic

echo === Push to https://github.com/yoonhs3648/NullReferMusic ===
echo 1) On github.com: New repo "NullReferMusic", Public, NO README.
echo 2) Then this script runs git push (browser login may open).
echo.

git remote remove origin 2>nul
git remote add origin https://github.com/yoonhs3648/NullReferMusic.git
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo FAILED. Read docs\GITHUB-FIRST-PUSH.md
)
pause
endlocal
