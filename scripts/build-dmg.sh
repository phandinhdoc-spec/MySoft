#!/usr/bin/env bash
# Tạo release/PVTA-<version>.dmg (chạy trên macOS; cần hdiutil). Dùng install/pvta.tar.gz đã đóng gói.
# Biến PVTA_STAGE_ONLY=1: chỉ dựng thư mục nội dung (để kiểm tra trên máy không phải macOS).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f install/pvta.tar.gz ] || { echo "Chưa có install/pvta.tar.gz: chạy scripts/package.sh trước." >&2; exit 1; }
VERSION="$(node -p "require('./package.json').version")"
STAGE="release/dmg/PVTA"
rm -rf release/dmg && mkdir -p "$STAGE"
cp install/pvta.tar.gz "$STAGE/"
cp scripts/install.sh "$STAGE/install.sh"
cp scripts/mac/Cai-PVTA.command scripts/mac/Go-PVTA.command "$STAGE/"
cp scripts/mac/DOC-TOI.txt "$STAGE/DOC-TOI.txt"
chmod +x "$STAGE/Cai-PVTA.command" "$STAGE/Go-PVTA.command" "$STAGE/install.sh"
if [ "${PVTA_STAGE_ONLY:-}" = "1" ]; then echo "Đã dựng $STAGE"; exit 0; fi
OUT="release/PVTA-$VERSION.dmg"
rm -f "$OUT"
hdiutil create -volname "PVTA $VERSION" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
echo "Đã tạo $OUT"
