#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Linux ]] || { echo 'Trình cài này dành cho Linux.' >&2; exit 1; }
if [[ "${1:-}" == --uninstall ]]; then
 rm -f "$HOME/.local/bin/pvta.AppImage" "$HOME/.local/share/applications/pvta.desktop"
 echo 'Đã gỡ ứng dụng AppImage. Hội thoại và cấu hình được giữ nguyên.'
 exit 0
fi
here="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$here/installers/chatbox.sh" ]]; then exec bash "$here/installers/chatbox.sh" "$@"; fi
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
curl -fLsS https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/installers/chatbox.sh -o "$work/chatbox.sh"
bash "$work/chatbox.sh" "$@"
