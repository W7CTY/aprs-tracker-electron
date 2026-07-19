'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');

// ── Constants ────────────────────────────────────────────────────────────────

const APP_TITLE    = 'APRSaR Tracker';
const APP_SUBTITLE = 'Ham Radio & SAR Toolkit';
const GITHUB_REPO  = 'W7CTY/aprs-tracker';
const HTML_ASSET   = 'aprs-tracker.html';

// Where we cache the downloaded HTML core locally
const DATA_DIR     = path.join(app.getPath('userData'), 'core');
const HTML_CACHE   = path.join(DATA_DIR, 'aprs-tracker.html');
const VERSION_FILE = path.join(DATA_DIR, 'core-version.json');

// Bundled fallback HTML shipped with the installer
// In packaged app: process.resourcesPath = win-unpacked/resources/
//   HTML is at resources/build/aprs-tracker.html (via extraResources)
// In dev: use local build/ directory
// Encrypted HTML blob — plaintext never written to disk
const BUNDLED_ENC = app.isPackaged
  ? path.join(process.resourcesPath, 'build', 'aprs-tracker.html.enc')
  : path.join(__dirname, '..', 'build', 'aprs-tracker.html.enc');

// Encryption key — XOR-obfuscated integer array (no ASCII hex in binary)
const HTML_KEY = (function() {
  const _K = [174,200,113,134,155,107,64,223,92,40,113,70,16,28,78,136,
              174,97,1,20,145,175,253,172,100,21,204,232,190,148,182,1];
  const _S = [90,60,113,136,175,18,109,228,155,39,243,78,129,197,48,118,
              90,60,113,136,175,18,109,228,155,39,243,78,129,197,48,118];
  return Buffer.from(_K.map(function(b,i){ return b ^ _S[i]; }));
})();

function decryptHTML(encPath) {
  try {
    const enc    = fs.readFileSync(encPath);
    let   offset = 0;
    const ivLen  = enc.readUInt16BE(offset); offset += 2;
    const iv     = enc.slice(offset, offset + ivLen); offset += ivLen;
    const tagLen = enc.readUInt16BE(offset); offset += 2;
    const tag    = enc.slice(offset, offset + tagLen); offset += tagLen;
    const data   = enc.slice(offset);
    const _alg  = ['aes',['256','gcm'].join('-')].join('-');
    const dec    = crypto.createDecipheriv(_alg, HTML_KEY, iv);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(data), dec.final()]).toString('utf8');
  } catch (e) {
    console.error('[APRSaR] decryptHTML failed:', e.message);
    return null;
  }
}

// ── State ────────────────────────────────────────────────────────────────────

let mainWindow = null;

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();
  scheduleHtmlUpdate();
  setupWrapperAutoUpdater();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 860,
    minWidth:  900,
    minHeight: 600,
    title: APP_TITLE,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'build', 'icon.ico')
      : path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,          // required: HTML uses local file:// sub-resources
      allowRunningInsecureContent: true,
    },
    show: false,                   // show after ready-to-show to avoid white flash
  });

  // Match Linux subtitle via title — Electron doesn't have a subtitle field
  mainWindow.setTitle(`${APP_TITLE} — ${APP_SUBTITLE}`);

  buildMenu();
  loadApp();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in the system browser, not a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Menu ──────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'APRSaR Tracker',
      submenu: [
        { label: 'About APRSaR Tracker', click: showAbout },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => checkHtmlUpdate(true) },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Fullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal(`https://github.com/${GITHUB_REPO}`),
        },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal(`https://github.com/${GITHUB_REPO}/issues`),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Load HTML core ────────────────────────────────────────────────────────────

function loadApp() {
  // Decrypt HTML into memory — plaintext never touches disk
  const encPath  = fs.existsSync(HTML_CACHE + '.enc') ? HTML_CACHE + '.enc' : BUNDLED_ENC;
  const htmlText = decryptHTML(encPath);

  if (!htmlText) {
    mainWindow.loadURL('data:text/html,<h2 style="font-family:sans-serif;padding:40px;color:#c00">'
      + 'APRSaR Tracker: Could not load application data.<br>'
      + '<small>The installation may be corrupted. Please reinstall.</small></h2>');
    return;
  }

  // Seed version from decrypted content
  try {
    const vMatch = htmlText.match(/APRSaR Tracker v([\d.]+)/);
    if (vMatch) saveCoreVersion(vMatch[1]);
  } catch (e) { /* ignore */ }

  // Load via data URL — stays in memory, never written to disk as plaintext
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlText);
  mainWindow.loadURL(dataUrl);

  // Log renderer errors to main process console
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('[APRSaR] Page load failed:', code, desc, url);
  });

  mainWindow.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2) console.error('[renderer]', msg);
  });

  // Inject version info after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    const coreVersion = getCoreVersion();
    mainWindow.webContents.executeJavaScript(`
      window.APP_VERSION     = ${JSON.stringify(coreVersion)};
      window.APP_REPO_URL    = 'https://github.com/${GITHUB_REPO}';
      window.APP_PLATFORM    = process.platform === 'win32' ? 'windows' : 'linux';
      // Clear any stale localStorage keys from previous installs
      localStorage.removeItem('legal_accepted_version');
      localStorage.removeItem('app_lock_hash');
      localStorage.removeItem('app_lock_recovery');
      localStorage.removeItem('app_lock_timeout_min');
    `).catch(() => {});
  });
}

// ── HTML core auto-update ─────────────────────────────────────────────────────

function scheduleHtmlUpdate() {
  // Check on startup (silently), then every 6 hours
  checkHtmlUpdate(false);
  setInterval(() => checkHtmlUpdate(false), 6 * 60 * 60 * 1000);
}

function checkHtmlUpdate(userInitiated) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  fetchJson(url, (err, data) => {
    if (err || !data) {
      if (userInitiated) showError('Update check failed', err ? err.message : 'No data returned.');
      return;
    }

    const tag = (data.tag_name || '').replace(/^v/, '');
    const current = getCoreVersion();

    if (!isNewer(tag, current)) {
      if (userInitiated) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Up to Date',
          message: `APRSaR Tracker core is up to date (${current}).`,
        });
      }
      return;
    }

    // Find the HTML asset in the release
    const asset = (data.assets || []).find(a => a.name === HTML_ASSET);
    if (!asset) {
      if (userInitiated) showError('Update error', `No ${HTML_ASSET} asset found in release ${tag}.`);
      return;
    }

    downloadHtml(asset.browser_download_url, tag, userInitiated);
  });
}

function downloadHtml(url, version, userInitiated) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = HTML_CACHE + '.tmp';
  const file = fs.createWriteStream(tmp);

  const req = https.get(url, { headers: { 'User-Agent': 'aprs-tracker-electron' } }, res => {
    // Follow redirects (GitHub releases use them)
    if (res.statusCode === 302 || res.statusCode === 301) {
      file.close();
      fs.unlink(tmp, () => {});
      downloadHtml(res.headers.location, version, userInitiated);
      return;
    }
    res.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        fs.renameSync(tmp, HTML_CACHE);
        saveCoreVersion(version);
        if (userInitiated || mainWindow) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'App Updated',
            message: `APRSaR Tracker updated to v${version}.\nReloading now.`,
            buttons: ['OK'],
          }).then(() => {
            loadApp();
          });
        } else {
          // Silent background update — reload immediately
          loadApp();
        }
      });
    });
  });

  req.on('error', err => {
    fs.unlink(tmp, () => {});
    if (userInitiated) showError('Download failed', err.message);
  });
}

// ── Wrapper auto-updater (electron-updater) ───────────────────────────────────

function setupWrapperAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Installer Update Ready',
      message: 'A new version of APRSaR Tracker has been downloaded.\nIt will install when you exit the app.',
      buttons: ['OK'],
    });
  });

  // Check for wrapper updates silently on launch
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // No update server configured yet — ignore silently
  });
}

// ── Version helpers ───────────────────────────────────────────────────────────

function getCoreVersion() {
  try {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    return data.version || 'bundled';
  } catch {
    return 'bundled';
  }
}

function saveCoreVersion(version) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(VERSION_FILE, JSON.stringify({ version, updated: new Date().toISOString() }));
}

function isNewer(remote, local) {
  if (local === 'bundled') return true;
  const parse = v => v.replace(/[^0-9.]/g, '').split('.').map(Number);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0, lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fetchJson(url, cb) {
  const opts = {
    headers: {
      'User-Agent': 'aprs-tracker-electron',
      'Accept': 'application/vnd.github+json',
    },
  };
  https.get(url, opts, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      try { cb(null, JSON.parse(body)); }
      catch (e) { cb(e, null); }
    });
  }).on('error', e => cb(e, null));
}

function showError(title, message) {
  dialog.showErrorBox(title, message);
}

function showAbout() {
  const coreVersion  = getCoreVersion();
  const wrapVersion  = app.getVersion();
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About APRSaR Tracker',
    message: 'APRSaR Tracker',
    detail: [
      `${APP_SUBTITLE}`,
      '',
      `Wrapper version:  ${wrapVersion}`,
      `App core version: ${coreVersion}`,
      '',
      `https://github.com/${GITHUB_REPO}`,
    ].join('\n'),
  });
}
