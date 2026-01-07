/**
 * Open files in the code viewer with optional highlighting.
 */

import { send } from "../lib/ws"
import { resolve } from "path"

const VALID_COLORS = ["yellow", "red", "green", "blue", "orange", "purple", "cyan"] as const

function resolvePath(filePath: string): string {
  if (filePath.startsWith("/")) {
    return filePath
  }
  return resolve(process.cwd(), filePath)
}

function parseLines(linesStr: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []

  for (const part of linesStr.split(",")) {
    const trimmed = part.trim()
    if (trimmed.includes("-")) {
      const [start, end] = trimmed.split("-").map((s) => parseInt(s, 10))
      ranges.push({ start, end })
    } else {
      const line = parseInt(trimmed, 10)
      ranges.push({ start: line, end: line })
    }
  }

  return ranges
}

async function openFile(filePath: string, line?: number, forceNew = false): Promise<number> {
  const absPath = resolvePath(filePath)

  const message: Record<string, unknown> = {
    event: "code:open",
    filePath: absPath,
  }

  if (line) {
    message.line = line
  }
  if (forceNew) {
    message.forceNew = true
  }

  const success = await send(message)

  if (!success) {
    console.error(`\x1b[31mFailed to open ${filePath}\x1b[0m`)
    return 1
  }

  if (line) {
    console.log(`\x1b[32mOpening ${filePath}:${line}\x1b[0m`)
  } else {
    console.log(`\x1b[32mOpening ${filePath}\x1b[0m`)
  }
  return 0
}

async function highlight(
  filePath: string,
  linesStr: string,
  color: string,
  note?: string
): Promise<number> {
  if (!VALID_COLORS.includes(color as (typeof VALID_COLORS)[number])) {
    console.error(`\x1b[31mInvalid color: ${color}\x1b[0m`)
    console.error(`Valid colors: ${VALID_COLORS.join(", ")}`)
    return 1
  }

  const absPath = resolvePath(filePath)

  let ranges: Array<{ start: number; end: number }>
  try {
    ranges = parseLines(linesStr)
  } catch {
    console.error(`\x1b[31mInvalid line specification: ${linesStr}\x1b[0m`)
    return 1
  }

  const highlights = ranges.map(({ start, end }) => ({
    line: start,
    endLine: end,
    color,
    ...(note && { note }),
  }))

  const success = await send({
    event: "code:highlight",
    filePath: absPath,
    highlights,
  })

  if (!success) {
    console.error("\x1b[31mFailed to highlight\x1b[0m")
    return 1
  }

  console.log(`\x1b[32mHighlighted ${linesStr} in ${color}\x1b[0m`)
  return 0
}

async function clear(filePath?: string): Promise<number> {
  const message: Record<string, unknown> = { event: "code:highlight:clear" }

  if (filePath) {
    message.filePath = resolvePath(filePath)
  }

  const success = await send(message)

  if (!success) {
    console.error("\x1b[31mFailed to clear highlights\x1b[0m")
    return 1
  }

  if (filePath) {
    console.log(`\x1b[32mCleared highlights from ${filePath}\x1b[0m`)
  } else {
    console.log("\x1b[32mCleared all highlights\x1b[0m")
  }
  return 0
}

export async function code(args: string[]): Promise<number> {
  const subcommand = args[0]?.toLowerCase()

  if (!subcommand) {
    console.error("Usage: iris code <command>")
    console.error("")
    console.error("Commands:")
    console.error("  open <file> [line] [--new]     Open file in code viewer")
    console.error("  highlight <file> <lines> <color> [note]  Highlight lines")
    console.error("  clear [file]                   Clear highlights")
    console.error("")
    console.error("Examples:")
    console.error("  iris code open src/App.jsx")
    console.error("  iris code open src/App.jsx 42")
    console.error("  iris code highlight src/App.jsx 10-20 yellow 'Auth logic'")
    console.error("  iris code clear")
    return 1
  }

  if (subcommand === "open") {
    const remaining = args.slice(1)
    const forceNew = remaining.includes("--new")
    const filtered = remaining.filter((a) => a !== "--new")

    const filePath = filtered[0]
    if (!filePath) {
      console.error("Usage: iris code open <file> [line] [--new]")
      return 1
    }

    const line = filtered[1] ? parseInt(filtered[1], 10) : undefined
    return openFile(filePath, line, forceNew)
  }

  if (subcommand === "highlight") {
    const [, filePath, linesStr, color, ...noteParts] = args
    if (!filePath || !linesStr || !color) {
      console.error("Usage: iris code highlight <file> <lines> <color> [note]")
      console.error(`Colors: ${VALID_COLORS.join(", ")}`)
      return 1
    }
    const note = noteParts.length > 0 ? noteParts.join(" ") : undefined
    return highlight(filePath, linesStr, color, note)
  }

  if (subcommand === "clear") {
    return clear(args[1])
  }

  console.error(`Unknown subcommand: ${subcommand}`)
  return 1
}
