#!/bin/bash
# APRSaR Tracker — Electron/Windows build script
# Run on Linux with Wine + electron-builder, or on Windows with Node.js installed.
# Requires: node, npm, wine (for cross-compile from Linux)
#
# Usage: bash build-win.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo ""
echo "--------------------------------------------"
echo "  APRSaR Tracker Windows Build"
echo "  W7CTY / 914 Communications"
echo "--------------------------------------------"
echo ""

# Verify node/npm
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node not found. Install Node.js first."
    echo "  sudo dnf install nodejs  OR  https://nodejs.org"
    exit 1
fi

echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo ""

# Copy latest HTML core from Linux source as the bundled fallback
LINUX_HTML="../aprs-desktop/src/aprs-tracker.html"
if [ -f "${LINUX_HTML}" ]; then
    echo "Copying latest aprs-tracker.html from Linux source..."
    cp "${LINUX_HTML}" build/aprs-tracker.html
    echo "HTML core: OK"
else
    echo "WARNING: ${LINUX_HTML} not found — using existing build/aprs-tracker.html"
    if [ ! -f "build/aprs-tracker.html" ]; then
        echo "ERROR: No HTML core found. Cannot build."
        exit 1
    fi
fi
echo ""

# Install npm dependencies
echo "Installing dependencies..."
npm install --prefer-offline 2>&1 | tail -5
echo "Dependencies: OK"
echo ""

# Build Windows installer
echo "Building Windows installer..."
npm run build
echo ""

INSTALLER=$(find dist -name "*.exe" 2>/dev/null | sort -V | tail -1)
if [ -z "${INSTALLER}" ]; then
    echo "ERROR: No .exe found in dist/. Check build output above."
    exit 1
fi

echo "--------------------------------------------"
echo "  Build complete:"
echo "  ${INSTALLER}"
echo ""
echo "  File size: $(du -sh "${INSTALLER}" | cut -f1)"
echo "--------------------------------------------"
echo ""
