import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('Another Iris instance is already running. Exiting.')
  app.quit()
}

let mainWindow = null
let serverProcess = null

function startServer() {
  const serverPath = path.join(__dirname, '../server/index.js')

  serverProcess = spawn('bun', ['run', serverPath], {
    cwd: path.join(__dirname, '../..'),
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env
  })

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err)
  })

  serverProcess.on('exit', (code) => {
    console.log(`Server exited with code ${code}`)
    serverProcess = null
  })

  console.log('Server process started')
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Iris',
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.setMenuBarVisibility(false)

  // Keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F11: Toggle fullscreen
    if (input.key === 'F11') {
      event.preventDefault()
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      return
    }

    // Zoom shortcuts (Ctrl +/-)
    if (input.control && !input.alt && !input.meta) {
      const zoomLevel = mainWindow.webContents.getZoomLevel()
      let zoomed = false

      if (input.key === '+' || input.key === '=') {
        mainWindow.webContents.setZoomLevel(zoomLevel + 0.5)
        zoomed = true
      } else if (input.key === '-') {
        mainWindow.webContents.setZoomLevel(zoomLevel - 0.5)
        zoomed = true
      } else if (input.key === '0') {
        mainWindow.webContents.setZoomLevel(0)
        zoomed = true
      }

      if (zoomed) {
        event.preventDefault()
        setTimeout(() => {
          mainWindow.webContents.executeJavaScript("window.dispatchEvent(new Event('iris:refit'))")
        }, 100)
      }
    }
  })

  // Load app
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-vite/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Forward renderer console to terminal
  mainWindow.webContents.on('console-message', (event, level, message) => {
    const prefix = ['[LOG]', '[WARN]', '[ERR]'][level] || '[LOG]'
    console.log(`${prefix} ${message}`)
  })
}

// IPC handlers for window control
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return

  switch (action) {
    case 'toggle-fullscreen':
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      break
    case 'minimize':
      mainWindow.minimize()
      break
    case 'maximize':
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
      break
    case 'close':
      mainWindow.close()
      break
  }
})

ipcMain.handle('window-is-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Folder'
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('open-external', async (_, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url)
  }
})

// Focus existing window when second instance tries to launch
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  startServer()

  // Give server a moment to start
  setTimeout(createWindow, 500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopServer()
})
