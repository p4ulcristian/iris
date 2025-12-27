const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('iris', {
  wsUrl: 'ws://localhost:9999',
  // Window controls
  windowControl: (action) => ipcRenderer.send('window-control', action),
  isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  // File dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder')
})
