'use strict';

// Preload runs in the renderer with access to Node APIs before the page loads.
// contextIsolation is ON so we expose only what the app HTML actually needs.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  // Allow the HTML app to trigger a manual update check from its own UI if needed
  checkForUpdates: () => ipcRenderer.send('check-html-update', true),
  platform: process.platform,
});
