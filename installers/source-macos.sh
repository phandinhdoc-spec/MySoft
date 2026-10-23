#!/usr/bin/env bash
# Cài mới và cập nhật từ cùng một snapshot mã nguồn; không tải DMG.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Script này dành cho macOS.' >&2; exit 1; }
base="$HOME/Library/Application Support/PVTA/build"
mkdir -p "$base"
lock="$base/install.lock"
mkdir "$lock" 2>/dev/null || { echo "Một lần cài PVTA đang chạy. Nếu đã bị ngắt, xóa $lock rồi chạy lại."; exit 1; }
work="$(mktemp -d "$base/source.XXXXXX")"
stage=''
cleanup() { rm -rf "$work"; [[ -z "$stage" ]] || rm -rf "$stage"; rmdir "$lock" 2>/dev/null || true; }
trap cleanup EXIT
trap 'echo "Cài đặt chưa hoàn tất. Xem lỗi ở trên; dữ liệu người dùng được giữ nguyên." >&2' ERR
if ! xcode-select -p >/dev/null 2>&1; then
 xcode-select --install || true
 echo 'macOS cần cài Command Line Tools một lần. Cài xong chạy lại lệnh PVTA.'
 exit 1
fi
export PATH="$base/node/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || ! node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=14?0:1)'; then
 case "$(uname -m)" in arm64) arch=arm64;; x86_64) arch=x64;; *) echo 'Kiến trúc Mac chưa hỗ trợ'; exit 1;; esac
 node_ver=v22.14.0
 pkg="node-$node_ver-darwin-$arch.tar.gz"
 curl -fLsS "https://nodejs.org/dist/$node_ver/$pkg" -o "$work/$pkg"
 curl -fLsS "https://nodejs.org/dist/$node_ver/SHASUMS256.txt" -o "$work/sums"
 expected="$(awk -v n="$pkg" '$2==n {print $1}' "$work/sums")"
 actual="$(shasum -a 256 "$work/$pkg" | cut -d' ' -f1)"
 [[ -n "$expected" && "$expected" == "$actual" ]] || { echo 'Node tải về sai mã kiểm tra'; exit 1; }
 mkdir -p "$base/node"
 tar -xzf "$work/$pkg" -C "$base/node" --strip-components=1
fi
if ! command -v cargo >/dev/null; then
 curl -fLsS https://sh.rustup.rs -o "$work/rustup.sh"
 bash "$work/rustup.sh" -y --profile minimal
fi
if [[ -n "${PVTA_SOURCE_DIR:-}" ]]; then
 source_dir="$(cd "$PVTA_SOURCE_DIR" && pwd)"
 for required in package.json package-lock.json chatbox/src-tauri/tauri.conf.json installers/office.sh; do
  [[ -f "$source_dir/$required" ]] || { echo "Mã nguồn thiếu $required" >&2; exit 1; }
 done
 echo "Cài từ mã nguồn trong thư mục: $source_dir"
 mkdir -p "$work/repo"
 # Snapshot includes uncommitted changes; cached dependencies stay outside this snapshot.
 tar -C "$source_dir" --exclude='.git' --exclude='.build-cache' --exclude='node_modules' --exclude='dist' --exclude='release' --exclude='target' --exclude='./chatbox/src-tauri/runtime' --exclude='./chatbox/src-tauri/binaries' -cf - . | tar -C "$work/repo" -xf -
else
 echo 'Tải mã nguồn PVTA mới nhất…'
 git clone --depth 1 https://github.com/phandinhdoc-spec/MySoft.git "$work/repo"
fi
# A stable build path preserves npm, runtime and Rust incremental caches.
# --delete removes stale source files; excluded build outputs are retained.
repo="$base/repo"
mkdir -p "$repo"
rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='release' --exclude='target' --exclude='.build-cache' --exclude='/chatbox/src-tauri/runtime' --exclude='/chatbox/src-tauri/binaries' "$work/repo/" "$repo/"
cd "$repo"
echo "Đang dựng PVTA $(node -p "require('./package.json').version")…"
# Giữ bộ nhớ đệm Rust giữa các lần cập nhật.
export CARGO_TARGET_DIR="$base/target"
node scripts/build-cache.mjs
npm run desktop:build -w @pvta/chatbox -- --bundles app
bash scripts/package.sh
fresh="$CARGO_TARGET_DIR/release/bundle/macos/PVTA.app"
[[ -d "$fresh" ]] || { echo 'Không tìm thấy ứng dụng vừa biên dịch'; exit 1; }
target="${PVTA_INSTALL_TARGET:-$HOME/Applications/PVTA.app}"
if [[ -z "${PVTA_INSTALL_TARGET:-}" && -d /Applications/PVTA.app ]]; then target=/Applications/PVTA.app; fi
[[ "$target" == /*/PVTA.app ]] || { echo 'Đường dẫn cài đặt không hợp lệ'; exit 1; }
parent="$(dirname "$target")"; mkdir -p "$parent"
[[ -w "$parent" ]] || { echo "Không có quyền ghi $parent. Chưa thay ứng dụng."; exit 1; }
stage="$(mktemp -d "$parent/.pvta-install.XXXXXX")"
ditto "$fresh" "$stage/PVTA.app"
echo 'Đã dựng xong. Đóng PVTA để thay phiên bản…'
if pgrep -f '/PVTA.app/Contents/MacOS/pvta-chatbox' >/dev/null; then
 osascript -e 'tell application id "vn.pvta.chatbox" to quit'
 for ((i=0;i<30;i++)); do
  pgrep -f '/PVTA.app/Contents/MacOS/pvta-chatbox' >/dev/null || break
  sleep 1
 done
 pgrep -f '/PVTA.app/Contents/MacOS/pvta-chatbox' >/dev/null && { echo 'PVTA chưa đóng. Hãy hoàn tất công việc và chạy lại.'; exit 1; }
fi
backup="$parent/PVTA.previous.app"
rm -rf "$backup"
[[ ! -d "$target" ]] || mv "$target" "$backup"
if ! mv "$stage/PVTA.app" "$target"; then
 [[ ! -d "$backup" ]] || mv "$backup" "$target"
 exit 1
fi
# Office được dựng từ cùng mã nguồn; không kéo gói Office cũ từ Releases.
if ! PVTA_LOCAL_TGZ="$repo/release/pvta.tar.gz" PVTA_INSTALL_CLI=none PVTA_NO_GUI=1 bash installers/office.sh; then
 rm -rf "$target"
 [[ ! -d "$backup" ]] || mv "$backup" "$target"
 echo 'Cài Office thất bại; đã phục hồi ứng dụng Chat nếu có bản trước.'
 exit 1
fi
open "$target"
echo "Đã cài PVTA. Bản trước (nếu có): $backup. Mở lại bảng PVTA trong Office."
