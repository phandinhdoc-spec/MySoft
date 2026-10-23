#!/usr/bin/env bash
# PVTA – bấm đúp (hoặc chuột phải > Mở) để gỡ PVTA khỏi máy.
cd "$(dirname "$0")" || exit 1
clear
bash ./install.sh --uninstall
echo
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng cửa sổ…"
echo
