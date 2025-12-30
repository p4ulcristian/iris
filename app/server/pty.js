import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSocketPath, sanitizeName, SOCKET_DIR } from './gods.js'

const PTY_LOG = path.join(os.homedir(), '.local/share/iris/logs/pty-debug.log')
function ptyLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(msg)
  try { fs.appendFileSync(PTY_LOG, line) } catch {}
}

// godName -> { proc, terminal, clients: Set<ws>, socketPath }
export const ptyProcesses = new Map()

// godName -> string (raw output buffer - preserves ANSI codes)
const outputBuffers = new Map()
const MAX_BUFFER_SIZE = 100000 // ~100KB per terminal

function getBufferPath(godName) {
  return path.join(SOCKET_DIR, `${sanitizeName(godName)}.buf`)
}

function loadBufferFromDisk(godName) {
  const bufferPath = getBufferPath(godName)
  try {
    if (fs.existsSync(bufferPath)) {
      return fs.readFileSync(bufferPath, 'utf-8')
    }
  } catch {}
  return ''
}

function saveBufferToDisk(godName) {
  const buffer = outputBuffers.get(godName) || ''
  const bufferPath = getBufferPath(godName)
  try {
    fs.writeFileSync(bufferPath, buffer)
  } catch {}
}

// Debounced save - don't write on every output
const saveTimeouts = new Map()
function debouncedSave(godName) {
  if (saveTimeouts.has(godName)) {
    clearTimeout(saveTimeouts.get(godName))
  }
  saveTimeouts.set(godName, setTimeout(() => {
    saveBufferToDisk(godName)
    saveTimeouts.delete(godName)
  }, 1000))
}

function appendToBuffer(godName, data) {
  let buffer = outputBuffers.get(godName) || ''
  buffer += data

  // Trim from start if too large
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(-MAX_BUFFER_SIZE)
  }

  outputBuffers.set(godName, buffer)
  debouncedSave(godName)
}

export function getOutputBuffer(godName, lines = 50) {
  // First try memory, then disk
  let buffer = outputBuffers.get(godName)
  if (!buffer) {
    buffer = loadBufferFromDisk(godName)
    if (buffer) {
      outputBuffers.set(godName, buffer)
    }
  }

  if (!buffer) return ''

  // Return last N lines
  const allLines = buffer.split('\n')
  const startIdx = Math.max(0, allLines.length - lines)
  return allLines.slice(startIdx).join('\n')
}

export function getFullBuffer(godName) {
  let buffer = outputBuffers.get(godName)
  if (!buffer) {
    buffer = loadBufferFromDisk(godName)
    if (buffer) {
      outputBuffers.set(godName, buffer)
    }
  }
  return buffer || ''
}

export function clearOutputBuffer(godName) {
  outputBuffers.delete(godName)
  const bufferPath = getBufferPath(godName)
  try {
    if (fs.existsSync(bufferPath)) {
      fs.unlinkSync(bufferPath)
    }
  } catch {}
}

export function attachPty(godName, ws, cols, rows) {
  ptyLog(`[pty:attach] START ${godName}`)
  const socketPath = getSocketPath(godName)

  if (!fs.existsSync(socketPath)) {
    ptyLog(`[pty:attach] ${godName}: socket not found at ${socketPath}`)
    ws.send(JSON.stringify({ event: 'error', message: `Socket not found: ${socketPath}` }))
    return
  }

  // If PTY already exists for this god, just add client and send buffer
  if (ptyProcesses.has(godName)) {
    const entry = ptyProcesses.get(godName)
    entry.clients.add(ws)
    ptyLog(`[pty:attach] ${godName}: PTY exists, now ${entry.clients.size} clients`)

    // Buffer replay disabled - was causing duplicate/glitched output
    // New clients will just see ongoing output from here
    ptyLog(`[pty:attach] ${godName}: new client added, skipping buffer replay`)
    return
  }

  // Check memory buffer first (more recent), then fall back to disk
  let buffer = outputBuffers.get(godName)
  ptyLog(`[pty:attach] ${godName}: memory buffer = ${buffer ? buffer.length + ' chars' : 'none'}`)
  if (!buffer) {
    buffer = loadBufferFromDisk(godName)
    ptyLog(`[pty:attach] ${godName}: disk buffer = ${buffer ? buffer.length + ' chars' : 'none'}`)
    if (buffer) {
      outputBuffers.set(godName, buffer)
    }
  }

  // Store buffer to send after resize jiggle (so bash redraw doesn't overwrite it)
  const pendingBuffer = buffer

  const clients = new Set([ws])

  // Spawn using Bun.Terminal
  // Use -r winch to force SIGWINCH redraw method (needed for nvim and other TUI apps)
  const proc = Bun.spawn(['dtach', '-a', socketPath, '-r', 'winch'], {
    terminal: {
      cols: cols || 120,
      rows: rows || 40,
      data(terminal, data) {
        const entry = ptyProcesses.get(godName)
        if (!entry) return

        const dataStr = data.toString()

        // Store in buffer for peek
        appendToBuffer(godName, dataStr)

        const msg = JSON.stringify({ event: 'pty:output', godName, data: dataStr })
        entry.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(msg)
          }
        })
      }
    }
  })

  ptyProcesses.set(godName, { proc, terminal: proc.terminal, clients, socketPath })

  // Resize jiggle disabled - was causing visual glitches
  // dtach -r winch already triggers a redraw via SIGWINCH

  // Handle process exit
  proc.exited.then((exitCode) => {
    console.log(`PTY for ${godName} exited with code ${exitCode}`)
    const entry = ptyProcesses.get(godName)
    if (entry) {
      entry.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ event: 'god:exited', godName }))
        }
      })
      ptyProcesses.delete(godName)
    }
  })
}

export function detachPty(godName, ws) {
  const entry = ptyProcesses.get(godName)
  if (!entry) return

  entry.clients.delete(ws)

  // If no more clients, kill process (but NOT the dtach session)
  if (entry.clients.size === 0) {
    // Flush buffer to disk before detaching (in case of pending debounced save)
    saveBufferToDisk(godName)
    entry.proc.kill()
    ptyProcesses.delete(godName)
  }
}

export function sendToPty(godName, data) {
  const entry = ptyProcesses.get(godName)
  if (entry?.terminal) {
    entry.terminal.write(data)
  }
}

export function resizePty(godName, cols, rows) {
  const entry = ptyProcesses.get(godName)
  if (entry?.terminal) {
    entry.terminal.resize(cols, rows)
  }
}

export function detachAllFromClient(ws) {
  ptyProcesses.forEach((entry, godName) => {
    entry.clients.delete(ws)
    ptyLog(`[detach] ${godName}: ${entry.clients.size} clients remaining`)
    if (entry.clients.size === 0) {
      // Flush buffer to disk before detaching (in case of pending debounced save)
      const buf = outputBuffers.get(godName)
      ptyLog(`[detach] ${godName}: saving buffer (${buf ? buf.length + ' chars' : 'none'}) to disk`)
      saveBufferToDisk(godName)
      entry.proc.kill()
      ptyProcesses.delete(godName)
    }
  })
}

export function killAllPty() {
  ptyProcesses.forEach((entry) => {
    entry.proc.kill()
  })
  ptyProcesses.clear()
}
