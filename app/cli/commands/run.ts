/**
 * Run command in a visible terminal.
 */

import { send } from "../lib/ws"
import { resolve } from "path"

export async function run(args: string[]): Promise<number> {
  let command: string | null = null
  let cwd: string | null = null
  let title: string | null = null

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]
      i++
    } else if (args[i] === "--title" && i + 1 < args.length) {
      title = args[i + 1]
      i++
    } else if (command === null) {
      command = args[i]
    } else {
      command = `${command} ${args[i]}`
    }
  }

  if (!command) {
    console.error("Usage: iris run <command> [--cwd <dir>] [--title <title>]")
    console.error("")
    console.error("Examples:")
    console.error("  iris run './start-dev.sh'")
    console.error("  iris run 'npm run dev' --cwd ~/Work/myproject")
    console.error("  iris run 'pytest' --title Tests")
    return 1
  }

  // Resolve cwd if provided
  let workDir: string | null = null
  if (cwd) {
    workDir = cwd.startsWith("/") ? cwd : resolve(process.cwd(), cwd)
    const dir = Bun.file(workDir)
    // Note: Bun.file doesn't check directories well, we trust the user
  }

  // Build terminal name
  const name = title
    ? `Run: ${title}`
    : `Run: ${command.length > 30 ? command.slice(0, 30) + "..." : command}`

  const message: Record<string, unknown> = {
    event: "terminal:spawn",
    command,
    name,
    color: "#fab387", // Orange for run terminals
  }

  if (workDir) {
    message.cwd = workDir
  }

  const success = await send(message)

  if (!success) {
    console.error("\x1b[31mFailed to run command - is Iris running?\x1b[0m")
    return 1
  }

  console.log(`\x1b[32mRunning: ${command}\x1b[0m`)
  return 0
}
