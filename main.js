// ScratchCode desktop app (Windows .exe, macOS .dmg, Linux .AppImage).
// Serves the built web app from inside the package through a private app:// scheme, so it works
// fully offline. Account, cloud and AI assistant are hidden in this version (see src/platform.js).
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;
let pendingFile = process.argv.find(a => /\.sb3$/i.test(a)) || null;

function createWindow () {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#e9f1fc', title: 'ScratchCode', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  win.once('ready-to-show', () => win.show());
  if (process.env.SC_SMOKE) {
    // automated check: report whether the editor booted, then quit
    win.webContents.on('console-message', (e, level, msg) => { if (level >= 3) console.log('[page error]', msg); });
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const r = await win.webContents.executeJavaScript(`JSON.stringify({ platform: document.documentElement.dataset.platform, blocks: document.querySelectorAll('.pal-item').length, sprites: document.querySelectorAll('.sprite-tile').length, login: getComputedStyle(document.getElementById('loginBtn')).display })`);
      console.log('[smoke]', r);
      app.quit();
    }, 6000));
  }
  win.loadURL('app://scratchcode/index.html');
  // links to other sites open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    // app:// pages opened in a new tab (privacy, terms…) are shown on the website
    shell.openExternal(url.startsWith('app://') ? 'https://scratchcode.web.app' + new URL(url).pathname : url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); }
  });
}

function sendFile (file) {
  if (!file || !win) return;
  fs.readFile(file, (err, buf) => {
    if (!err) win.webContents.send('open-file', { name: path.basename(file), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => {
  const file = argv.find(a => /\.sb3$/i.test(a));
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  sendFile(file);
});
app.on('open-file', (e, file) => { e.preventDefault(); if (win) sendFile(file); else pendingFile = file; }); // macOS

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file)) file = path.join(ROOT, 'index.html'); // single-page app fallback
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]) : null);
  ipcMain.handle('app-ready', () => { const f = pendingFile; pendingFile = null; if (f) setTimeout(() => sendFile(f), 300); return true; });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
