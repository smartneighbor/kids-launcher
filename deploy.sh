#!/usr/bin/env bash
# deploy.sh — package and sideload the Kids TV loader app to the LG TV via Developer Mode.
#
# Packages app/ (self-contained, no server needed besides Jellyfin).
#
# Usage:
#   ./deploy.sh            # package + install (does not open the app on the TV)
#   ./deploy.sh --launch   # package + install + open the app
#   ./deploy.sh --package  # package only

set -euo pipefail
cd "$(dirname "$0")"

DEVICE="${DEVICE:-tv}"
APP_ID=$(python3 -c 'import json; print(json.load(open("app/appinfo.json"))["id"])')
VERSION=$(python3 -c 'import json; print(json.load(open("app/appinfo.json"))["version"])')
PKG_DIR="./dist"
IPK="$PKG_DIR/${APP_ID}_${VERSION}_all.ipk"

command -v ares-package >/dev/null || { echo "ERROR: run npm i -g @webos-tools/cli"; exit 1; }

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR"
[[ -f app/config.js ]] || { echo "ERROR: app/config.js missing (see app/config.example.js)"; exit 1; }
ares-package app --outdir "$PKG_DIR" -e config.example.js
[[ "${1:-}" == "--package" ]] && exit 0

ares-install --device "$DEVICE" "$IPK"
[[ "${1:-}" == "--launch" ]] && ares-launch --device "$DEVICE" "$APP_ID"
echo "✓ $APP_ID $VERSION installed on $DEVICE"
