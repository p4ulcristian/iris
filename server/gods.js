/**
 * God - Claude Code with bidirectional JSON streaming.
 *
 * Communicates with Claude Code via stdin/stdout using stream-json format.
 */

import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { createLogger } from './logger.js'
import { getComposedPrompt, getPersonalityMcpConfig } from './personalities.js'
import { getProjectsContext } from './projects.js'
import { OAUTH_PORT, DEFAULT_PERMISSION_MODE } from './config.js'
import { appState, saveState, broadcastState } from './state.js'

const log = createLogger('god')

// Get Iris root directory for MCP paths
const __dirname = path.dirname(new URL(import.meta.url).pathname)
const IRIS_ROOT = path.resolve(__dirname, '..')
const HOME = os.homedir()

// Iris history directory - our own history files that we control
const IRIS_HISTORY_DIR = path.join(HOME, '.iris', 'history')

// Ensure history directory exists
try {
  if (!fs.existsSync(IRIS_HISTORY_DIR)) {
    fs.mkdirSync(IRIS_HISTORY_DIR, { recursive: true })
  }
} catch (e) {
  log.error('Failed to create history directory:', e)
}

// Active god processes
// godName -> { proc, clients: Set<WebSocket>, history: [], sessionId, buffer }
const processes = new Map()

// Build PATH with common locations for claude
function getExtendedPath() {
  const paths = [
    process.env.PATH,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${HOME}/.local/bin`,
    `${HOME}/.bun/bin`,
  ]

  // Add NVM node paths
  const nvmDir = `${HOME}/.nvm/versions/node`
  try {
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir)
      versions.forEach(v => paths.push(`${nvmDir}/${v}/bin`))
    }
  } catch {}

  // Add mise paths
  const miseDir = `${HOME}/.local/share/mise/installs`
  try {
    if (fs.existsSync(miseDir)) {
      const tools = fs.readdirSync(miseDir)
      tools.forEach(tool => {
        const toolDir = `${miseDir}/${tool}`
        try {
          const versions = fs.readdirSync(toolDir)
          versions.forEach(v => paths.push(`${toolDir}/${v}/bin`))
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
 * Get the Iris history file path for a god.
 */
function getIrisHistoryPath(godName) {
  // Sanitize godName for filename (replace any problematic chars)
  const safeName = godName.replace(/[^a-zA-Z0-9-_]/g, '_')
  return path.join(IRIS_HISTORY_DIR, `${safeName}.json`)
}

/**
 * Save history to our own file for reliable restoration.
 */
function saveIrisHistory(godName, history, sessionId) {
  try {
    const historyPath = getIrisHistoryPath(godName)
    const data = {
      godName,
      sessionId,
      savedAt: Date.now(),
      history
    }
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2))
  } catch (e) {
    log.error(`Failed to save Iris history for ${godName}:`, e.message)
  }
}

/**
 * Load history from our own file.
 */
function loadIrisHistory(godName) {
  try {
    const historyPath = getIrisHistoryPath(godName)
    if (fs.existsSync(historyPath)) {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
      const history = data.history || []
      log.log(`Loaded ${history.length} messages from Iris history for ${godName}`)
      // Debug: show types and tool_use presence
      history.forEach((msg, i) => {
        const hasToolUse = msg.message?.content?.some(c => c.type === 'tool_use')
        const hasToolResult = msg.message?.content?.some(c => c.type === 'tool_result')
        log.log(`  [${i}] type=${msg.type}, tool_use=${hasToolUse}, tool_result=${hasToolResult}`)
      })
      return history
    }
  } catch (e) {
    log.error(`Failed to load Iris history for ${godName}:`, e.message)
  }
  return []
}

/**
 * Debounced save of history for a god.
 * Saves 500ms after the last change to avoid excessive writes.
 */
function debouncedSaveHistory(godName) {
  const entry = processes.get(godName)
  if (!entry) return

  // Clear existing timeout
  if (entry.historySaveTimeout) {
    clearTimeout(entry.historySaveTimeout)
  }

  // Schedule save
  entry.historySaveTimeout = setTimeout(() => {
    saveIrisHistory(godName, entry.history, entry.sessionId)
    entry.historySaveTimeout = null
  }, 500)
}

/**
 * Read session history from Claude's storage.
 * Returns array of messages in our format, or empty array if not found.
 */
function readClaudeSessionHistory(sessionId, cwd) {
  if (!sessionId || !cwd) return []
  
  const claudeDir = path.join(HOME, '.claude', 'projects', encodeClaudePath(cwd))
  const sessionFile = path.join(claudeDir, `${sessionId}.jsonl`)
  
  log.log(`Reading session history from: ${sessionFile}`)
  
  if (!fs.existsSync(sessionFile)) {
    log.log(`Session file not found: ${sessionFile}`)
    return []
  }
  
  try {
    const content = fs.readFileSync(sessionFile, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    const history = []
    
    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        
        // Convert Claude's format to our format
        if (msg.type === 'user' && msg.message) {
          // User message
          const text = msg.message.content?.[0]?.text || 
                       (typeof msg.message.content === 'string' ? msg.message.content : '')
          if (text) {
            history.push({
              type: 'user',
              content: text,
              timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
            })
          }
        } else if (msg.type === 'assistant' && msg.message) {
          // Assistant message
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
    
    log.log(`Loaded ${history.length} messages from session history`)
    return history
  } catch (e) {
    log.error(`Error reading session history:`, e.message)
    return []
  }
}

/**
 * Broadcast full state to all attached clients for a god.
 * Simple: any change = send everything.
 */
function broadcastGodState(godName) {
  const entry = processes.get(godName)
  if (!entry) return

  const msg = JSON.stringify({
    event: 'god:state',
    godName,
    history: entry.history,
    sessionId: entry.sessionId,
    streaming: entry.streaming,
    result: entry.result,
    error: entry.error,
    exited: entry.exited,
  })

  // Clean up dead clients and send to live ones
  const deadClients = []
  for (const ws of entry.clients) {
    try {
      if (ws.readyState === 1) {
        ws.send(msg)
      } else if (ws.readyState >= 2) {
        deadClients.push(ws)
      }
    } catch (e) {
      log.error(`Broadcast error to ${godName}:`, e)
      deadClients.push(ws)
    }
  }

  for (const ws of deadClients) {
    entry.clients.delete(ws)
  }
}

/**
 * Create a new God process.
 */
export function createGod(godName, options = {}) {
  log.log(`createGod called for ${godName} with options:`, JSON.stringify(options))
  const {
    task,
    project,
    personality = 'god',
    sessionId,
    permissionMode = DEFAULT_PERMISSION_MODE
  } = options

  // Kill existing process if any
  if (processes.has(godName)) {
    killGod(godName)
  }

  // Build claude args
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
  ]

  // Skip permissions for god (simpler for now)
  args.push('--dangerously-skip-permissions')

  // Resume existing session
  if (sessionId) {
    args.push('--resume', sessionId)
  }

  // Build system prompt from personality
  let systemPrompt = ''
  if (!sessionId && personality && personality !== 'none') {
    const personalityContent = getComposedPrompt(personality)
    const projectsContent = getProjectsContext()

    if (personalityContent) systemPrompt += personalityContent
    if (projectsContent) systemPrompt += '\n\n' + projectsContent
  }

  if (systemPrompt) {
    // Pass system prompt directly as argument
    args.push('--system-prompt', systemPrompt)
  }

  // MCP config
  const mcpConfig = getPersonalityMcpConfig(personality, IRIS_ROOT)
  if (mcpConfig) {
    const mcpFile = path.join(os.tmpdir(), `iris-stream-mcp-${godName}-${Date.now()}.json`)
    fs.writeFileSync(mcpFile, JSON.stringify(mcpConfig))
    args.push('--mcp-config', mcpFile)
    setTimeout(() => {
      try { fs.unlinkSync(mcpFile) } catch {}
    }, 30000)
  }

  // Environment
  const env = {
    ...process.env,
    PATH: getExtendedPath(),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    GOD_NAME: godName,
    IRIS_HOME: IRIS_ROOT,
    IRIS_API_PORT: String(OAUTH_PORT),
  }

  log.log(`Spawning ${godName}: claude ${args.slice(0, 5).join(' ')}...`)

  // Spawn claude process
  const proc = spawn('claude', args, {
    cwd: project || HOME,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // Load history - try our own storage first, then Claude's session storage
  let initialHistory = loadIrisHistory(godName)
  if (initialHistory.length === 0 && sessionId) {
    log.log(`No Iris history for ${godName}, trying Claude session storage...`)
    initialHistory = readClaudeSessionHistory(sessionId, project || HOME)
  }
  log.log(`Loaded ${initialHistory.length} history messages for ${godName}`)

  const entry = {
    proc,
    clients: new Set(),
    history: initialHistory,
    sessionId: sessionId || null,
    buffer: '',
    streaming: false,
    currentPartialId: null,
    // When resuming, skip adding old messages - only track new ones after this timestamp
    startTime: Date.now(),
    isResuming: !!sessionId,
    // Debounce history saving
    historySaveTimeout: null,
  }

  processes.set(godName, entry)
  log.log(`Registered ${godName} in processes map`)

  // Send initial task immediately - Claude in -p mode waits for input before outputting init
  // The init message comes WITH the response, not before
  if (task && !sessionId) {
    log.log(`Sending initial task for ${godName}: "${task.slice(0, 50)}"`)
    entry.history.push({
      type: 'user',
      content: task,
      timestamp: Date.now()
    })
    debouncedSaveHistory(godName)

    // Format for Claude's stream-json input and send immediately
    const msg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: task }]
      }
    }) + '\n'

    try {
      proc.stdin.write(msg)
      entry.streaming = true
      log.log(`Wrote initial task to ${godName} stdin`)
    } catch (e) {
      log.error(`Failed to write initial task to ${godName}:`, e)
    }
  } else {
    log.log(`No initial task for ${godName} (task=${!!task}, sessionId=${sessionId})`)
  }

  // Parse NDJSON from stdout
  proc.stdout.on('data', (chunk) => {
    const data = chunk.toString()
    // Don't log every chunk - too noisy and causes I/O blocking
    entry.buffer += data
    const lines = entry.buffer.split('\n')
    entry.buffer = lines.pop() // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        handleClaudeMessage(godName, msg)
      } catch (e) {
        log.error(`Parse error for ${godName}:`, e.message, line.slice(0, 100))
      }
    }
  })

  // Log stderr and store for debugging
  proc.stderr.on('data', (chunk) => {
    const stderr = chunk.toString()
    log.error(`${godName} stderr:`, stderr)

    entry.history.push({
      type: 'stderr',
      content: stderr,
      timestamp: Date.now()
    })
    debouncedSaveHistory(godName)
    broadcastGodState(godName)
  })

  // Handle process exit
  proc.on('close', (code) => {
    log.log(`God ${godName} exited with code ${code}`)

    // Save history immediately before process entry is deleted
    const exitingEntry = processes.get(godName)
    if (exitingEntry?.history?.length > 0) {
      saveIrisHistory(godName, exitingEntry.history, exitingEntry.sessionId)
    }

    // Broadcast final state before deleting
    if (exitingEntry) {
      exitingEntry.streaming = false
      exitingEntry.exited = code
      broadcastGodState(godName)
    }
    processes.delete(godName)

    if (appState.entities[godName]) {
      appState.entities[godName].readyState = code === 0 ? 'done' : 'scattered'
      appState.entities[godName].status = `Exited with code ${code}`
      saveState()
    }
  })

  proc.on('error', (err) => {
    log.error(`God ${godName} error:`, err)

    const errorEntry = processes.get(godName)
    if (errorEntry) {
      errorEntry.error = err.message
      broadcastGodState(godName)
    }

    if (appState.entities[godName]) {
      appState.entities[godName].readyState = 'scattered'
      appState.entities[godName].status = `Error: ${err.message}`
      saveState()
    }
  })

  return { godName, sessionId }
}

/**
 * Handle a message from Claude's stdout.
 * Simple: update state, broadcast state.
 */
function handleClaudeMessage(godName, msg) {
  const entry = processes.get(godName)
  if (!entry) return

  // Extract session ID from init message
  if (msg.type === 'system' && msg.subtype === 'init') {
    log.log(`Init received for ${godName}`)
    entry.sessionId = msg.session_id
    if (appState.entities[godName]) {
      appState.entities[godName].sessionId = msg.session_id
      saveState()
    }
    broadcastGodState(godName)
    return
  }

  // Handle assistant messages
  if (msg.type === 'assistant') {
    const isPartial = msg.message?.stop_reason === null
    entry.streaming = isPartial

    // Debug: log tool_use in assistant messages
    const hasToolUse = msg.message?.content?.some(c => c.type === 'tool_use')
    if (hasToolUse) {
      log.log(`[${godName}] Assistant message has tool_use, isPartial=${isPartial}`)
    }

    if (isPartial) {
      // Update or add partial
      if (entry.currentPartialId) {
        const idx = entry.history.findIndex(h => h.id === entry.currentPartialId)
        if (idx >= 0) entry.history[idx] = { ...msg, id: entry.currentPartialId }
      } else {
        entry.currentPartialId = `partial-${Date.now()}`
        entry.history.push({ ...msg, id: entry.currentPartialId })
      }
    } else {
      // Final message - replace partial or add new
      if (entry.currentPartialId) {
        const idx = entry.history.findIndex(h => h.id === entry.currentPartialId)
        if (idx >= 0) entry.history[idx] = msg
        else entry.history.push(msg)
        entry.currentPartialId = null
      } else {
        entry.history.push(msg)
      }
      debouncedSaveHistory(godName)
    }

    broadcastGodState(godName)
    return
  }

  // Handle result
  if (msg.type === 'result') {
    entry.streaming = false
    entry.currentPartialId = null
    entry.result = {
      success: msg.subtype === 'success',
      cost: msg.total_cost_usd,
    }
    if (appState.entities[godName]) {
      appState.entities[godName].readyState = 'done'
      saveState()
    }
    debouncedSaveHistory(godName)
    broadcastGodState(godName)
    return
  }

  // Handle user messages with tool results
  if (msg.type === 'user' && msg.message?.content) {
    const hasToolResult = msg.message.content.some(c => c.type === 'tool_result')
    if (hasToolResult) {
      entry.history.push({
        type: 'user',
        message: msg.message,
        timestamp: Date.now()
      })
      debouncedSaveHistory(godName)
      broadcastGodState(godName)
    }
    return
  }
}

/**
 * Send a user message to a god.
 */
export function sendUserMessage(godName, text, skipHistory = false) {
  log.log(`sendUserMessage to ${godName}: "${text.slice(0, 50)}"`)
  const entry = processes.get(godName)
  if (!entry || !entry.proc) {
    log.error(`Cannot send to ${godName}: not found (processes: ${Array.from(processes.keys()).join(', ')})`)
    return false
  }

  // Clear resuming flag - new messages should be tracked
  entry.isResuming = false

  // Set working state when user sends a message
  if (appState.entities[godName] && appState.entities[godName].readyState === 'done') {
    appState.entities[godName].readyState = 'working'
    saveState()
    broadcastState()
  }

  // Add to history (unless already added, e.g. for pending initial task)
  if (!skipHistory) {
    entry.history.push({
      type: 'user',
      content: text,
      timestamp: Date.now(),
    })
    entry.streaming = true
    debouncedSaveHistory(godName)
    broadcastGodState(godName)
  }

  // Format for Claude's stream-json input
  const msg = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }]
    }
  }) + '\n'

  try {
    log.log(`Writing to ${godName} stdin:`, msg.slice(0, 100))
    entry.proc.stdin.write(msg)
    entry.streaming = true
    return true
  } catch (e) {
    log.error(`Write error to ${godName}:`, e)
    return false
  }
}

/**
 * Attach a WebSocket client to a god.
 * Simple: add client, send current state.
 */
export function attachClient(godName, ws) {
  const entry = processes.get(godName)
  if (!entry) return null

  entry.clients.add(ws)
  log.log(`Client attached to ${godName}, ${entry.history.length} messages, streaming=${entry.streaming}`)

  // Debug: show what we're sending
  entry.history.forEach((msg, i) => {
    const hasToolUse = msg.message?.content?.some(c => c.type === 'tool_use')
    const hasToolResult = msg.message?.content?.some(c => c.type === 'tool_result')
    log.log(`  [${i}] type=${msg.type}, tool_use=${hasToolUse}, tool_result=${hasToolResult}`)
  })

  // Send current state
  const payload = {
    event: 'god:state',
    godName,
    history: entry.history,
    sessionId: entry.sessionId,
    streaming: entry.streaming,
    result: entry.result,
    error: entry.error,
    exited: entry.exited,
  }
  const msg = JSON.stringify(payload)
  log.log(`Sending god:state to client, payload size: ${msg.length} bytes`)
  ws.send(msg)

  return entry
}

/**
 * Detach a WebSocket client from a god.
 */
export function detachClient(godName, ws) {
  const entry = processes.get(godName)
  if (entry) {
    entry.clients.delete(ws)
  }
}

/**
 * Kill a god process.
 */
export function killGod(godName) {
  const entry = processes.get(godName)
  if (!entry) return false

  try {
    entry.proc.kill('SIGTERM')
  } catch {}

  processes.delete(godName)
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
    }
  })
}

/**
 * Get a god entry (for handlers).
 */
export function getGod(godName) {
  return processes.get(godName)
}

/**
 * List god sockets (stub for compatibility with old Zellij-based code).
 * Returns empty array since gods now run as direct processes.
 */
export function listGodSockets() {
  return []
}

/**
 * Create a god session (compatibility alias for createGod).
 */
export function createGodSession(godName, task, project, options = {}) {
  const result = createGod(godName, {
    task,
    project,
    ...options
  })
  return result ? { ...result, exists: false } : null
}

/**
 * Create a terminal session (stub - terminals handled differently now).
 */
export function createTerminalSession(options = {}, projectRoot) {
  // Generate terminal name
  const existingTerminals = Object.keys(appState.entities)
    .filter(id => appState.entities[id]?.type === 'terminal')
  const num = existingTerminals.length + 1
  const name = `Terminal-${num}`

  return {
    name,
    displayName: `Terminal ${num}`,
    color: options.color || '#888888',
    exists: false
  }
}

/**
 * Get session name for a god (for compatibility).
 */
export function getSessionName(godName) {
  const entry = processes.get(godName)
  return entry?.sessionId || godName
}
