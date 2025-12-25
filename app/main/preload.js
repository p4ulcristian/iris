import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('iris', {
  wsUrl: 'ws://localhost:9999',
  // Window controls for frameless
  windowControl: (action) => ipcRenderer.send('window-control', action)
})
