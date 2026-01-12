/**
 * Chronicle file watcher - watches transcript files and broadcasts new lines.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from './logger.js'
import { appState } from './state.js'
import { PANTHEON } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const log = createLogger('chronicle')

// Transcript directory (relative to server/)
const TRANSCRIPT_DIR = path.join(__dirname, '..', 'memory', 'transcripts')

let broadcastFn = null
let watcher = null
let currentFile = null
let lastSize = 0

// God mention response cooldowns
const responseCooldowns = new Map()
const COOLDOWN_MS = 5000

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
      handleGodMentions(parsed)
    }
  }
}

/**
 * Check if transcript mentions any god names and trigger voice response.
 */
function handleGodMentions(line) {
  const startTime = performance.now()
  const { text } = line
  if (!text) return

  // Filter out echo: if text contains "here", it's likely our own TTS response
  if (/\bhere\b/i.test(text)) return

  // Check all gods in the pantheon
  for (const [name, config] of Object.entries(PANTHEON)) {
    const pattern = new RegExp(`\\b${name}\\b`, 'i')
    if (!pattern.test(text)) continue

    // Check cooldown
    const lastResponse = responseCooldowns.get(name) || 0
    if (Date.now() - lastResponse < COOLDOWN_MS) continue

    // Respond!
    responseCooldowns.set(name, Date.now())
    const detectTime = performance.now() - startTime
    respondAsGod(name, config.voice, detectTime)
  }
}

/**
 * Make a god respond with voice, then listen for a command.
 */
async function respondAsGod(name, voice, detectTime) {
  const displayName = name.charAt(0).toUpperCase() + name.slice(1)
  const greeting = `Hey, ${displayName} listening!`

  try {
    const fetchStart = performance.now()

    // Step 1: Say greeting
    await fetch('http://127.0.0.1:8765/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: greeting, voice })
    })

    const speakTime = performance.now() - fetchStart
    log.log(`⏱ ${name} greeting | detect: ${detectTime.toFixed(1)}ms | speak: ${speakTime.toFixed(1)}ms`)

    // Step 2: Wait for TTS to finish (approximate based on text length)
    const waitTime = Math.max(1500, greeting.length * 80)  // ~80ms per char
    await new Promise(r => setTimeout(r, waitTime))

    // Step 3: Listen for user speech (VAD-based)
    log.log(`${name}: listening for command...`)
    const listenStart = performance.now()

    const listenRes = await fetch('http://127.0.0.1:8766/listen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    const listenData = await listenRes.json()
    const listenTime = performance.now() - listenStart

    if (listenData.text) {
      log.log(`⏱ ${name} heard: "${listenData.text}" | listen: ${listenTime.toFixed(1)}ms`)

      // Step 4: Find the god entity and send input
      const godEntity = findGodEntity(name)
      if (godEntity) {
        await sendToGod(godEntity.id, listenData.text)
        log.log(`${name}: sent command to terminal`)
      } else {
        log.log(`${name}: no active god entity found, logging only`)
      }
    } else {
      log.log(`${name}: no speech detected | listen: ${listenTime.toFixed(1)}ms`)
    }

  } catch (err) {
    log.error(`Failed to respond as ${name}:`, err)
  }
}

/**
 * Find an active god entity by base name.
 */
function findGodEntity(baseName) {
  const lowerName = baseName.toLowerCase()
  return Object.values(appState.entities).find(e =>
    e.type === 'god' &&
    e.id.toLowerCase().replace(/-\d+$/, '') === lowerName
  )
}

/**
 * Send text input to a god's terminal.
 */
async function sendToGod(godId, text) {
  try {
    await fetch('http://127.0.0.1:9999/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ god: godId, text })
    })
  } catch (err) {
    log.error(`Failed to send to ${godId}:`, err)
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
