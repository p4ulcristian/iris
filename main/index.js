import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev mode logging
const isDev = !__dirname.includes('app.asar')
const projectRoot = isDev ? path.join(__dirname, '../..') : null
const frontendLogFile = projectRoot ? path.join(projectRoot, 'logs', 'frontend.txt') : null

function logToFrontend(level, message) {
  if (!isDev || !frontendLogFile) return
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const prefix = ['LOG', 'WARN', 'ERROR'][level] || 'LOG'
  const line = `[${timestamp}] [browser] ${prefix}: ${message}\n`
  try {
    fs.appendFileSync(frontendLogFile, line)
  } catch {}
}

function clearFrontendLog() {
  if (!isDev || !frontendLogFile) return
  try {
    const logsDir = path.dirname(frontendLogFile)
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    fs.writeFileSync(frontendLogFile, '')
  } catch {}
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('Another Iris instance is already running. Exiting.')
  app.quit()
}

let mainWindow = null
let splashWindow = null
let serverProcess = null

function startServer() {
  // In packaged app, server files are in app.asar.unpacked
  // In dev, they're in the regular location
  const isPackaged = app.isPackaged
  let serverDir

  if (isPackaged) {
    // Unpacked files go to app.asar.unpacked instead of app.asar
    serverDir = path.join(__dirname, '..').replace('app.asar', 'app.asar.unpacked')
  } else {
    serverDir = path.join(__dirname, '..')
  }

  const serverPath = path.join(serverDir, 'server/index.js')

  // Find bun - use bundled version in packaged app, or system bun in dev
  const homedir = os.homedir()
  let bunPath = 'bun'

  if (isPackaged) {
    // In packaged app: resources/bun/bun
    const bundledBun = path.join(process.resourcesPath, 'bun', 'bun')
    if (fs.existsSync(bundledBun)) {
      bunPath = bundledBun
      console.log(`Using bundled bun: ${bunPath}`)
    } else {
      console.warn('Bundled bun not found, falling back to system bun')
    }
  }

  // Use bun to run the server (needed for Bun.spawn terminal support)
  serverProcess = spawn(bunPath, ['run', serverPath], {
    cwd: serverDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PATH: `${path.join(homedir, '.bun/bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
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
    const proc = serverProcess
    serverProcess = null

    // Give server time to cleanup gracefully
    proc.kill('SIGTERM')

    // Force kill if still alive after 2s
    setTimeout(() => {
      try {
        process.kill(proc.pid, 0) // Check if still running
        console.log('Server still alive, force killing...')
        proc.kill('SIGKILL')
      } catch (e) {
        // Process already dead, good
      }
    }, 2000)
  }
}

function createSplash() {
  console.log('[splash] Creating splash window...')
  splashWindow = new BrowserWindow({
    width: 300,
    height: 200,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  const splashPath = path.join(__dirname, 'splash.html')
  console.log('[splash] Loading:', splashPath)
  splashWindow.loadFile(splashPath)
  splashWindow.show()
  console.log('[splash] Shown')

  splashWindow.on('closed', () => {
    console.log('[splash] Closed')
    splashWindow = null
  })
}

function closeSplash() {
  console.log('[splash] closeSplash called')
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Iris',
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Show main window when ready, close splash
  mainWindow.once('ready-to-show', () => {
    console.log('[main] ready-to-show fired, waiting 2s before closing splash')
    setTimeout(() => {
      console.log('[main] Now closing splash')
      closeSplash()
      mainWindow.show()
    }, 2000)
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

  // Forward renderer console to terminal and log file
  mainWindow.webContents.on('console-message', (event, level, message) => {
    const prefix = ['[LOG]', '[WARN]', '[ERR]'][level] || '[LOG]'
    console.log(`${prefix} ${message}`)
    logToFrontend(level, message)
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
  console.log('[app] whenReady fired')

  // Clear frontend log on startup
  clearFrontendLog()

  // Show splash immediately
  createSplash()

  // Start server
  startServer()
  createWindow()

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
  closeSplash()
  stopServer()
})
