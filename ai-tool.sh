#!/usr/bin/env sh
set -eu
BRAIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "${PVTA_BRAIN:-$BRAIN_DIR/brain/target/release/pvta-brain}" "$@"
