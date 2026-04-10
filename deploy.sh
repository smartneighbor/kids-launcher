#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# deploy.sh  —  package and sideload Kids TV Launcher to the LG TV
#
# Prerequisites:
#   1. ares-cli installed:  npm i -g @webosose/ares-cli
#   2. TV in Developer Mode (LG Content Store → "Developer Mode" app)
#   3. TV added to ares:    ares-setup-device
#      Give it the name "lgtv" (or change DEVICE below)
#
# Usage:
#   ./deploy.sh            # package + install + launch
#   ./deploy.sh --package  # package only (creates .ipk)
#   ./deploy.sh --install  # install already-built .ipk
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

DEVICE="${DEVICE:-lgtv}"
APP_ID="com.smartneighbor.kidslauncher"
PKG_DIR="./dist"
IPK="$PKG_DIR/${APP_ID}_1.0.0_all.ipk"

# ── Parse args ───────────────────────────────────────────────────
PACKAGE_ONLY=false
INSTALL_ONLY=false
for arg in "$@"; do
  case $arg in
    --package) PACKAGE_ONLY=true ;;
    --install) INSTALL_ONLY=true ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────
need_cmd() { command -v "$1" &>/dev/null || { echo "ERROR: '$1' not found. $2"; exit 1; }; }

need_cmd ares-package "Run: npm i -g @webosose/ares-cli"

# ── Package ──────────────────────────────────────────────────────
if ! $INSTALL_ONLY; then
  echo "→ Packaging…"
  mkdir -p "$PKG_DIR"
  ares-package . --outdir "$PKG_DIR"
  echo "  Built: $IPK"
fi

if $PACKAGE_ONLY; then exit 0; fi

# ── Install ──────────────────────────────────────────────────────
echo "→ Installing on device '$DEVICE'…"
ares-install --device "$DEVICE" "$IPK"

# ── Launch ───────────────────────────────────────────────────────
echo "→ Launching $APP_ID…"
ares-launch --device "$DEVICE" "$APP_ID"

echo "✓ Done."
