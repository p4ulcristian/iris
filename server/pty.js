import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { getSessionName, sanitizeName, sessionExists } from './gods.js'
import { ZELLIJ_CONFIG_DIR, ZELLIJ_BIN } from './config.js'

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

function getZellijScrollback(godName) {
  const sessionName = getSessionName(godName)
  const tmpFile = path.join(os.tmpdir(), `iris-scrollback-${sanitizeName(godName)}-${Date.now()}.txt`)

  try {
    execSync(`${ZELLIJ_BIN} --config-dir "${ZELLIJ_CONFIG_DIR}" -s ${sessionName} action dump-screen --full "${tmpFile}"`, {
      timeout: 5000,
      stdio: 'pipe'
    })

    if (fs.existsSync(tmpFile)) {
      const content = fs.readFileSync(tmpFile, 'utf-8')
      fs.unlinkSync(tmpFile)
      ptyLog(`[zellij-scrollback] ${godName}: got ${content.length} chars from zellij`)
      return content
    }
  } catch (e) {
    ptyLog(`[zellij-scrollback] ${godName}: failed - ${e.message}`)
    // Clean up temp file if it exists
    try { fs.unlinkSync(tmpFile) } catch {}
  }
  return ''
}

function appendToBuffer(godName, data) {
  let buffer = outputBuffers.get(godName) || ''
  buffer += data

  // Trim from start if too large
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(-MAX_BUFFER_SIZE)
  }

  outputBuffers.set(godName, buffer)
}

export function getOutputBuffer(godName, lines = 50) {
  const buffer = outputBuffers.get(godName)
  if (!buffer) return ''

  // Return last N lines
  const allLines = buffer.split('\n')
  const startIdx = Math.max(0, allLines.length - lines)
  return allLines.slice(startIdx).join('\n')
}

export function getFullBuffer(godName) {
  return outputBuffers.get(godName) || ''
}

export function clearOutputBuffer(godName) {
  outputBuffers.delete(godName)
}

export function attachPty(godName, ws, cols, rows) {
  const attachStart = Date.now()
  const T = () => `T+${Date.now() - attachStart}ms`
  const sessionName = getSessionName(godName)
  ptyLog(`[pty:attach] ${T()} START ${godName} (session: ${sessionName})`)

  // Wait for zellij session to exist (it may still be starting)
  // Poll up to 3 seconds for session to appear
  const maxAttempts = 30
  const pollInterval = 100
  let attempts = 0

  const waitForSession = () => {
    attempts++
    if (sessionExists(godName)) {
      ptyLog(`[pty:attach] ${T()} Session found after ${attempts} attempts`)
      doAttach()
      return
    }
    if (attempts >= maxAttempts) {
      ptyLog(`[pty:attach] ${godName}: session not found after ${maxAttempts * pollInterval}ms`)
      ws.send(JSON.stringify({ event: 'error', message: `Session not found: ${sessionName}` }))
      return
    }
    setTimeout(waitForSession, pollInterval)
  }

  const doAttach = () => {
    // Session exists, proceed with attach
    attachPtyInternal(godName, ws, cols, rows, sessionName, T)
  }

  waitForSession()
}

function attachPtyInternal(godName, ws, cols, rows, sessionName, T) {
  ptyLog(`[pty:attach] ${T()} attachPtyInternal START`)

  // If PTY already exists for this god, just add client and send buffered content
  if (ptyProcesses.has(godName)) {
    const entry = ptyProcesses.get(godName)
    entry.clients.add(ws)
    ptyLog(`[pty:attach] ${godName}: PTY exists, now ${entry.clients.size} clients`)

    // Resize PTY to match new client's dimensions (important for layout changes)
    if (entry.terminal && cols && rows &&
        Number.isInteger(cols) && Number.isInteger(rows) &&
        cols >= 10 && cols <= 500 && rows >= 5 && rows <= 200) {
      ptyLog(`[pty:attach] ${godName}: resizing existing PTY to ${cols}x${rows}`)
      entry.terminal.resize(cols, rows)
    }

    // Send buffered content to new client
    const buffer = outputBuffers.get(godName)
    if (buffer && ws.readyState === 1) {
      ws.send(JSON.stringify({ event: 'pty:output', godName, data: buffer }))
      ptyLog(`[pty:attach] ${godName}: sent ${buffer.length} chars of buffer to new client`)
    }
    return
  }

  // Try to get scrollback: memory buffer first, then Zellij
  let buffer = outputBuffers.get(godName)
  ptyLog(`[pty:attach] ${godName}: memory buffer = ${buffer ? buffer.length + ' chars' : 'none'}`)

  if (!buffer) {
    // Get scrollback directly from Zellij
    buffer = getZellijScrollback(godName)
    if (buffer) {
      outputBuffers.set(godName, buffer)
    }
  }

  const clients = new Set([ws])

  // Attach to zellij session using Bun.Terminal
  let proc
  try {
    proc = Bun.spawn([ZELLIJ_BIN, '--config-dir', ZELLIJ_CONFIG_DIR, 'attach', sessionName], {
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
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

  ptyLog(`[pty:attach] ${T()} Bun.spawn completed`)

  if (!proc.terminal) {
    ptyLog(`[pty:attach] ${godName}: proc.terminal is undefined after spawn`)
  }

  ptyProcesses.set(godName, { proc, terminal: proc.terminal, clients, sessionName })

  // Send buffered content to client (from Zellij scrollback)
  if (buffer && ws.readyState === 1) {
    ws.send(JSON.stringify({ event: 'pty:output', godName, data: buffer }))
    ptyLog(`[pty:attach] ${godName}: sent ${buffer.length} chars of scrollback to client`)
  }

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

  // Kill PTY when last client disconnects - this detaches from Zellij
  // Next connection will create fresh PTY with correct size
  // (Zellij uses minimum size of all attached clients, so stale clients cause sizing issues)
  if (entry.clients.size === 0) {
    ptyLog(`[detach] ${godName}: last client disconnected, killing PTY to detach from Zellij`)
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
  // Validate dimensions to prevent invalid resize
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    ptyLog(`[pty:resize] ${godName}: invalid non-integer dimensions ${cols}x${rows}`)
    return
  }
  if (cols < 10 || cols > 500 || rows < 5 || rows > 200) {
    ptyLog(`[pty:resize] ${godName}: dimensions out of bounds ${cols}x${rows}`)
    return
  }

  const entry = ptyProcesses.get(godName)
  if (entry?.terminal) {
    ptyLog(`[pty:resize] ${godName}: resizing to ${cols}x${rows}`)
    entry.terminal.resize(cols, rows)
  } else {
    ptyLog(`[pty:resize] ${godName}: no PTY entry found`)
  }
}

export function detachAllFromClient(ws) {
  const toKill = []
  ptyProcesses.forEach((entry, godName) => {
    entry.clients.delete(ws)
    ptyLog(`[detach] ${godName}: ${entry.clients.size} clients remaining`)
    if (entry.clients.size === 0) {
      toKill.push(godName)
    }
  })
  // Kill PTYs with no clients - detach from Zellij so next attach gets correct size
  toKill.forEach(godName => {
    const entry = ptyProcesses.get(godName)
    if (entry) {
      ptyLog(`[detach] ${godName}: last client disconnected, killing PTY to detach from Zellij`)
      entry.proc.kill()
      ptyProcesses.delete(godName)
    }
  })
}

export function killPty(godName) {
  const entry = ptyProcesses.get(godName)
  if (!entry) return

  ptyLog(`[pty:kill] ${godName}: killing PTY`)
  entry.proc.kill()
  ptyProcesses.delete(godName)
}

export function killAllPty() {
  ptyProcesses.forEach((entry) => {
    entry.proc.kill()
  })
  ptyProcesses.clear()
}
