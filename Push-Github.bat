@echo off
setlocal
title NRM-push-github
cd /d C:\NullReferMusic

where gh >nul 2>&1
if errorlevel 1 (
  echo ERROR: gh ^(GitHub CLI^) not in PATH. Install from winget: GitHub.cli
  pause
  exit /b 1
)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo Not logged in. Run this once in PowerShell:
  echo   gh auth login
  pause
  exit /b 1
)

echo Creating github.com/yoonhs3648/NullReferMusic if missing, then pushing...
gh repo create NullReferMusic --public --source=. --remote=origin --push
if errorlevel 1 (
  echo If the repo already exists, try:
  echo   git remote remove origin
  echo   git remote add origin https://github.com/yoonhs3648/NullReferMusic.git
  echo   git push -u origin main
)
pause
exit /b 0
