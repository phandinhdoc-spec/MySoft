#!/usr/bin/env bash
# PVTA – cài một lệnh cho macOS.
#   curl -fsSL https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.sh | bash
# Gỡ cài đặt:  bash install.sh --uninstall
set -euo pipefail

source_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$source_dir/package.json" && -f "$source_dir/installers/source-macos.sh" ]]; then
 exec bash "$source_dir/Cai-PVTA.command" "$@"
fi

REPO="phandinhdoc-spec/MySoft"
HOME_DIR="$HOME/.phananh-office"
APP="$HOME_DIR/app"
PLIST="$HOME/Library/LaunchAgents/vn.phananh.pvta.plist"
LABEL="vn.phananh.pvta"
UID_NUM="$(id -u)"
NODE_VERSION="v22.11.0"

say() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

manifest_dirs() {
  for app in Word Excel Powerpoint; do
    echo "$HOME/Library/Containers/com.microsoft.$app/Data/Documents/wef"
  done
}

# Bản cài trước khi đổi tên sản phẩm: dừng tác vụ nền và xóa manifest cũ.
legacy_cleanup() {
  local old_plist="$HOME/Library/LaunchAgents/vn.phananh.pvta.plist"
  launchctl bootout "gui/$UID_NUM" "$old_plist" 2>/dev/null || true
  rm -f "$old_plist"
  manifest_dirs | while read -r d; do rm -f "$d/pvta.manifest.xml"; done
}

if [ "${1:-}" = "--uninstall" ]; then
  say "Đang gỡ PVTA…"
  legacy_cleanup
  launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  manifest_dirs | while read -r d; do rm -f "$d/pvta.manifest.xml"; done
  security delete-certificate -c "PVTA Localhost" "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null || true
  rm -rf "$APP" "$HOME_DIR/node" "$HOME_DIR/certs"
  say "Đã gỡ. Dữ liệu (skill, cấu hình) còn ở $HOME_DIR; xóa thư mục này nếu muốn bỏ hẳn."
  exit 0
fi

IS_UPGRADE=""; [ -d "$APP" ] && IS_UPGRADE=1

[ "$(uname -s)" = "Darwin" ] || die "Script này dành cho macOS. Windows: dùng install.ps1."
for c in tar openssl; do command -v "$c" >/dev/null || die "Thiếu lệnh $c."; done
mkdir -p "$HOME_DIR"

# 1. Node (dùng bản có sẵn nếu >= 20, nếu không tải bản riêng, không cần quyền quản trị)
NODE=""
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  NODE="$(command -v node)"
else
  say "Tải Node.js (một lần)…"
  case "$(uname -m)" in arm64) arch=arm64 ;; *) arch=x64 ;; esac
  rm -rf "$HOME_DIR/node" && mkdir -p "$HOME_DIR/node"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-$arch.tar.gz" | tar -xz -C "$HOME_DIR/node" --strip-components=1
  NODE="$HOME_DIR/node/bin/node"
fi

# 2. Tải PVTA
say "Tải PVTA…"
tmp="$(mktemp -d)"
if [ -n "${PVTA_LOCAL_TGZ:-}" ]; then
  # Bản đóng gói sẵn (file .dmg): không cần tải.
  cp "$PVTA_LOCAL_TGZ" "$tmp/pvta.tar.gz" || die "Không đọc được $PVTA_LOCAL_TGZ."
else
  curl -fsSL "https://raw.githubusercontent.com/$REPO/main/install/pvta.tar.gz" -o "$tmp/pvta.tar.gz" || die "Không tải được PVTA. Kiểm tra mạng rồi chạy lại."
fi
legacy_cleanup
launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
rm -rf "$APP" && mkdir -p "$APP"
tar -xzf "$tmp/pvta.tar.gz" -C "$APP" --strip-components=1
rm -rf "$tmp"

# 3. Chứng chỉ HTTPS cục bộ (Office bắt buộc add-in dùng HTTPS)
CERTS="$HOME_DIR/certs"
if [ ! -f "$CERTS/localhost.crt" ]; then
  say "Tạo chứng chỉ cục bộ (máy sẽ hỏi mật khẩu đăng nhập Mac một lần)…"
  mkdir -p "$CERTS"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$CERTS/localhost.key" -out "$CERTS/localhost.crt" \
    -days 800 -subj "/CN=PVTA Localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -addext "basicConstraints=critical,CA:FALSE" -addext "extendedKeyUsage=serverAuth" >/dev/null 2>&1
  chmod 600 "$CERTS/localhost.key"
  security add-trusted-cert -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$CERTS/localhost.crt" \
    || die "Chưa tin cậy được chứng chỉ. Chạy lại và chọn Cho phép."
fi

# 4. Đăng ký add-in với Word, Excel, PowerPoint
manifest_dirs | while read -r d; do mkdir -p "$d" && cp "$APP/manifest.xml" "$d/pvta.manifest.xml"; done

# 5. Tự chạy nền khi đăng nhập. PATH gồm nơi cài claude / agy.
EXTRA="$HOME/.local/bin:$HOME/.claude/local:$HOME/.npm-global/bin:$HOME/.antigravity/bin:$HOME/.bun/bin:$HOME/.volta/bin:/opt/homebrew/bin:/usr/local/bin"
NPM_BIN="$(npm prefix -g 2>/dev/null || true)"; [ -n "$NPM_BIN" ] && EXTRA="$NPM_BIN/bin:$EXTRA"
for c in claude codex agy; do
  p="$(command -v "$c" 2>/dev/null || true)"
  [ -z "$p" ] && p="$("${SHELL:-/bin/zsh}" -ilc "command -v $c" 2>/dev/null | tail -1 || true)"
  [ -n "$p" ] && [ -x "$p" ] && EXTRA="$(dirname "$p"):$EXTRA"
done
FULLPATH="$EXTRA:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$APP/pvta-bridge.mjs</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$FULLPATH</string>
    <key>PVTA_WEB</key><string>$APP/web</string>
    <key>PVTA_BUNDLED_SKILLS</key><string>$APP/skills</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME_DIR/bridge.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/bridge.log</string>
</dict></plist>
PLISTEOF
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

# 6. Kiểm tra
ok=""
for _ in $(seq 1 20); do
  if curl -fsS --cacert "$CERTS/localhost.crt" https://localhost:52730/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
[ -n "$ok" ] || die "PVTA chưa khởi động được. Xem nhật ký: $HOME_DIR/bridge.log"

have=""
for c in claude codex agy; do
  PATH="$FULLPATH" command -v "$c" >/dev/null 2>&1 && have="$have $c"
done

# 7. Công cụ AI. Lần cài đầu (hoặc máy chưa có công cụ nào): hiện menu, công cụ đã có đánh ✓.
#    Chọn công cụ chưa có → tự cài rồi mời đăng nhập; chọn công cụ đã có → chỉ mời đăng nhập.
#    Bỏ qua bằng PVTA_INSTALL_CLI=none; chọn sẵn bằng PVTA_INSTALL_CLI=claude|codex|agy.
has() { case " $have " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
mark() { if has "$1"; then printf '\033[1;32m✓ đã có\033[0m'; else printf 'chưa có'; fi; }
choice="${PVTA_INSTALL_CLI:-}"
if [ -z "$choice" ] && { [ -z "$IS_UPGRADE" ] || [ -z "$have" ]; } && [ -r /dev/tty ]; then
  echo
  echo "Công cụ AI cho PVTA (dùng gói đăng ký của thầy cô; giáo viên ở Việt Nam thường dùng agy với gói Gemini):"
  printf "  1 - %-24s %s\n" "Antigravity (agy)" "$(mark agy)"
  printf "  2 - %-24s %s\n" "Claude Code (claude)" "$(mark claude)"
  printf "  3 - %-24s %s\n" "Codex (codex)" "$(mark codex)"
  if [ -n "$have" ]; then
    echo "  0 - Giữ nguyên, không cài thêm"
  else
    echo "  0 - Bỏ qua (cài sau, hoặc dùng khóa API trong ⚙ Cài đặt của PVTA)"
  fi
  printf "Chọn một số [0-3]: "
  read -r n </dev/tty || n=0
  case "$n" in 1) choice=agy ;; 2) choice=claude ;; 3) choice=codex ;; *) choice=none ;; esac
fi
cmd=""
if [ "$choice" != "none" ] && [ -n "$choice" ] && ! has "$choice"; then
  case "$choice" in
    claude) cmd="curl -fsSL https://claude.ai/install.sh | bash" ;;
    codex)
      if PATH="$FULLPATH" command -v npm >/dev/null 2>&1; then cmd="npm install -g @openai/codex"
      else printf '\033[1;33m! Codex cần npm (Node.js). Cài Node.js từ nodejs.org rồi chạy: npm install -g @openai/codex\033[0m\n'; fi ;;
    agy) cmd="curl -fsSL https://antigravity.google/cli/install.sh | bash" ;;
  esac
fi
installed_now=""
if [ -n "$cmd" ]; then
  say "Cài $choice: $cmd"
  if bash -c "$cmd"; then
    printf '\033[1;32m✓ Đã cài %s.\033[0m\n' "$choice"
    have="$have $choice"
    installed_now=1
  else
    printf '\033[1;33m! Chưa cài được %s tự động. Cài thủ công theo hướng dẫn trong ⚙ Cài đặt của PVTA, mục AI trên máy.\033[0m\n' "$choice"
  fi
fi

# Đăng nhập một lần: PVTA dùng gói đăng ký nên CLI phải đăng nhập trước, nếu không câu hỏi đầu tiên sẽ báo lỗi.
if [ -n "$choice" ] && [ "$choice" != "none" ] && has "$choice" && [ -r /dev/tty ]; then
  # Tìm lệnh vừa cài (thư mục cài mới có thể chưa nằm trong PATH của Terminal này).
  bin="$(PATH="$FULLPATH:$HOME/.local/bin:$HOME/.antigravity/bin" command -v "$choice" 2>/dev/null || true)"
  if [ -n "$bin" ]; then
    echo
    echo "Đăng nhập $choice ngay bây giờ? Một cửa sổ đăng nhập (trình duyệt) sẽ mở; đăng nhập xong, gõ /exit hoặc bấm Ctrl+C hai lần để quay lại đây."
    printf "Đăng nhập ngay? [C/k]: "
    read -r yn </dev/tty || yn=k
    case "$yn" in
      k|K|n|N) echo "   Để sau: mở Terminal, gõ $choice để đăng nhập một lần." ;;
      *) if [ "$choice" = codex ]; then "$bin" login </dev/tty >/dev/tty 2>&1 || true; else "$bin" </dev/tty >/dev/tty 2>&1 || true; fi; printf '\033[1;32m✓ Xong bước đăng nhập %s.\033[0m\n' "$choice" ;;
    esac
  else
    echo "   Mở Terminal mới, gõ $choice để đăng nhập một lần."
  fi
fi

# Công cụ vừa cài nằm trong thư mục mới: khởi động lại PVTA để nó dò lại.
if [ -n "$installed_now" ]; then
  launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null || true
fi

echo
say "Đã cài xong PVTA."
[ -n "$have" ] || printf '\033[1;33m! Chưa thấy claude, codex hoặc agy trên máy. Cài và đăng nhập một CLI (hoặc nhập khóa API trong ⚙ Cài đặt của PVTA) để PVTA trả lời được.\033[0m\n'
echo "   Mở lại Word / Excel / PowerPoint → Chèn (Insert) → Phần bổ trợ (Add-ins) → Phần bổ trợ của tôi → PVTA."
