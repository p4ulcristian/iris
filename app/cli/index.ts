#!/usr/bin/env bun
/**
 * Iris CLI - Command-line interface for Iris.
 *
 * Usage: iris <command> [args]
 */

import { title } from "./commands/title"
import { ready } from "./commands/ready"
import { peek } from "./commands/peek"
import { spawn } from "./commands/spawn"
import { browse } from "./commands/browse"
import { code } from "./commands/code"
import { md } from "./commands/md"
import { run } from "./commands/run"
import { say } from "./commands/say"
import { greet } from "./commands/greet"
import { push } from "./commands/push"

const VERSION = "1.0.0"

const commands: Record<string, (args: string[]) => Promise<number>> = {
  title,
  ready,
  peek,
  spawn,
  browse,
  code,
  md,
  run,
  say,
  greet,
  push,
}

function showHelp() {
  console.log(`
\x1b[1miris\x1b[0m - Iris CLI v${VERSION}

\x1b[1mUSAGE\x1b[0m
  iris <command> [args]

\x1b[1mCOMMANDS\x1b[0m
  \x1b[36mtitle\x1b[0m <text>              Set god's title
  \x1b[36mready\x1b[0m <state>             Set ready state (working/done/stuck/question)
  \x1b[36mpeek\x1b[0m <god> [lines]        View god's terminal output
  \x1b[36mspawn\x1b[0m <task> [--god <n>]  Summon a god
  \x1b[36mbrowse\x1b[0m <url>              Open URL in browser
  \x1b[36mcode\x1b[0m open <file> [line]   Open file in code viewer
  \x1b[36mcode\x1b[0m highlight ...        Highlight lines in code viewer
  \x1b[36mmd\x1b[0m <file>                 Open markdown viewer
  \x1b[36mrun\x1b[0m <command>             Run command in visible terminal
  \x1b[36msay\x1b[0m <text> [--voice v]    Speak text via TTS
  \x1b[36mgreet\x1b[0m [--voice v]         Time-aware greeting
  \x1b[36mpush\x1b[0m [ISSUE-ID]           Git commit and push

\x1b[1mEXAMPLES\x1b[0m
  iris title "iris/cli: implementing commands"
  iris ready done
  iris peek zeus 100
  iris say "Hello Paul" --voice hermes --bg
  iris spawn "fix the auth bug" --god athena
  iris push IRO-123

\x1b[1mENVIRONMENT\x1b[0m
  GOD_NAME        Required for title/ready commands
  IRIS_WS_URL     WebSocket URL (default: ws://127.0.0.1:9999)
  IRIS_TTS_URL    TTS server URL (default: http://127.0.0.1:8765)
`)
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    showHelp()
    process.exit(0)
  }

  if (cmd === "--version" || cmd === "-V") {
    console.log(`iris v${VERSION}`)
    process.exit(0)
  }

  const handler = commands[cmd]
  if (!handler) {
    console.error(`\x1b[31mUnknown command: ${cmd}\x1b[0m`)
    console.error("Run 'iris help' for usage")
    process.exit(1)
  }

  try {
    const exitCode = await handler(args.slice(1))
    process.exit(exitCode)
  } catch (error) {
    console.error(`\x1b[31mError: ${error}\x1b[0m`)
    process.exit(1)
  }
}

main()
