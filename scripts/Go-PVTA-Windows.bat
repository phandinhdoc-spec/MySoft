@echo off
rem PVTA - bam dup de go tren Windows.
title Go PVTA
echo.
echo  === Go PVTA khoi may ===
echo.
set PVTA_UNINSTALL=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.ps1 | iex"
echo.
pause
