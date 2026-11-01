// ScratchCode desktop app (Windows .exe, macOS .dmg, Linux .AppImage).
// Serves the built web app from inside the package through a private app:// scheme, so it works
// fully offline. Account, cloud and AI assistant are hidden in this version (see src/platform.js).
// Works like Scratch Desktop: native "Save as" dialog, .sb3 double-click, window remembered,
// keyboard zoom and full screen, nothing lost when the window is closed.
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
const RELEASES = 'https://api.github.com/repos/luciencard/scratchcode-desktop/releases/latest';
const DOWNLOAD_PAGE = 'https://scratchcode.web.app/installer/';
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;
let pendingFile = process.argv.find(a => /\.sb3$/i.test(a)) || null;

// ---------- small settings file (window size, last folder) ----------
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch {}
function saveSettings () {
  try { fs.writeFileSync(SETTINGS, JSON.stringify(settings)); } catch {}
}
function lastFolder () {
  const dir = settings.lastFolder;
  return dir && fs.existsSync(dir) ? dir : app.getPath('documents');
}

function createWindow () {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1400, height: b.height || 900, x: b.x, y: b.y, minWidth: 900, minHeight: 600,
    backgroundColor: '#e9f1fc', title: 'ScratchCode', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  win.once('ready-to-show', () => {
    if (settings.maximized) win.maximize();
    win.show();
  });
  if (process.env.SC_SMOKE) {
    // automated check: report whether the editor booted, then quit
    win.webContents.on('console-message', (e, level, msg) => { if (level >= 3) console.log('[page error]', msg); });
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const r = await win.webContents.executeJavaScript(`JSON.stringify({ platform: document.documentElement.dataset.platform, blocks: document.querySelectorAll('.pal-item').length, sprites: document.querySelectorAll('.sprite-tile').length, login: getComputedStyle(document.getElementById('loginBtn')).display })`);
      console.log('[smoke]', r);
      win.destroy();
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

  // "Save to your computer": a real "Save as" window that remembers the folder, like Scratch Desktop
  win.webContents.session.on('will-download', (e, item) => {
    const name = item.getFilename();
    const ext = path.extname(name).slice(1).toLowerCase();
    const filters = ext === 'sb3' ? [{ name: 'Projet Scratch', extensions: ['sb3'] }]
      : ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [];
    item.setSaveDialogOptions({ title: 'Enregistrer', defaultPath: path.join(lastFolder(), name), filters });
    item.once('done', (ev, state) => {
      if (state !== 'completed') return;
      settings.lastFolder = path.dirname(item.getSavePath());
      saveSettings();
    });
  });

  // Ctrl + / Ctrl - / Ctrl 0 zoom, F11 full screen (Windows and Linux have no menu bar for these)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const wc = win.webContents;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    else if (ctrl && (input.key === '+' || input.key === '=')) wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 3));
    else if (ctrl && input.key === '-') wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3));
    else if (ctrl && input.key === '0') wc.setZoomLevel(0);
    else return;
    e.preventDefault();
  });

  // Closing: remember the window, then let the editor save the project (it saves when the page is
  // hidden) so it is restored next time.
  let closing = false;
  win.on('close', e => {
    settings.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isFullScreen()) settings.bounds = win.getBounds();
    saveSettings();
    if (closing || process.env.SC_SMOKE) return;
    e.preventDefault();
    closing = true;
    win.hide();
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 2000);
  });
}

function sendFile (file) {
  if (!file || !win) return;
  fs.readFile(file, (err, buf) => {
    if (err) return;
    settings.lastFolder = path.dirname(file);
    saveSettings();
    win.webContents.send('open-file', { name: path.basename(file), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  });
}

// Tells the user when a newer version is on GitHub. Silent when offline.
async function checkForUpdate () {
  try {
    const res = await net.fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const latest = String((await res.json()).tag_name || '').replace(/^v/, '');
    const newer = (a, b) => {
      const x = a.split('.').map(Number); const y = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
      return false;
    };
    if (!latest || !newer(latest, app.getVersion()) || settings.skipVersion === latest) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Mise à jour disponible',
      message: `ScratchCode ${latest} est disponible.`,
      detail: `Tu as la version ${app.getVersion()}. Télécharge la nouvelle version et installe-la par-dessus : tes projets sont conservés.`,
      buttons: ['Télécharger', 'Plus tard', 'Ignorer cette version'],
      defaultId: 0, cancelId: 1
    });
    if (response === 0) shell.openExternal(DOWNLOAD_PAGE);
    if (response === 2) { settings.skipVersion = latest; saveSettings(); }
  } catch {}
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
  if (!process.env.SC_SMOKE) setTimeout(checkForUpdate, 8000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
