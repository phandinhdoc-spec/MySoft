#!/usr/bin/env bash
# Dung hai tep cai dat DUY NHAT, moi tep cai ca PVTA Chat lan tien ich PVTA cho Office:
#   release/Cai-PVTA.command   macOS (bam dup) va Linux (chi cai Chat)
#   release/Cai-PVTA.bat       Windows (bam dup)
# Nguon: installers/chatbox.sh, installers/office.sh, installers/studio.ps1.
# Moi tep tu chua san ma cai dat, chi con tai goi PVTA tu GitHub Releases (co kiem tra SHA256).
# Chay lai script nay sau khi sua cac tep nguon hoac sau khi tang phien ban.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/version.mjs --check

version="$(node -p "require('./chatbox/src-tauri/tauri.conf.json').version")"
tag="desktop-v$version"
[[ "$tag" =~ ^desktop-v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Phien ban khong hop le: $version" >&2; exit 1; }
mkdir -p release

# macOS: luôn lấy script nguồn mới; không nhúng phiên bản bị ghim.
out="release/Cai-PVTA.command"
cp installers/studio.sh "$out"
chmod +x "$out"
bash -n "$out"

# ---------------------------------------------------------------- Windows
bat="release/Cai-PVTA.bat"
{
cat <<'BATHEAD'
@echo off
setlocal
chcp 65001 >nul
title Cai dat PVTA
echo.
echo  === Cai dat PVTA Chat + tien ich Word / Excel / PowerPoint ===
echo  Xin cho 1-3 phut. Neu Windows hoi xac nhan thi chon Yes.
echo  (Go tien ich Office: mo PowerShell, dat PVTA_UNINSTALL=1 roi chay lai tep nay.)
echo.
set "PVTA_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:PVTA_SELF); $m='#PS'+'-BEGIN#'; $i=$t.LastIndexOf($m); Invoke-Expression $t.Substring($i+$m.Length)"
echo.
pause
exit /b
BATHEAD
printf '#PS-BEGIN#\n'
cat installers/studio.ps1
} | sed 's/$/\r/' > "$bat"

# ASCII thuan: cmd.exe va PowerShell 5.1 doc dung moi ma trang.
if ! LC_ALL=C perl -ne 'exit 1 if /[^\x00-\x7F]/' "$bat"; then echo "$bat co ky tu khong phai ASCII." >&2; exit 1; fi

echo "Da dung:"
ls -l "$out" "$bat"
