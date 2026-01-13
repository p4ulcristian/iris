const { contextBridge, ipcRenderer } = require('electron')
const ports = require('../ports.json')

contextBridge.exposeInMainWorld('iris', {
  wsUrl: `ws://localhost:${ports.ws}`,
  // Window controls
  windowControl: (action) => ipcRenderer.send('window-control', action),
  isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  // File dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // OAuth popup for Google login
  openAuthPopup: (url, partition) => ipcRenderer.invoke('open-auth-popup', url, partition),
  // Import Chrome's Google session
  importChromeCookies: () => ipcRenderer.invoke('import-chrome-cookies')
})
