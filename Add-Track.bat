@echo off
chcp 65001 >nul
cd /d "%~dp0"
title YELO Add Track
echo.
echo  YELO Add Track
echo  Lumen Technologies Co.
echo  https://LT-C.iddns.ir
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Add-Track.ps1" %*
echo.
pause
