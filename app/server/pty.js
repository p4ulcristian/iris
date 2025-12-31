import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSessionName, sanitizeName, SOCKET_DIR, sessionExists } from './gods.js'
import { ZELLIJ_CONFIG_DIR } from './config.js'

const PTY_LOG = path.join(os.homedir(), '.local/share/iris/logs/pty-debug.log')
function ptyLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(msg)
  try { fs.appendFileSync(PTY_LOG, line) } catch {}
}

// godName -> { proc, terminal, clients: Set<ws>, sessionName }
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
  const sessionName = getSessionName(godName)
  ptyLog(`[pty:attach] START ${godName} (session: ${sessionName})`)

  // Check if zellij session exists
  if (!sessionExists(godName)) {
    ptyLog(`[pty:attach] ${godName}: zellij session not found`)
    ws.send(JSON.stringify({ event: 'error', message: `Session not found: ${sessionName}` }))
    return
  }

  // If PTY already exists for this god, just add client
  if (ptyProcesses.has(godName)) {
    const entry = ptyProcesses.get(godName)
    entry.clients.add(ws)
    ptyLog(`[pty:attach] ${godName}: PTY exists, now ${entry.clients.size} clients`)
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

  const clients = new Set([ws])

  // Attach to zellij session using Bun.Terminal
  let proc
  try {
    proc = Bun.spawn(['zellij', 'attach', sessionName], {
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ZELLIJ_CONFIG_DIR
      },
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
  } catch (e) {
    ptyLog(`[pty:attach] ${godName}: Bun.spawn failed: ${e.message}`)
    ws.send(JSON.stringify({ event: 'error', message: `PTY spawn failed: ${e.message}` }))
    return
  }

  if (!proc.terminal) {
    ptyLog(`[pty:attach] ${godName}: proc.terminal is undefined after spawn`)
  }

  ptyProcesses.set(godName, { proc, terminal: proc.terminal, clients, sessionName })

  // Handle process exit (zellij attach exited)
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

  // Keep PTY alive even with no clients - this prevents Claude Code input from getting stuck
  // The PTY will be killed explicitly when the god is banished via killPty()
  if (entry.clients.size === 0) {
    ptyLog(`[detach] ${godName}: last client disconnected, keeping PTY alive`)
    saveBufferToDisk(godName)
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
      // Keep PTY alive - just save buffer, don't kill
      ptyLog(`[detach] ${godName}: last client disconnected, keeping PTY alive`)
      saveBufferToDisk(godName)
    }
  })
}

export function killPty(godName) {
  const entry = ptyProcesses.get(godName)
  if (!entry) return

  ptyLog(`[pty:kill] ${godName}: killing PTY`)
  saveBufferToDisk(godName)
  entry.proc.kill()
  ptyProcesses.delete(godName)
}

export function killAllPty() {
  ptyProcesses.forEach((entry) => {
    entry.proc.kill()
  })
  ptyProcesses.clear()
}
