/**
 * View another god's terminal output.
 */

import { request } from "../lib/ws"
import { $ } from "bun"

interface PeekResponse {
  event: string
  output?: string
  error?: string
}

/**
 * Get scrollback directly from Zellij session.
 */
async function peekZellij(godName: string, lines: number): Promise<string | null> {
  const sessionName = `iris-${godName.toLowerCase()}`

  try {
    // Check if session exists
    const sessions = await $`zellij list-sessions`.text()
    if (!sessions.includes(sessionName)) {
      return null
    }

    // Create temp file for dump
    const tmpFile = `/tmp/iris-peek-${Date.now()}.txt`

    // Dump screen via zellij
    await $`zellij -s ${sessionName} action dump-screen --full ${tmpFile}`.quiet()

    // Read and cleanup
    const file = Bun.file(tmpFile)
    if (await file.exists()) {
      const content = await file.text()
      await $`rm -f ${tmpFile}`.quiet()

      // Apply line limit
      const allLines = content.split("\n")
      if (allLines.length > lines) {
        return allLines.slice(-lines).join("\n")
      }
      return content
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get scrollback via Iris WebSocket.
 */
async function peekIris(godName: string, lines: number): Promise<string | null> {
  const response = await request<PeekResponse>(
    { event: "god:peek", godName, lines },
    "god:peek:response"
  )
  return response?.output || null
}

/**
 * Strip ANSI escape codes from text.
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
}

export async function peek(args: string[]): Promise<number> {
  if (args.length === 0) {
    console.error("Usage: iris peek <god> [lines] [--strip]")
    console.error("")
    console.error("Examples:")
    console.error("  iris peek zeus        # Last 50 lines")
    console.error("  iris peek zeus 100    # Last 100 lines")
    console.error("  iris peek zeus --strip # Remove ANSI codes")
    return 1
  }

  const godName = args[0]
  let lines = 50
  let strip = false

  for (const arg of args.slice(1)) {
    if (arg === "--strip" || arg === "-s") {
      strip = true
    } else {
      const num = parseInt(arg, 10)
      if (!isNaN(num)) {
        lines = num
      }
    }
  }

  // Try Zellij first (works without Iris running)
  let output = await peekZellij(godName, lines)

  // Fall back to Iris WebSocket
  if (!output) {
    output = await peekIris(godName, lines)
  }

  if (!output) {
    console.error(`\x1b[31mFailed to peek at ${godName}\x1b[0m`)
    console.error("Could not get scrollback from Zellij or Iris.")
    return 1
  }

  if (!output.trim()) {
    console.log(`\x1b[33mNo output captured for ${godName}\x1b[0m`)
    return 0
  }

  if (strip) {
    output = stripAnsi(output)
  }

  console.log(output)
  return 0
}
