#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" == Linux ]]; then
 here="$(cd "$(dirname "$0")" && pwd)"
 if [[ -f "$here/chatbox.sh" ]]; then exec bash "$here/chatbox.sh" "$@"; fi
 linux_work="$(mktemp -d)"
 trap 'rm -rf "$linux_work"' EXIT
 curl -fLsS https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/installers/chatbox.sh -o "$linux_work/chatbox.sh"
 bash "$linux_work/chatbox.sh" "$@"
 exit 0
fi
here="$(cd "$(dirname "$0")" && pwd)"
for source_dir in "$here" "$here/.."; do
 if [[ -f "$source_dir/package.json" && -f "$source_dir/installers/source-macos.sh" ]]; then
  source_dir="$(cd "$source_dir" && pwd)"
  if [[ "${1:-}" == --uninstall ]]; then
   exec bash "$source_dir/installers/office.sh" --uninstall
  fi
  export PVTA_SOURCE_DIR="$source_dir"
  exec bash "$source_dir/installers/source-macos.sh" "$@"
 fi
done
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if [[ "${1:-}" == --uninstall ]]; then
 curl -fLsS https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/installers/office.sh -o "$work/install.sh"
else
 curl -fLsS https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/installers/source-macos.sh -o "$work/install.sh"
fi
bash "$work/install.sh" "$@"
