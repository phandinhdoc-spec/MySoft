#!/usr/bin/env bash
# PVTA desktop, packages from phandinhdoc-spec/MySoft main releases.
set -euo pipefail
repo='phandinhdoc-spec/MySoft'
platform="$(uname -s)"
case "$(uname -m)" in arm64|aarch64) arch='arm64';; x86_64|amd64) arch='x64';; *) echo 'PVTA chưa có gói cho kiến trúc này.' >&2; exit 1;; esac
command -v curl >/dev/null || { echo 'Cần curl để tải PVTA.' >&2; exit 1; }
task_tmp="$(mktemp -d)"
trap 'if [[ -n "${pvta_mount:-}" ]]; then hdiutil detach "$pvta_mount" -quiet || true; fi; rm -rf "$task_tmp"' EXIT
release_api="https://api.github.com/repos/$repo/releases/latest"
if [[ -n "${PVTA_RELEASE_TAG:-}" ]]; then
 [[ "$PVTA_RELEASE_TAG" =~ ^desktop-v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Phiên bản không hợp lệ." >&2; exit 1; }
 release_api="https://api.github.com/repos/$repo/releases/tags/$PVTA_RELEASE_TAG"
fi
curl -fLsS "$release_api" -o "$task_tmp/release.json"
# Use the platform's JSON parser. macOS includes JXA; Linux installer needs Python.
if [[ "$platform" == Darwin ]]; then
  asset="$(osascript -l JavaScript - "$task_tmp/release.json" "$arch" <<'JS'
function run(argv){ObjC.import('Foundation');let raw=$.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null).js;let j=JSON.parse(raw);let a=j.assets.find(x=>x.name.startsWith('PVTA-Chatbox-')&&x.name.endsWith('-'+argv[1]+'.dmg'));if(!a)throw Error('Chưa có bản desktop cho máy này');return a.browser_download_url;}
JS
)"
else
  command -v python3 >/dev/null || { echo 'Cần Python 3 để đọc metadata phát hành; cài bằng trình quản lý gói của hệ điều hành.' >&2; exit 1; }
  asset="$(python3 -c 'import json,sys; a=[a["browser_download_url"] for a in json.load(open(sys.argv[1]))["assets"] if a["name"].startswith("PVTA-Chatbox-") and a["name"].endswith("-"+sys.argv[2]+".AppImage")]; print(a[0] if a else "")' "$task_tmp/release.json" "$arch")"
fi
[[ "$asset" == "https://github.com/$repo/releases/download/"* ]] || { echo 'Chưa có gói PVTA Chatbox phù hợp trên GitHub Releases.' >&2; exit 1; }
filename="${asset##*/}"
curl -fLsS "$asset" -o "$task_tmp/$filename"
release_base="${asset%/*}"
curl -fLsS "$release_base/SHA256SUMS" -o "$task_tmp/SHA256SUMS"
expected="$(awk -v n="$filename" '$2==n || $2=="*"n {print $1}' "$task_tmp/SHA256SUMS")"
[[ "$expected" =~ ^[0-9a-fA-F]{64}$ ]] || { echo 'Thiếu mã kiểm tra gói.' >&2; exit 1; }
if command -v sha256sum >/dev/null; then actual="$(sha256sum "$task_tmp/$filename" | cut -d' ' -f1)"; else actual="$(shasum -a 256 "$task_tmp/$filename" | cut -d' ' -f1)"; fi
[[ "$expected" == "$actual" ]] || { echo 'Gói tải về không khớp SHA256.' >&2; exit 1; }
if [[ "$platform" == Darwin ]]; then
 pvta_mount="$task_tmp/mount"; mkdir "$pvta_mount"
 hdiutil attach "$task_tmp/$filename" -mountpoint "$pvta_mount" -nobrowse -quiet
 install_dir="$HOME/Applications"
 if [[ -d /Applications/PVTA.app ]]; then install_dir='/Applications'; fi
 if pgrep -f '/PVTA.app/Contents/MacOS/pvta-chatbox' >/dev/null; then
  echo 'Hãy đóng PVTA bằng Cmd+Q, rồi chạy lại lệnh cài.' >&2; exit 1
 fi
 mkdir -p "$install_dir"
 [[ -w "$install_dir" ]] || { echo "Không có quyền cập nhật $install_dir. Hãy cài bằng gói DMG trên GitHub Releases." >&2; exit 1; }
 install_stage="$(mktemp -d "$install_dir/.pvta-install.XXXXXX")"
 ditto "$pvta_mount/PVTA.app" "$install_stage/PVTA.app"
 [[ ! -d "$install_dir/PVTA.app" ]] || mv "$install_dir/PVTA.app" "$install_stage/previous.app"
 if ! mv "$install_stage/PVTA.app" "$install_dir/PVTA.app"; then
  [[ ! -d "$install_stage/previous.app" ]] || mv "$install_stage/previous.app" "$install_dir/PVTA.app"
  echo "Cài chưa thành công. Bản dự phòng nằm tại $install_stage nếu cần khôi phục." >&2
  exit 1
 fi
 rm -rf "$install_stage"
 echo "Đã cài PVTA tại $install_dir/PVTA.app. Hội thoại và cấu hình được giữ nguyên."
 echo 'Nếu macOS yêu cầu xác nhận: chuột phải PVTA → Mở cho lần đầu.'
 if [[ "${PVTA_NO_GUI:-0}" != 1 ]]; then open "$install_dir/PVTA.app"; fi

else
 mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
 install -m 755 "$task_tmp/$filename" "$HOME/.local/bin/pvta.AppImage"
 cat > "$HOME/.local/share/applications/pvta.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=PVTA
Comment=Trợ lý AI cho giáo viên
Exec="$HOME/.local/bin/pvta.AppImage"
Terminal=false
Categories=Office;Education;
DESKTOP
 echo 'Đã cài PVTA. Có thể dùng gói .deb trên GitHub để tự cài phụ thuộc WebKitGTK.'
fi
if [[ "${PVTA_INSTALL_EXTRAS:-0}" == 1 && -r /dev/tty ]]; then
 echo 'Cài thêm: 1. Python + đọc PDF  2. agy  3. Claude  4. Codex  0. Bỏ qua'
 read -r option </dev/tty
 case "$option" in
  1) if ! command -v python3 >/dev/null; then
       if [[ "$platform" == Darwin ]] && command -v brew >/dev/null; then brew install python; else echo 'Cài Python từ python.org hoặc trình quản lý gói Linux.'; fi
     fi
     if command -v python3 >/dev/null; then python3 -m venv "$HOME/.phananh-office/python"; "$HOME/.phananh-office/python/bin/python" -m pip install pypdf; fi;;
  2) curl -fsSL https://antigravity.google/cli/install.sh -o "$task_tmp/agy.sh"; bash "$task_tmp/agy.sh";;
  3) curl -fsSL https://claude.ai/install.sh -o "$task_tmp/claude.sh"; bash "$task_tmp/claude.sh";;
  4) command -v npm >/dev/null && npm install -g @openai/codex || echo 'Cài Node.js từ nodejs.org trước khi cài Codex.';;
 esac
fi
