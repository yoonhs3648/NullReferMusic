@echo off

title NRM API Tunnel 8787

echo.

echo === API tunnel (keep this window open) ===

echo When you see:  your url is: https://xxxx.loca.lt

echo Phone Chrome:  https://xxxx.loca.lt/api/health

echo First visit: enter the IP shown on that page, then Continue.

echo Use ONE tunnel URL only. Keep this window open.

echo.

echo Backend must be running (NRM Backend on :8787).

echo.

npx -y localtunnel --port 8787

pause

