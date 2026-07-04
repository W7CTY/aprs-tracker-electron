# APRSaR Tracker — Windows

Windows desktop app for APRSaR Tracker. Built on Electron, wrapping the same HTML core as the Linux version.

## Install

Download `APRSaR-Tracker-Setup-x.x.x.exe` from [Releases](https://github.com/W7CTY/aprs-tracker-electron/releases) and run it.

## Updates

**App core** (the tracker itself) updates automatically in the background on each launch. No action needed.

**Installer/wrapper** updates are downloaded automatically and applied when you exit the app.

## Build from source

Requires Node.js 18+.

```bash
git clone https://github.com/W7CTY/aprs-tracker-electron
cd aprs-tracker-electron
bash build-win.sh
```

The installer will be in `dist/`.

## Changelog

### 1.0.0
- Initial Windows release
- Auto-updates HTML core from Linux repo releases
- Matches Linux version window layout and branding
