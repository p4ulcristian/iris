import { contextBridge } from 'electron'

// Only expose the WebSocket URL - everything else goes through WS
contextBridge.exposeInMainWorld('iris', {
  wsUrl: 'ws://localhost:9999'
})
