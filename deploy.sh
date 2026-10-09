#!/usr/bin/env bash
# deploy.sh — package and sideload Kids TV to the LG TV via Developer Mode.
#
# Prerequisites:
#   - npm i -g @webos-tools/cli
#   - TV registered in ares as "tv" (ares-setup-device), Developer Mode on
#   - config.js present (copy config.example.js and fill in the Jellyfin API key)
#
# Usage:
#   ./deploy.sh            # package + install + launch
#   ./deploy.sh --package  # package only

set -euo pipefail
cd "$(dirname "$0")"

DEVICE="${DEVICE:-tv}"
APP_ID=$(python3 -c 'import json; print(json.load(open("appinfo.json"))["id"])')
VERSION=$(python3 -c 'import json; print(json.load(open("appinfo.json"))["version"])')
PKG_DIR="./dist"
IPK="$PKG_DIR/${APP_ID}_${VERSION}_all.ipk"

[[ -f config.js ]] || { echo "ERROR: config.js missing (see config.example.js)"; exit 1; }
command -v ares-package >/dev/null || { echo "ERROR: run npm i -g @webos-tools/cli"; exit 1; }

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR"
ares-package . --outdir "$PKG_DIR" -e dist -e README.md -e deploy.sh -e config.example.js -e .git -e .gitignore
[[ "${1:-}" == "--package" ]] && exit 0

ares-install --device "$DEVICE" "$IPK"
ares-launch --device "$DEVICE" "$APP_ID"
echo "✓ $APP_ID $VERSION installed and launched on $DEVICE"
