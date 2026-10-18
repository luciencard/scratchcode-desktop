// Tells the web app it runs in the desktop version and passes .sb3 files opened with the app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scDesktop', true);
contextBridge.exposeInMainWorld('scDesktopAPI', {
  onOpenFile: cb => {
    ipcRenderer.on('open-file', (e, file) => cb(file));
    ipcRenderer.invoke('app-ready');
  }
});
