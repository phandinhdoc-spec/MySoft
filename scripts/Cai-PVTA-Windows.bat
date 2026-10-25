@echo off
rem PVTA - bam dup de cai tren Windows. Khong can go lenh.
title Cai dat PVTA
echo.
echo  === Cai dat PVTA cho Word / Excel / PowerPoint ===
echo  Xin cho 1-2 phut. Neu Windows hoi xac nhan thi chon Yes.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.ps1 | iex"
echo.
echo  Neu thay dong "Da cai xong PVTA" la thanh cong.
echo  Mo lai Word / Excel / PowerPoint -^> Insert -^> Add-ins -^> My Add-ins -^> PVTA.
echo.
pause
