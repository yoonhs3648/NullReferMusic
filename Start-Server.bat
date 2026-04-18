@echo off
setlocal
title NRM-Spring-Server
cd /d C:\NullReferMusic\backend
call mvnw.cmd spring-boot:run
pause
endlocal
