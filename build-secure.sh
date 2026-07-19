#!/usr/bin/env bash
# build-secure.sh — Full secure build pipeline for APRSaR Tracker
# Usage: bash build-secure.sh [--win] [--linux] [--both]
set -euo pipefail
cd "$(dirname "$0")"

PLATFORM="${1:---both}"
BUILT_DIRS=()

echo "[build-secure] APRSaR Tracker — Secure Build Pipeline"
echo "[build-secure] ======================================="

# Step 1: Encrypt HTML
echo ""
echo "[build-secure] Step 1/3 — Encrypting HTML..."
node tools/encrypt-html.js \
    ../aprs-desktop/src/aprs-tracker.html \
    build/aprs-tracker.html.enc

# Safety: remove any plaintext HTML from build dir
[ -f "build/aprs-tracker.html" ] && rm build/aprs-tracker.html

# Step 2: Compile main.js to V8 bytecode
echo ""
echo "[build-secure] Step 2/3 — Compiling main.js → V8 bytecode..."
node -e "
const bytenode = require('./node_modules/bytenode');
bytenode.compileFile({ filename:'./src/main.js', output:'./src/main.jsc', electron:true })
  .then(() => { const fs=require('fs'); console.log('[build-secure] main.jsc: '+fs.statSync('./src/main.jsc').size.toLocaleString()+'b bytecode'); })
  .catch(e => { console.error('[build-secure] Compile failed:',e.message); process.exit(1); });
"

# Step 3: Build Electron packages
echo ""
echo "[build-secure] Step 3/3 — Building..."

if [[ "$PLATFORM" == "--win" || "$PLATFORM" == "--both" ]]; then
    ./node_modules/.bin/electron-builder --win --x64 --dir
    BUILT_DIRS+=("dist/win-unpacked")
fi
if [[ "$PLATFORM" == "--linux" || "$PLATFORM" == "--both" ]]; then
    ./node_modules/.bin/electron-builder --linux --x64 --dir
    BUILT_DIRS+=("dist/linux-unpacked")
fi

# Verify each built dir
echo ""
echo "[build-secure] Verifying builds..."
FAIL=0
for dir in "${BUILT_DIRS[@]}"; do
    [ ! -d "$dir" ] && echo "[build-secure] ✗ $dir not found" && FAIL=1 && continue
    if [ -f "$dir/resources/build/aprs-tracker.html" ]; then
        echo "[build-secure] ✗ PLAINTEXT HTML IN $dir — COMPROMISED"; FAIL=1
    else
        echo "[build-secure] ✓ $dir — no plaintext HTML"
    fi
    if [ -f "$dir/resources/build/aprs-tracker.html.enc" ]; then
        SIZE=$(wc -c < "$dir/resources/build/aprs-tracker.html.enc")
        echo "[build-secure] ✓ $dir — encrypted .enc present (${SIZE}b)"
    else
        echo "[build-secure] ✗ ENCRYPTED HTML MISSING FROM $dir"; FAIL=1
    fi
done

[ $FAIL -eq 0 ] && echo "[build-secure] ✓ All builds verified clean." || exit 1
