import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { getSessionName, sanitizeName, sessionExists } from './gods.js'
import { ZELLIJ_CONFIG_DIR, ZELLIJ_BIN } from './config.js'
import { appState, saveState, broadcastState } from './state.js'

// Input buffer per terminal - captures typed commands
const inputBuffers = new Map()

// Handle PTY input - buffer keystrokes and capture command on Enter
export function handlePtyInput(entityId, data) {
  let buffer = inputBuffers.get(entityId) || ''

  for (const char of data) {
    const code = char.charCodeAt(0)

    if (code === 13 || code === 10) {
      // Enter pressed - capture command
      const command = buffer.trim()
      if (command && appState.entities[entityId]) {
        appState.entities[entityId].title = command
        saveState()
        broadcastState()
      }
      buffer = ''
    } else if (code === 127 || code === 8) {
      // Backspace - remove last char
      buffer = buffer.slice(0, -1)
    } else if (code === 3) {
      // Ctrl+C - clear buffer
      buffer = ''
    } else if (code === 21) {
      // Ctrl+U - clear line
      buffer = ''
    } else if (code >= 32 && code < 127) {
      // Printable ASCII
      buffer += char
    }
  }

  inputBuffers.set(entityId, buffer)
}

// Clear input buffer (e.g., when terminal closes)
export function clearInputBuffer(entityId) {
  inputBuffers.delete(entityId)
}

// Get shell PID for a Zellij session
function getShellPid(sessionName) {
  try {
    // Find Zellij server PID by session name
    const serverPid = execSync(`pgrep -f "zellij --server.*${sessionName}$"`, {
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim().split('\n')[0]

    if (!serverPid) return null

    // Get shell child of Zellij server
    const shellPid = execSync(`pgrep -P ${serverPid}`, {
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim().split('\n')[0]

    return shellPid || null
  } catch {
    return null
  }
}

// Get running command for a terminal by checking process tree
function getRunningCommand(sessionName) {
  try {
    const shellPid = getShellPid(sessionName)
    if (!shellPid) return null

    // Get command running under shell
    const cmdPid = execSync(`pgrep -P ${shellPid}`, {
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim().split('\n')[0]

    if (!cmdPid) return null // Shell is idle

    // Get command name (not full path)
    const cmdName = execSync(`ps -p ${cmdPid} -o comm=`, {
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()

    return cmdName || null
  } catch {
    return null
  }
}

// Get current working directory of terminal's shell
function getShellCwd(sessionName) {
  try {
    const shellPid = getShellPid(sessionName)
    if (!shellPid) return null

    // Read cwd from /proc
    const cwd = fs.readlinkSync(`/proc/${shellPid}/cwd`)
    // Return just the directory name
    return path.basename(cwd)
  } catch {
    return null
  }
}

// Poll terminal processes and update titles
let titlePollInterval = null

export function startTitlePolling() {
  if (titlePollInterval) return

  titlePollInterval = setInterval(() => {
    let changed = false

    for (const [entityId, entity] of Object.entries(appState.entities)) {
      if (entity.type !== 'terminal') continue

      const sessionName = getSessionName(entityId)
      const cmd = getRunningCommand(sessionName)
      const cwd = getShellCwd(sessionName)

      // Only update title if we found a command (keep last command when idle)
      if (cmd && entity.title !== cmd) {
        entity.title = cmd
        changed = true
      }

      // Always update cwd
      if (cwd && entity.cwd !== cwd) {
        entity.cwd = cwd
        changed = true
      }
    }

    if (changed) {
      saveState()
      broadcastState()
    }
  }, 2000) // Poll every 2 seconds
}

export function stopTitlePolling() {
  if (titlePollInterval) {
    clearInterval(titlePollInterval)
    titlePollInterval = null
  }
}

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

// Run tracking - isolated output per command run
// run_id -> { output, started, status, terminalId }
const runBuffers = new Map()
const MAX_RUN_BUFFER_SIZE = 50000 // 50KB per run
const RUN_BUFFER_TTL = 300000 // 5 minutes

export function createRun(runId, terminalId) {
  runBuffers.set(runId, {
    output: '',
    started: Date.now(),
    status: 'running',
    terminalId
  })
  // Clean up old runs
  const now = Date.now()
  for (const [id, run] of runBuffers) {
    if (now - run.started > RUN_BUFFER_TTL) {
      runBuffers.delete(id)
    }
  }
}

export function appendToRun(runId, data) {
  const run = runBuffers.get(runId)
  if (!run) return

  run.output += data
  if (run.output.length > MAX_RUN_BUFFER_SIZE) {
    run.output = run.output.slice(-MAX_RUN_BUFFER_SIZE)
  }
}

export function completeRun(runId, status = 'completed') {
  const run = runBuffers.get(runId)
  if (run) {
    run.status = status
  }
}

export function getRunBuffer(runId, lines = null) {
  const run = runBuffers.get(runId)
  if (!run) return null

  if (lines) {
    const allLines = run.output.split('\n')
    return allLines.slice(-lines).join('\n')
  }
  return run.output
}

export function getRunStatus(runId) {
  const run = runBuffers.get(runId)
  return run ? run.status : null
}

export function getZellijScrollback(godName) {
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
