#!/usr/bin/env bash
# Tao PVTA-Studio-<version>-<arch>.dmg: ung dung PVTA Chat + tien ich Office trong mot tep .dmg (khong can Internet).
# Chay tren macOS (can hdiutil, ditto). Dung:
#   bash scripts/build-studio-dmg.sh <PVTA-Chatbox-x.dmg> <pvta-office.tar.gz> <arm64|x64> <thu-muc-ra>
# PVTA_STAGE_ONLY=1: chi dung thu muc noi dung (kiem tra tren may khac, khi do <chat.dmg> la thu muc co PVTA.app).
set -euo pipefail
cd "$(dirname "$0")/.."
chat="${1:?thieu duong dan PVTA Chat .dmg}"; tgz="${2:?thieu pvta-office.tar.gz}"; arch="${3:?thieu arm64|x64}"; outdir="${4:-release}"
version="$(node -p "require('./package.json').version")"
stage="$(mktemp -d)/PVTA Studio"; mkdir -p "$stage/Tien-ich-Office" "$outdir"
mount=""
cleanup() { if [ -n "$mount" ]; then hdiutil detach "$mount" -quiet -force || true; fi; }
trap cleanup EXIT
if [ "${PVTA_STAGE_ONLY:-}" = "1" ]; then
  app="$(find "$chat" -maxdepth 1 -name '*.app' | head -1)"
else
  mount="$(mktemp -d)"
  hdiutil attach "$chat" -mountpoint "$mount" -nobrowse -readonly -quiet
  app="$(find "$mount" -maxdepth 1 -name '*.app' | head -1)"
fi
[ -n "$app" ] || { echo "Khong thay .app trong $chat" >&2; exit 1; }
# Cap nhat tu dong cua ung dung tim "PVTA.app" o goc .dmg.
ditto "$app" "$stage/PVTA.app"
ln -s /Applications "$stage/Applications"
cp "$tgz" "$stage/Tien-ich-Office/pvta-office.tar.gz"
cp installers/office.sh "$stage/Tien-ich-Office/office.sh"
cat > "$stage/Cai-tien-ich-Office.command" <<'CMD'
#!/usr/bin/env bash
# Cai tien ich PVTA cho Word / Excel / PowerPoint tu goi di kem trong tep .dmg nay.
here="$(cd "$(dirname "$0")" && pwd)"
PVTA_LOCAL_TGZ="$here/Tien-ich-Office/pvta-office.tar.gz" bash "$here/Tien-ich-Office/office.sh"
status=$?
echo; read -r -p "Nhan Enter de dong cua so nay." _ || true
exit $status
CMD
chmod +x "$stage/Cai-tien-ich-Office.command" "$stage/Tien-ich-Office/office.sh"
cat > "$stage/DOC-TOI.txt" <<TXT
PVTA Studio $version: PVTA Chat + tien ich PVTA cho Word, Excel, PowerPoint.

Buoc 1 - Cai PVTA Chat
  Keo PVTA.app vao thu muc Applications. Lan dau mo, neu macOS chan ung dung:
  bam chuot phai vao PVTA > Mo > Mo. (Hoac: Cai dat he thong > Quyen rieng tu va bao mat > Van mo.)

Buoc 2 - Cai tien ich Office
  Bam dup "Cai-tien-ich-Office.command". Neu macOS chan: chuot phai > Mo > Mo.
  May hoi mat khau dang nhap Mac mot lan de tin cay chung chi cuc bo: nhap va chon Cho phep.
  Cai xong, thoat han Word / Excel / PowerPoint (Cmd + Q) roi mo lai.
  Tien ich nam trong Chen (Insert) > Phan bo tro (Add-ins) > Developer Add-ins > PVTA.

Go tien ich Office: mo Terminal, chay  bash "Tien-ich-Office/office.sh" --uninstall  trong thu muc cua dmg nay.
TXT
if [ "${PVTA_STAGE_ONLY:-}" = "1" ]; then echo "Da dung $stage"; exit 0; fi
out="$outdir/PVTA-Studio-$version-$arch.dmg"
rm -f "$out"
hdiutil create -volname "PVTA Studio $version" -srcfolder "$stage" -ov -format UDZO "$out"
echo "Da tao $out"
