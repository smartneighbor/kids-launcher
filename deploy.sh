#!/usr/bin/env bash
# deploy.sh — package and sideload the Kids TV loader app to the LG TV via Developer Mode.
#
# The TV app (tv/) is only a loader; the real app (web/) is served by Caddy on the
# always-on Mac (http://192.168.1.61:8790/). Changes in web/ are live immediately:
# no deploy needed. Only run this when tv/ changes.
#
# Usage:
#   ./deploy.sh            # package + install (does not open the app on the TV)
#   ./deploy.sh --launch   # package + install + open the app
#   ./deploy.sh --package  # package only

set -euo pipefail
cd "$(dirname "$0")"

DEVICE="${DEVICE:-tv}"
APP_ID=$(python3 -c 'import json; print(json.load(open("tv/appinfo.json"))["id"])')
VERSION=$(python3 -c 'import json; print(json.load(open("tv/appinfo.json"))["version"])')
PKG_DIR="./dist"
IPK="$PKG_DIR/${APP_ID}_${VERSION}_all.ipk"

command -v ares-package >/dev/null || { echo "ERROR: run npm i -g @webos-tools/cli"; exit 1; }

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR"
ares-package tv --outdir "$PKG_DIR"
[[ "${1:-}" == "--package" ]] && exit 0

ares-install --device "$DEVICE" "$IPK"
[[ "${1:-}" == "--launch" ]] && ares-launch --device "$DEVICE" "$APP_ID"
echo "✓ $APP_ID $VERSION installed on $DEVICE"
