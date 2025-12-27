import fs from 'fs'
import { getSocketPath } from './gods.js'

// godName -> { proc, terminal, clients: Set<ws>, socketPath }
export const ptyProcesses = new Map()

// godName -> string[] (ring buffer of output lines)
const outputBuffers = new Map()
const MAX_BUFFER_LINES = 500

function appendToBuffer(godName, data) {
  if (!outputBuffers.has(godName)) {
    outputBuffers.set(godName, [])
  }
  const buffer = outputBuffers.get(godName)

  // Split by newlines and append
  const lines = data.split('\n')
  for (const line of lines) {
    buffer.push(line)
  }

  // Trim to max size
  while (buffer.length > MAX_BUFFER_LINES) {
    buffer.shift()
  }
}

export function getOutputBuffer(godName, lines = 50) {
  const buffer = outputBuffers.get(godName) || []
  const startIdx = Math.max(0, buffer.length - lines)
  return buffer.slice(startIdx).join('\n')
}

export function clearOutputBuffer(godName) {
  outputBuffers.delete(godName)
}

export function attachPty(godName, ws, cols, rows) {
  const socketPath = getSocketPath(godName)

  if (!fs.existsSync(socketPath)) {
    ws.send(JSON.stringify({ event: 'error', message: `Socket not found: ${socketPath}` }))
    return
  }

  // If PTY already exists for this god, just add client
  if (ptyProcesses.has(godName)) {
    const entry = ptyProcesses.get(godName)
    entry.clients.add(ws)
    return
  }

  const clients = new Set([ws])

  // Spawn using Bun.Terminal
  const proc = Bun.spawn(['dtach', '-a', socketPath], {
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

  // Trigger redraw with resize jiggle
  const actualCols = cols || 120
  const actualRows = rows || 40
  setTimeout(() => {
    const entry = ptyProcesses.get(godName)
    if (entry?.terminal) {
      entry.terminal.resize(actualCols - 1, actualRows - 1)
      setTimeout(() => {
        if (entry?.terminal) {
          entry.terminal.resize(actualCols, actualRows)
        }
      }, 50)
    }
  }, 100)

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
    if (entry.clients.size === 0) {
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
