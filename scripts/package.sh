#!/usr/bin/env bash
# Đóng gói bản phát hành: dist/pvta.tar.gz (bridge + add-in + skill + manifest cổng 52730).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/version.mjs --check
npm run build >/dev/null
rm -rf release && mkdir -p release/pvta
cp bridge/dist/pvta-bridge.mjs release/pvta/
# Bộ đọc tài liệu (PDF, Word…, OCR) cho Sổ nguồn của add-in; bridge tìm tệp này cạnh pvta-bridge.mjs.
cp core/python/documents.py release/pvta/
cp -r addin/dist release/pvta/web
cp -r skills release/pvta/skills
# Cua so huong dan cai cong cu AI tren Windows (install.ps1 goi sau khi giai nen).
cp scripts/windows/wizard.ps1 release/pvta/wizard.ps1
sed 's#https://localhost:3000#https://localhost:52730#g' addin/manifest.xml > release/pvta/manifest.xml
# VERSION = số phiên bản x.y.z trong package.json (bridge so với install/latest.json để cập nhật); BUILD = mã commit.
VERSION="$(node -p "require('./package.json').version")"
echo "$VERSION" > release/pvta/VERSION
git rev-parse --short HEAD > release/pvta/BUILD 2>/dev/null || echo dev > release/pvta/BUILD
tar -czf release/pvta.tar.gz -C release pvta
mkdir -p install
# latest.json: bản mới nhất + mã sha256 của gói, để máy khác tự phát hiện và kiểm tra khi cập nhật.
SHA="$(sha256sum release/pvta.tar.gz 2>/dev/null | cut -d' ' -f1 || shasum -a 256 release/pvta.tar.gz | cut -d' ' -f1)"
PVTA_V="$VERSION" PVTA_SHA="$SHA" PVTA_NOTES="${PVTA_NOTES:-}" node -e '
const e = process.env;
process.stdout.write(JSON.stringify({ version: e.PVTA_V, sha256: e.PVTA_SHA, notes: e.PVTA_NOTES }, null, 2) + "\n");
' > install/latest.json
# Bản cài cũ tải install/pvta.tar.gz khi tự cập nhật: giữ một bản sao cùng nội dung (cùng mã sha256).
cp release/pvta.tar.gz install/pvta.tar.gz
cp release/pvta.tar.gz scripts/install.sh scripts/install.ps1 scripts/Cai-PVTA-Windows.bat scripts/Go-PVTA-Windows.bat scripts/Cai-PVTA-Mac.command scripts/Go-PVTA-Mac.command install/
ls -la install
