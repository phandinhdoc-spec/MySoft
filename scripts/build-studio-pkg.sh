#!/usr/bin/env bash
# Tạo PVTA-Studio-<version>-<arch>.pkg: cài/cập nhật PVTA Chat + tiện ích Office, không hỏi lại.
# Có bản cũ → đưa vào Thùng rác rồi cài mới; chưa có → cài mới. KHÔNG bao giờ xóa dữ liệu người dùng.
#   bash scripts/build-studio-pkg.sh <PVTA-Chatbox-x.dmg> <pvta-office.tar.gz> <arm64|x64> <thư-mục-ra>
set -euo pipefail
cd "$(dirname "$0")/.."
chat="${1:?thiếu PVTA Chat .dmg}"; tgz="${2:?thiếu pvta-office.tar.gz}"; arch="${3:?thiếu arm64|x64}"; outdir="${4:-release}"
version="$(node -p "require('./package.json').version")"
work="$(mktemp -d)"; mount=""
cleanup() { if [ -n "$mount" ]; then hdiutil detach "$mount" -quiet -force || true; fi; rm -rf "$work"; }
trap cleanup EXIT
mount="$(mktemp -d)"; hdiutil attach "$chat" -mountpoint "$mount" -nobrowse -readonly -quiet
app="$(find "$mount" -maxdepth 1 -name '*.app' | head -1)"; [ -n "$app" ] || { echo "Không thấy .app trong $chat" >&2; exit 1; }
root="$work/root"; mkdir -p "$root/Applications" "$root/usr/local/share/pvta-installer" "$outdir"
ditto "$app" "$root/Applications/PVTA.app"
cp "$tgz" "$root/usr/local/share/pvta-installer/pvta-office.tar.gz"
cp installers/office.sh "$root/usr/local/share/pvta-installer/office.sh"
scripts="$work/scripts"; mkdir -p "$scripts"; cp scripts/pkg/preinstall scripts/pkg/postinstall "$scripts/"; chmod +x "$scripts"/*
out="$outdir/PVTA-Studio-$version-$arch.pkg"; rm -f "$out"
pkgbuild --root "$root" --scripts "$scripts" --identifier vn.phananh.pvta.studio --version "$version" --install-location / "$work/component.pkg"
productbuild --package "$work/component.pkg" "$out"
echo "Đã tạo $out"
