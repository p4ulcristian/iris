/**
 * God - Claude Code with bidirectional JSON streaming.
 *
 * History is owned by Claude (stored in ~/.claude/projects/).
 * We read from Claude's storage on restore, and track in-memory during session.
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

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const IRIS_ROOT = path.resolve(__dirname, '..')
const HOME = os.homedir()

// Active god processes
// godName -> { proc, clients, history, currentPartial, sessionId, ... }
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
 * Create a new God process.
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
    '--dangerously-skip-permissions',
  ]

  if (sessionId) {
    args.push('--resume', sessionId)
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
    args.push('--system-prompt', systemPrompt)
  }

  // MCP config
  const mcpConfig = getPersonalityMcpConfig(personality, IRIS_ROOT)
  if (mcpConfig) {
    const mcpFile = path.join(os.tmpdir(), `iris-mcp-${godName}-${Date.now()}.json`)
    fs.writeFileSync(mcpFile, JSON.stringify(mcpConfig))
    args.push('--mcp-config', mcpFile)
    setTimeout(() => { try { fs.unlinkSync(mcpFile) } catch {} }, 30000)
  }

  const env = {
    ...process.env,
    PATH: getExtendedPath(),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    GOD_NAME: godName,
    IRIS_HOME: IRIS_ROOT,
    IRIS_API_PORT: String(OAUTH_PORT),
  }

  log.log(`Spawning: claude ${args.slice(0, 5).join(' ')}...`)

  const proc = spawn('claude', args, {
    cwd: project || HOME,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // Load history from Claude's storage (for resumed sessions)
  const initialHistory = sessionId ? readClaudeHistory(sessionId, project || HOME) : []

  const entry = {
    proc,
    clients: new Set(),
    history: initialHistory,      // Finalized messages only
    currentPartial: null,         // Current streaming message (display only)
    sessionId: sessionId || null,
    buffer: '',
    streaming: false,
    result: null,
    error: null,
    exited: null,
  }

  processes.set(godName, entry)

  // Send initial task
  if (task && !sessionId) {
    log.log(`Sending initial task: "${task.slice(0, 50)}"`)
    entry.history.push({
      type: 'user',
      content: task,
      timestamp: Date.now()
    })

    const msg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: task }] }
    }) + '\n'

    try {
      proc.stdin.write(msg)
      entry.streaming = true
    } catch (e) {
      log.error(`Failed to write initial task:`, e)
    }
  }

  // Parse NDJSON from stdout
  proc.stdout.on('data', (chunk) => {
    entry.buffer += chunk.toString()
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

  proc.stderr.on('data', (chunk) => {
    const stderr = chunk.toString()
    log.error(`${godName} stderr:`, stderr)
    entry.history.push({ type: 'stderr', content: stderr, timestamp: Date.now() })
    broadcastGodState(godName)
  })

  proc.on('close', (code) => {
    log.log(`${godName} exited with code ${code}`)
    const exitingEntry = processes.get(godName)
    if (exitingEntry) {
      exitingEntry.streaming = false
      exitingEntry.currentPartial = null
      exitingEntry.exited = code
      broadcastGodState(godName)
    }
    processes.delete(godName)

    if (appState.entities[godName]) {
      appState.entities[godName].readyState = code === 0 ? 'done' : 'scattered'
      appState.entities[godName].status = `Exited (${code})`
      saveState()
    }
  })

  proc.on('error', (err) => {
    log.error(`${godName} error:`, err)
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
      saveState()
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
    entry.currentPartial = null
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
 * Send a user message to a god.
 */
export function sendUserMessage(godName, text) {
  log.log(`sendUserMessage: ${godName} "${text.slice(0, 50)}"`)
  const entry = processes.get(godName)
  if (!entry?.proc) {
    log.error(`Cannot send: ${godName} not found`)
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

  // Send to Claude
  const msg = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  }) + '\n'

  try {
    entry.proc.stdin.write(msg)
    return true
  } catch (e) {
    log.error(`Write error:`, e)
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
 * Kill a god process.
 */
export function killGod(godName) {
  const entry = processes.get(godName)
  if (!entry) return false
  try { entry.proc.kill('SIGTERM') } catch {}
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
