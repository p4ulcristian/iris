/**
 * Chronicle file watcher - watches transcript files and broadcasts new lines.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = createLogger('chronicle')

// Transcript directory (relative to server/)
const TRANSCRIPT_DIR = path.join(__dirname, '..', 'memory', 'transcripts')

let broadcastFn = null
let watcher = null
let currentFile = null
let lastSize = 0

export function setBroadcast(fn) {
  broadcastFn = fn
}

function getTodayFile() {
  const today = new Date().toISOString().split('T')[0]
  return path.join(TRANSCRIPT_DIR, `${today}.txt`)
}

function parseLine(line, fileDate) {
  line = line.trim()
  if (!line || !line.startsWith('[')) return null

  try {
    const timeEnd = line.indexOf(']')
    const timeStr = line.slice(1, timeEnd)
    let rest = line.slice(timeEnd + 1).trim()

    let source = 'ambient'
    let text = rest
    if (rest.startsWith('[')) {
      const srcEnd = rest.indexOf(']')
      source = rest.slice(1, srcEnd)
      text = rest.slice(srcEnd + 1).trim()
    }

    const [h, m, s] = timeStr.split(':').map(Number)
    const timestamp = new Date(fileDate)
    timestamp.setHours(h, m, s, 0)

    return {
      timestamp: timestamp.toISOString(),
      source,
      text
    }
  } catch {
    return null
  }
}

function readNewLines() {
  const todayFile = getTodayFile()

  // Check if file changed
  if (currentFile !== todayFile) {
    currentFile = todayFile
    lastSize = 0
  }

  if (!fs.existsSync(todayFile)) return

  const stats = fs.statSync(todayFile)
  if (stats.size <= lastSize) return

  // Read new content
  const fd = fs.openSync(todayFile, 'r')
  const buffer = Buffer.alloc(stats.size - lastSize)
  fs.readSync(fd, buffer, 0, buffer.length, lastSize)
  fs.closeSync(fd)

  lastSize = stats.size

  // Parse and broadcast new lines
  const newContent = buffer.toString('utf8')
  const lines = newContent.split('\n').filter(l => l.trim())

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const line of lines) {
    const parsed = parseLine(line, today)
    if (parsed && broadcastFn) {
      log.log(`New line: ${parsed.text.slice(0, 50)}...`)
      broadcastFn('chronicle:line', { line: parsed })
    }
  }
}

export function startWatcher() {
  // Ensure directory exists
  if (!fs.existsSync(TRANSCRIPT_DIR)) {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  }

  // Initialize with current file size
  const todayFile = getTodayFile()
  if (fs.existsSync(todayFile)) {
    currentFile = todayFile
    lastSize = fs.statSync(todayFile).size
  }

  // Watch directory for changes
  watcher = fs.watch(TRANSCRIPT_DIR, (eventType, filename) => {
    if (filename && filename.endsWith('.txt')) {
      readNewLines()
    }
  })

  log.log(`Watching ${TRANSCRIPT_DIR}`)
}

export function stopWatcher() {
  if (watcher) {
    watcher.close()
    watcher = null
    log.log('Watcher stopped')
  }
}
