/**
 * God - Claude Code with bidirectional JSON streaming.
 *
 * Uses Zellij + named pipes (FIFOs) for persistence across Iris restarts.
 * History is owned by Claude (stored in ~/.claude/projects/).
 * We read from Claude's storage on restore, and track in-memory during session.
 */

import { spawn, execSync, spawnSync } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { createLogger } from './logger.js'
import { getComposedPrompt, getPersonalityMcpConfig } from './personalities.js'
import { getProjectsContext } from './projects.js'
import { OAUTH_PORT, DEFAULT_PERMISSION_MODE } from './config.js'
import { appState, saveState, broadcastState } from './state.js'

const log = createLogger('god')

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const IRIS_ROOT = path.resolve(__dirname, '..')
const HOME = os.homedir()
const FIFO_DIR = '/tmp/iris-fifos'

// Active god connections (not processes - those live in Zellij)
// godName -> { inputStream, outputStream, clients, history, currentPartial, sessionId, ... }
const processes = new Map()

// ============================================================================
// FIFO Management
// ============================================================================

/**
 * Get FIFO paths for a god.
 */
function getFifoPaths(godName) {
  return {
    inPipe: path.join(FIFO_DIR, `${godName}-in`),
    outPipe: path.join(FIFO_DIR, `${godName}-out`),
  }
}

/**
 * Create FIFOs for a god if they don't exist.
 */
function createFifos(godName) {
  const { inPipe, outPipe } = getFifoPaths(godName)

  // Ensure FIFO directory exists
  if (!fs.existsSync(FIFO_DIR)) {
    fs.mkdirSync(FIFO_DIR, { recursive: true })
  }

  // Create FIFOs if they don't exist
  for (const fifo of [inPipe, outPipe]) {
    if (!fs.existsSync(fifo)) {
      try {
        execSync(`mkfifo "${fifo}"`, { stdio: 'ignore' })
        log.log(`Created FIFO: ${fifo}`)
      } catch (e) {
        log.error(`Failed to create FIFO ${fifo}:`, e.message)
      }
    }
  }

  return { inPipe, outPipe }
}

/**
 * Clean up FIFOs for a god.
 */
function cleanupFifos(godName) {
  const { inPipe, outPipe } = getFifoPaths(godName)

  for (const fifo of [inPipe, outPipe]) {
    try {
      if (fs.existsSync(fifo)) {
        fs.unlinkSync(fifo)
        log.log(`Removed FIFO: ${fifo}`)
      }
    } catch (e) {
      log.error(`Failed to remove FIFO ${fifo}:`, e.message)
    }
  }
}

// ============================================================================
// Zellij Session Management
// ============================================================================

/**
 * Get Zellij session name for a god.
 */
function getZellijSessionName(godName) {
  return `iris-${godName}`
}

/**
 * Check if a Claude process exists for a god.
 */
function zellijSessionExists(godName) {
  // Check PID file and if process is alive
  return isProcessAlive(godName)
}

/**
 * Get PID file path for a god.
 */
function getPidFile(godName) {
  return path.join(FIFO_DIR, `${godName}.pid`)
}

/**
 * Check if a Claude process is still running for a god.
 */
function isProcessAlive(godName) {
  const pidFile = getPidFile(godName)
  if (!fs.existsSync(pidFile)) return false

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
    // Check if process exists
    process.kill(pid, 0)
    return true
  } catch (e) {
    // Process doesn't exist or we can't signal it
    return false
  }
}

/**
 * Interrupt a running Claude task by killing and respawning with --resume.
 * This is the only reliable way to interrupt Claude in stream-json mode.
 */
export function interruptGod(godName) {
  const entry = processes.get(godName)
  if (!entry) {
    log.log(`No entry for ${godName}, cannot interrupt`)
    return false
  }

  const sessionId = entry.sessionId
  const project = entry.project

  if (!sessionId) {
    log.log(`No session_id for ${godName}, cannot resume after interrupt`)
    return false
  }

  log.log(`Interrupting ${godName} (session: ${sessionId}) - will kill and respawn`)

  // Save clients to re-attach after respawn
  const clients = new Set(entry.clients)

  // Close streams
  if (entry.outputStream) {
    try { entry.outputStream.destroy() } catch {}
  }
  if (entry.inputFd !== undefined) {
    try { fs.closeSync(entry.inputFd) } catch {}
  }

  // Kill the process
  const pidFile = getPidFile(godName)
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
      log.log(`Killing Claude process ${pid} for ${godName}`)
      process.kill(pid, 'SIGKILL')  // Force kill
    } catch (e) {
      log.log(`Process already dead: ${e.message}`)
    }
    try { fs.unlinkSync(pidFile) } catch {}
  }

  // Clean up FIFOs
  cleanupFifos(godName)

  // Reset state and broadcast before removing from map
  entry.streaming = false
  entry.currentPartial = null
  entry.error = null
  entry.result = { success: false, interrupted: true }
  broadcastGodState(godName)

  // Remove from processes map
  processes.delete(godName)

  // Respawn with resume after a short delay (let process fully die)
  setTimeout(() => {
    log.log(`Respawning ${godName} with --resume ${sessionId}`)
    createGod(godName, {
      sessionId,
      project,
      personality: 'god',
    })

    // Re-attach all clients after respawn
    setTimeout(() => {
      const newEntry = processes.get(godName)
      if (newEntry) {
        clients.forEach(ws => {
          if (ws.readyState === 1) {  // WebSocket.OPEN
            newEntry.clients.add(ws)
            log.log(`Re-attached client to ${godName}`)
          }
        })
        // Broadcast new state to reconnected clients
        broadcastGodState(godName)
      }
    }, 1000)  // Wait for createGod to finish setting up
  }, 500)

  return true
}

/**
 * Create a persistent Claude process with FIFOs.
 * Uses setsid for process persistence across Iris restarts.
 */
function createZellijSession(godName, options = {}) {
  const { inPipe, outPipe } = createFifos(godName)
  const sessionName = getZellijSessionName(godName)
  const pidFile = getPidFile(godName)
  const {
    project,
    sessionId,
    personality = 'god',
    task,
  } = options

  // Build claude args
  const claudeArgs = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  ]

  if (sessionId) {
    claudeArgs.push('--resume', sessionId)
  }

  // System prompt (only for new sessions)
  let systemPrompt = ''
  if (!sessionId && personality && personality !== 'none') {
    const personalityContent = getComposedPrompt(personality)
    const projectsContent = getProjectsContext()
    if (personalityContent) systemPrompt += personalityContent
    if (projectsContent) systemPrompt += '\n\n' + projectsContent
  }
  if (systemPrompt) {
    // Escape for shell - use base64 to avoid escaping issues
    const encoded = Buffer.from(systemPrompt).toString('base64')
    claudeArgs.push('--system-prompt', `$(echo ${encoded} | base64 -d)`)
  }

  // MCP config
  const mcpConfig = getPersonalityMcpConfig(personality, IRIS_ROOT)
  let mcpFile = null
  if (mcpConfig) {
    mcpFile = path.join(os.tmpdir(), `iris-mcp-${godName}-${Date.now()}.json`)
    fs.writeFileSync(mcpFile, JSON.stringify(mcpConfig))
    claudeArgs.push('--mcp-config', mcpFile)
  }

  // Build the shell script that runs Claude with FIFOs
  // setsid creates a new session, making the process independent of Iris
  // Use <> mode to open FIFOs in read-write mode to avoid blocking
  const scriptContent = `#!/bin/bash
cd "${project || HOME}"
export PATH="${getExtendedPath()}"
export TERM=xterm-256color
export COLORTERM=truecolor
export GOD_NAME="${godName}"
export IRIS_HOME="${IRIS_ROOT}"
export IRIS_API_PORT="${OAUTH_PORT}"

# Write our PID
echo $$ > "${pidFile}"

# Open FIFOs in read-write mode to avoid blocking
# The <> mode opens for both reading and writing, preventing FIFO deadlocks
exec 3<>"${inPipe}"   # Open inPipe for read-write on fd 3
exec 4<>"${outPipe}"  # Open outPipe for read-write on fd 4 (prevents blocking)

# Run Claude with file descriptors
exec claude ${claudeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')} <&3 >&4 2>/tmp/iris-${godName}-stderr.log
`

  // Write the script to a temp file
  const scriptFile = path.join(os.tmpdir(), `iris-claude-${godName}.sh`)
  fs.writeFileSync(scriptFile, scriptContent, { mode: 0o755 })

  log.log(`Creating Claude process: ${sessionName}`)
  log.log(`Script file: ${scriptFile}`)

  try {
    // Use setsid to create a new session (process group) so Claude survives Iris restarts
    // The process runs completely detached from Iris
    const child = spawn('setsid', ['-f', 'bash', scriptFile], {
      detached: true,
      stdio: 'ignore',
      cwd: project || HOME,
    })
    child.unref()

    log.log(`Claude process started for ${godName}`)

    // If there's an initial task, send it after a delay
    if (task && !sessionId) {
      setTimeout(() => {
        try {
          const msg = JSON.stringify({
            type: 'user',
            message: { role: 'user', content: [{ type: 'text', text: task }] }
          }) + '\n'
          const fd = fs.openSync(inPipe, 'a')
          fs.writeSync(fd, msg)
          fs.closeSync(fd)
          log.log(`Sent initial task to ${godName}`)
        } catch (e) {
          log.error(`Failed to send initial task:`, e.message)
        }
      }, 1000)  // Give Claude time to start
    }

    // Clean up MCP file after delay
    if (mcpFile) {
      setTimeout(() => {
        try { fs.unlinkSync(mcpFile) } catch {}
      }, 30000)
    }

    // Clean up script file after delay
    setTimeout(() => {
      try { fs.unlinkSync(scriptFile) } catch {}
    }, 5000)

    return true
  } catch (e) {
    log.error(`Failed to create Claude process:`, e.message)
    return false
  }
}

/**
 * Kill a Claude process for a god.
 */
function killZellijSession(godName) {
  const pidFile = getPidFile(godName)
  if (!fs.existsSync(pidFile)) {
    log.log(`No PID file for ${godName}`)
    return true
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
    log.log(`Killing Claude process ${pid} for ${godName}`)
    process.kill(pid, 'SIGTERM')

    // Give it a moment to die gracefully
    setTimeout(() => {
      try {
        process.kill(pid, 0)  // Check if still alive
        process.kill(pid, 'SIGKILL')  // Force kill if still alive
      } catch {}
    }, 1000)

    // Remove PID file
    try { fs.unlinkSync(pidFile) } catch {}

    return true
  } catch (e) {
    // Process might already be dead
    log.log(`Process for ${godName} already dead or error: ${e.message}`)
    try { fs.unlinkSync(pidFile) } catch {}
    return true
  }
}

// Build PATH with common locations for claude
function getExtendedPath() {
  const paths = [
    process.env.PATH,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${HOME}/.local/bin`,
    `${HOME}/.bun/bin`,
  ]

  const nvmDir = `${HOME}/.nvm/versions/node`
  try {
    if (fs.existsSync(nvmDir)) {
      fs.readdirSync(nvmDir).forEach(v => paths.push(`${nvmDir}/${v}/bin`))
    }
  } catch {}

  const miseDir = `${HOME}/.local/share/mise/installs`
  try {
    if (fs.existsSync(miseDir)) {
      fs.readdirSync(miseDir).forEach(tool => {
        const toolDir = `${miseDir}/${tool}`
        try {
          fs.readdirSync(toolDir).forEach(v => paths.push(`${toolDir}/${v}/bin`))
        } catch {}
      })
    }
  } catch {}

  return paths.filter(Boolean).join(':')
}

/**
 * Encode a cwd path to Claude's project directory format.
 * /home/user/Work/project -> -home-user-Work-project
 */
function encodeClaudePath(cwd) {
  return cwd.replace(/\//g, '-')
}

/**
 * Read session history from Claude's storage.
 * Returns array of messages in our format.
 */
function readClaudeHistory(sessionId, cwd) {
  if (!sessionId || !cwd) return []

  const claudeDir = path.join(HOME, '.claude', 'projects', encodeClaudePath(cwd))
  const sessionFile = path.join(claudeDir, `${sessionId}.jsonl`)

  log.log(`Reading Claude history from: ${sessionFile}`)

  if (!fs.existsSync(sessionFile)) {
    log.log(`Session file not found`)
    return []
  }

  try {
    const content = fs.readFileSync(sessionFile, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    const history = []

    for (const line of lines) {
      try {
        const msg = JSON.parse(line)

        // User message (text input)
        if (msg.type === 'user' && msg.message) {
          const content = msg.message.content
          // Check if it's a tool_result message
          const hasToolResult = Array.isArray(content) && content.some(c => c.type === 'tool_result')

          if (hasToolResult) {
            // Keep tool_result messages with full structure
            history.push({
              type: 'user',
              message: msg.message,
              timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
            })
          } else {
            // Regular user text message
            const text = content?.[0]?.text || (typeof content === 'string' ? content : '')
            if (text) {
              history.push({
                type: 'user',
                content: text,
                timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
              })
            }
          }
        }
        // Assistant message
        else if (msg.type === 'assistant' && msg.message) {
          history.push({
            type: 'assistant',
            message: msg.message,
            timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
          })
        }
        // Skip summaries, file-history-snapshots, etc.
      } catch (e) {
        // Skip unparseable lines
      }
    }

    log.log(`Loaded ${history.length} messages from Claude history`)
    return history
  } catch (e) {
    log.error(`Error reading Claude history:`, e.message)
    return []
  }
}

/**
 * Broadcast state to all attached clients.
 * Sends history + currentPartial for display.
 */
function broadcastGodState(godName) {
  const entry = processes.get(godName)
  if (!entry) return

  // Combine history with current partial for display
  const displayHistory = entry.currentPartial
    ? [...entry.history, entry.currentPartial]
    : entry.history

  const payload = {
    event: 'god:state',
    godName,
    history: displayHistory,
    sessionId: entry.sessionId,
    streaming: entry.streaming,
    result: entry.result,
    error: entry.error,
    exited: entry.exited,
  }

  const msg = JSON.stringify(payload)

  // Clean up dead clients and send to live ones
  const deadClients = []
  for (const ws of entry.clients) {
    try {
      if (ws.readyState === 1) ws.send(msg)
      else if (ws.readyState >= 2) deadClients.push(ws)
    } catch (e) {
      deadClients.push(ws)
    }
  }
  for (const ws of deadClients) {
    entry.clients.delete(ws)
  }
}

/**
 * Connect to FIFOs for a god (for reading output).
 * This sets up the output stream reader for parsing Claude's responses.
 *
 * FIFO handling is tricky because:
 * 1. FIFOs block on open until both ends are connected
 * 2. Claude opens inPipe for reading, outPipe for writing
 * 3. We need to open inPipe for writing (to unblock Claude) and outPipe for reading
 *
 * To avoid deadlock:
 * - We keep a write file descriptor to inPipe open (stored in entry.inputFd)
 * - This unblocks Claude's read
 * - Then we can read from outPipe
 */
function connectToFifos(godName, entry) {
  const { inPipe, outPipe } = getFifoPaths(godName)

  log.log(`Connecting to FIFOs for ${godName}`)

  try {
    // First, open inPipe for writing to unblock Claude's stdin
    // Use O_WRONLY | O_NONBLOCK to avoid blocking if Claude hasn't started yet
    // Then switch to blocking mode for actual writes
    try {
      // Open in non-blocking mode first
      entry.inputFd = fs.openSync(inPipe, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)
      log.log(`Opened input FIFO for ${godName}`)
    } catch (e) {
      // If ENXIO (no reader), Claude hasn't started yet - retry after delay
      if (e.code === 'ENXIO') {
        log.log(`Claude not ready yet for ${godName}, retrying...`)
        setTimeout(() => connectToFifos(godName, entry), 500)
        return false
      }
      throw e
    }

    // Now open output pipe for reading
    // This might block briefly until Claude opens it for writing
    entry.outputStream = fs.createReadStream(outPipe, { encoding: 'utf-8' })

    entry.outputStream.on('data', (chunk) => {
      entry.buffer += chunk
      const lines = entry.buffer.split('\n')
      entry.buffer = lines.pop()

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          handleClaudeMessage(godName, JSON.parse(line))
        } catch (e) {
          log.error(`Parse error:`, e.message, line.slice(0, 100))
        }
      }
    })

    entry.outputStream.on('error', (err) => {
      log.error(`${godName} output stream error:`, err.message)
      entry.error = err.message
      broadcastGodState(godName)
    })

    entry.outputStream.on('end', () => {
      log.log(`${godName} output stream ended`)
      entry.streaming = false
      entry.currentPartial = null
      entry.exited = 0
      broadcastGodState(godName)

      // Clean up
      if (entry.outputStream) {
        entry.outputStream = null
      }
      if (entry.inputFd !== undefined) {
        try { fs.closeSync(entry.inputFd) } catch {}
        entry.inputFd = undefined
      }
    })

    log.log(`Connected to FIFOs for ${godName}`)
    return true
  } catch (e) {
    log.error(`Failed to connect to FIFOs for ${godName}:`, e.message)
    return false
  }
}

/**
 * Create a new God process (or reconnect to existing Zellij session).
 */
export function createGod(godName, options = {}) {
  log.log(`createGod: ${godName}`, JSON.stringify(options))
  const {
    task,
    project,
    personality = 'god',
    sessionId,
    permissionMode = DEFAULT_PERMISSION_MODE
  } = options

  // If we already have a connection, clean it up
  if (processes.has(godName)) {
    const existing = processes.get(godName)
    if (existing.outputStream) {
      try { existing.outputStream.destroy() } catch {}
    }
    processes.delete(godName)
  }

  // Load history from Claude's storage (for resumed sessions)
  const initialHistory = sessionId ? readClaudeHistory(sessionId, project || HOME) : []

  // If there's an initial task, add it to history
  if (task && !sessionId) {
    initialHistory.push({
      type: 'user',
      content: task,
      timestamp: Date.now()
    })
  }

  const entry = {
    outputStream: null,
    clients: new Set(),
    history: initialHistory,
    currentPartial: null,
    sessionId: sessionId || null,
    buffer: '',
    streaming: task ? true : false,  // Streaming if we're sending a task
    result: null,
    error: null,
    exited: null,
    project: project || HOME,
  }

  processes.set(godName, entry)

  // Check if Zellij session already exists
  if (zellijSessionExists(godName)) {
    log.log(`Zellij session exists for ${godName}, reconnecting to FIFOs`)

    // Just connect to existing FIFOs
    const { inPipe, outPipe } = getFifoPaths(godName)
    if (fs.existsSync(inPipe) && fs.existsSync(outPipe)) {
      connectToFifos(godName, entry)
      return { godName, sessionId }
    } else {
      // Session exists but FIFOs don't - orphaned session, clean it up
      log.log(`Orphaned Zellij session ${godName}, cleaning up`)
      killZellijSession(godName)
    }
  }

  // Create new Zellij session with FIFOs
  log.log(`Creating new Zellij session for ${godName}`)
  const created = createZellijSession(godName, {
    project,
    sessionId,
    personality,
    task,
  })

  if (!created) {
    entry.error = 'Failed to create Zellij session'
    broadcastGodState(godName)
    return { godName, sessionId, error: 'Failed to create session' }
  }

  // Give Zellij a moment to start, then connect to FIFOs
  // The FIFOs will block until Claude opens them, so we need a small delay
  setTimeout(() => {
    if (processes.has(godName)) {
      connectToFifos(godName, processes.get(godName))
    }
  }, 500)

  return { godName, sessionId }
}

/**
 * Handle a message from Claude's stdout.
 * Partials -> currentPartial, Finals -> history
 */
function handleClaudeMessage(godName, msg) {
  const entry = processes.get(godName)
  if (!entry) return

  // Init message - extract session ID
  if (msg.type === 'system' && msg.subtype === 'init') {
    log.log(`Init: sessionId=${msg.session_id}`)
    entry.sessionId = msg.session_id
    if (appState.entities[godName]) {
      appState.entities[godName].sessionId = msg.session_id
      // Transition from spawning to working
      if (appState.entities[godName].readyState === 'spawning') {
        appState.entities[godName].readyState = 'working'
      }
      saveState()
      // Force broadcast after debounce window to ensure state update reaches frontend
      setTimeout(() => broadcastState(), 50)
    }
    broadcastGodState(godName)
    return
  }

  // Assistant message
  if (msg.type === 'assistant') {
    const isPartial = msg.message?.stop_reason === null
    entry.streaming = isPartial

    if (isPartial) {
      // Update currentPartial (not in history)
      entry.currentPartial = msg
    } else {
      // Final message - add to history, clear partial
      entry.history.push(msg)
      entry.currentPartial = null
    }

    broadcastGodState(godName)
    return
  }

  // Result message
  if (msg.type === 'result') {
    entry.streaming = false
    // Save currentPartial to history before clearing (it's the final response)
    if (entry.currentPartial) {
      entry.history.push(entry.currentPartial)
      entry.currentPartial = null
    }
    entry.result = {
      success: msg.subtype === 'success',
      cost: msg.total_cost_usd,
    }
    if (appState.entities[godName]) {
      appState.entities[godName].readyState = 'done'
      saveState()
    }
    broadcastGodState(godName)
    return
  }

  // User message with tool results
  if (msg.type === 'user' && msg.message?.content) {
    const hasToolResult = msg.message.content.some(c => c.type === 'tool_result')
    if (hasToolResult) {
      // Save the assistant message that triggered the tool BEFORE processing tool_result
      // Otherwise the next assistant message will overwrite currentPartial and we lose tool_use
      if (entry.currentPartial) {
        entry.history.push(entry.currentPartial)
        entry.currentPartial = null
      }
      entry.history.push({
        type: 'user',
        message: msg.message,
        timestamp: Date.now()
      })
      broadcastGodState(godName)
    }
    return
  }
}

/**
 * Send a user message to a god via FIFO.
 */
export function sendUserMessage(godName, text) {
  log.log(`sendUserMessage: ${godName} "${text.slice(0, 50)}"`)
  const entry = processes.get(godName)
  if (!entry) {
    log.error(`Cannot send: ${godName} not found`)
    return false
  }

  // Check if Claude process is still alive
  if (!zellijSessionExists(godName)) {
    log.error(`Cannot send: Claude process for ${godName} not found`)
    entry.error = 'Claude session has ended'
    entry.exited = 1
    broadcastGodState(godName)
    return false
  }

  if (appState.entities[godName]?.readyState === 'done') {
    appState.entities[godName].readyState = 'working'
    saveState()
    broadcastState()
  }

  // Add to history
  entry.history.push({
    type: 'user',
    content: text,
    timestamp: Date.now(),
  })
  entry.streaming = true
  broadcastGodState(godName)

  // Send to Claude via FIFO
  const msg = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  }) + '\n'

  try {
    // Use the already-open file descriptor if available
    if (entry.inputFd !== undefined) {
      fs.writeSync(entry.inputFd, msg)
      log.log(`Sent message to ${godName} via open FD`)
      return true
    }

    // Fallback: open, write, close
    const { inPipe } = getFifoPaths(godName)
    const fd = fs.openSync(inPipe, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)
    fs.writeSync(fd, msg)
    fs.closeSync(fd)
    log.log(`Sent message to ${godName} via FIFO`)
    return true
  } catch (e) {
    log.error(`Write error:`, e)
    entry.error = `Failed to send: ${e.message}`
    broadcastGodState(godName)
    return false
  }
}

/**
 * Attach a WebSocket client to a god.
 */
export function attachClient(godName, ws) {
  const entry = processes.get(godName)
  if (!entry) return null

  entry.clients.add(ws)

  // Send current state immediately
  const displayHistory = entry.currentPartial
    ? [...entry.history, entry.currentPartial]
    : entry.history

  ws.send(JSON.stringify({
    event: 'god:state',
    godName,
    history: displayHistory,
    sessionId: entry.sessionId,
    streaming: entry.streaming,
    result: entry.result,
    error: entry.error,
    exited: entry.exited,
  }))

  log.log(`Client attached to ${godName}, ${entry.history.length} messages`)
  return entry
}

/**
 * Detach a WebSocket client from a god.
 */
export function detachClient(godName, ws) {
  const entry = processes.get(godName)
  if (entry) entry.clients.delete(ws)
}

/**
 * Kill a god's Claude process and clean up resources.
 */
export function killGod(godName) {
  const entry = processes.get(godName)

  // Clean up local resources
  if (entry) {
    if (entry.outputStream) {
      try { entry.outputStream.destroy() } catch {}
    }
    if (entry.inputFd !== undefined) {
      try { fs.closeSync(entry.inputFd) } catch {}
    }
    processes.delete(godName)
  }

  // Kill Claude process
  killZellijSession(godName)

  // Clean up FIFOs
  cleanupFifos(godName)

  return true
}

/**
 * List all active gods.
 */
export function listGods() {
  return Array.from(processes.keys()).map(godName => {
    const entry = processes.get(godName)
    return {
      godName,
      sessionId: entry.sessionId,
      clientCount: entry.clients.size,
      historyLength: entry.history.length,
      streaming: entry.streaming,
      connected: entry.outputStream !== null,
      processAlive: isProcessAlive(godName),
    }
  })
}

/**
 * Get a god entry.
 */
export function getGod(godName) {
  return processes.get(godName)
}

// Compatibility stubs
export function listGodSockets() { return [] }

export function createGodSession(godName, task, project, options = {}) {
  const result = createGod(godName, { task, project, ...options })
  return result ? { ...result, exists: false } : null
}

export function createTerminalSession(options = {}, projectRoot) {
  const existingTerminals = Object.keys(appState.entities)
    .filter(id => appState.entities[id]?.type === 'terminal')
  const num = existingTerminals.length + 1
  return {
    name: `Terminal-${num}`,
    displayName: `Terminal ${num}`,
    color: options.color || '#888888',
    exists: false
  }
}

export function getSessionName(godName) {
  return processes.get(godName)?.sessionId || godName
}

/**
 * Check if a Zellij session exists for a god (exported for handlers).
 */
export { zellijSessionExists }

/**
 * Clean up orphaned resources on startup.
 * - FIFOs without corresponding running processes
 * - Stale PID files
 */
export function cleanupOrphanedSessions() {
  log.log('Cleaning up orphaned sessions on startup')

  if (!fs.existsSync(FIFO_DIR)) {
    log.log('No FIFO directory, nothing to clean up')
    return
  }

  const files = fs.readdirSync(FIFO_DIR)

  // Get all god names from FIFOs and PID files
  const godNames = new Set()
  for (const f of files) {
    if (f.endsWith('-in') || f.endsWith('-out')) {
      godNames.add(f.replace(/-in$|-out$/, ''))
    } else if (f.endsWith('.pid')) {
      godNames.add(f.replace(/\.pid$/, ''))
    }
  }

  log.log(`Found ${godNames.size} potential god processes:`, Array.from(godNames))

  // Check each god
  for (const godName of godNames) {
    const alive = isProcessAlive(godName)

    if (!alive) {
      // Process is dead - clean up its FIFOs and PID file
      log.log(`Cleaning up dead process resources for ${godName}`)
      cleanupFifos(godName)
      const pidFile = getPidFile(godName)
      try { if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile) } catch {}
    } else {
      log.log(`Process for ${godName} is alive, ready for reconnection`)

      // Update app state to indicate it's reconnectable
      if (appState.entities[godName]?.type === 'god') {
        if (appState.entities[godName].readyState === 'spawning') {
          appState.entities[godName].readyState = 'working'
        }
      }
    }
  }

  log.log('Orphaned session cleanup complete')
}
