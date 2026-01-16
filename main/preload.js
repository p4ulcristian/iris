const { contextBridge, ipcRenderer } = require('electron')

// Get ws port from additionalArguments (sandboxed preloads can't require JSON files)
const wsPortArg = process.argv.find(arg => arg.startsWith('--ws-port='))
const wsPort = wsPortArg ? wsPortArg.split('=')[1] : '4243'

contextBridge.exposeInMainWorld('iris', {
  wsUrl: `ws://localhost:${wsPort}`,
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
