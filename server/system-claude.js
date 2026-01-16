/**
 * System Claude Manager
 *
 * Scans for all Claude processes running on the system and broadcasts
 * their status to connected clients.
 */

import { readFileSync, readlinkSync } from 'fs'
import { execSync } from 'child_process'
import os from 'os'
import path from 'path'
import { createLogger } from './logger.js'

const log = createLogger('system-claude')
const HOME = os.homedir()

// State
let systemClaudes = []
let scanInterval = null
let broadcastFn = null

export function setBroadcast(fn) {
  broadcastFn = fn
}

/**
 * Parse TTY from /proc/pid/stat
 * Field 7 is tty_nr - 0 means no TTY
 * Returns 'pts/X' or null
 */
function parseTty(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
    // stat format: pid (comm) state ppid pgrp session tty_nr ...
    // Need to handle comm which can contain spaces/parens
    const match = stat.match(/^\d+\s+\([^)]+\)\s+\S+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
    if (!match) return null

    const ttyNr = parseInt(match[1])
    if (ttyNr === 0) return null

    // Decode tty_nr: major = ttyNr >> 8, minor = ttyNr & 0xff
    // For pts devices, major is 136-143, minor is the pts number
    const major = (ttyNr >> 8) & 0xff
    const minor = ttyNr & 0xff

    if (major >= 136 && major <= 143) {
      // pts device
      const ptsNum = (major - 136) * 256 + minor
      return `pts/${ptsNum}`
    }

    return `tty${minor}`
  } catch {
    return null
  }
}

/**
 * Scan /proc for all claude processes
 */
function scanProcesses() {
  const processes = []

  try {
    // Get all PIDs of processes named 'claude'
    const pids = execSync('pgrep -x claude 2>/dev/null', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean)

    for (const pidStr of pids) {
      const pid = parseInt(pidStr)

      try {
        // Get working directory
        const cwd = readlinkSync(`/proc/${pid}/cwd`)

        // Get TTY
        const tty = parseTty(pid)

        // Get command line args (to potentially extract session ID)
        let cmdline = ''
        try {
          cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ').trim()
        } catch {}

        // Extract project name from cwd
        const project = path.basename(cwd)

        processes.push({
          pid,
          cwd,
          tty,
          project,
          cmdline,
          isIrisManaged: tty === null,  // No TTY = likely Iris-spawned
        })
      } catch (e) {
        // Process may have exited between pgrep and reading /proc
        log.log(`Failed to read process ${pid}: ${e.message}`)
      }
    }
  } catch (e) {
    // pgrep returns non-zero if no matches - that's fine
    if (!e.message?.includes('Command failed')) {
      log.error('Error scanning processes:', e.message)
    }
  }

  // Sort: external sessions first (by tty), then Iris-managed
  processes.sort((a, b) => {
    if (a.tty && !b.tty) return -1
    if (!a.tty && b.tty) return 1
    if (a.tty && b.tty) return a.tty.localeCompare(b.tty)
    return a.pid - b.pid
  })

  return processes
}

/**
 * Run a scan and broadcast if changed
 */
function scan() {
  const newProcesses = scanProcesses()

  // Check if process list changed (by PID)
  const oldPids = systemClaudes.map(p => p.pid).sort().join(',')
  const newPids = newProcesses.map(p => p.pid).sort().join(',')
  const changed = oldPids !== newPids

  systemClaudes = newProcesses

  if (changed) {
    log.log(`Claude processes changed: ${newProcesses.length} running`)
    if (broadcastFn) {
      broadcastFn('system-claude:status', { processes: systemClaudes })
    }
  }
}

/**
 * Start the scanner (runs every 3 seconds)
 */
export function startScanner() {
  log.log('Starting system Claude scanner')
  scan()  // Initial scan
  scanInterval = setInterval(scan, 3000)
}

/**
 * Stop the scanner
 */
export function stopScanner() {
  if (scanInterval) {
    clearInterval(scanInterval)
    scanInterval = null
  }
  log.log('Stopped system Claude scanner')
}

/**
 * Get current list of system Claudes
 */
export function getSystemClaudes() {
  return systemClaudes
}
