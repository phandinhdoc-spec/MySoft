#!/usr/bin/env bash
# PVTA – bấm đúp để gỡ trên macOS.
clear
echo "=== Gỡ PVTA khỏi máy ==="
echo
curl -fsSL https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.sh | bash -s -- --uninstall
echo
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng cửa sổ…"
echo
