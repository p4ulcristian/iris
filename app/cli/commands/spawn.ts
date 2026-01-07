/**
 * Summon a god to work on a task.
 */

import { send } from "../lib/ws"

export async function spawn(args: string[]): Promise<number> {
  let godName: string | null = null
  let task: string[] = []

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--god" || args[i] === "-g") && i + 1 < args.length) {
      godName = args[i + 1]
      i++
    } else {
      task.push(args[i])
    }
  }

  const taskText = task.join(" ")
  if (!taskText) {
    console.error("Usage: iris spawn <task> [--god <name>]")
    console.error("")
    console.error("Examples:")
    console.error("  iris spawn 'fix the auth bug'")
    console.error("  iris spawn 'review this PR' --god zeus")
    return 1
  }

  const message: Record<string, unknown> = {
    event: "god:spawn",
    task: taskText,
  }

  if (godName) {
    message.name = godName.charAt(0).toUpperCase() + godName.slice(1).toLowerCase()
  }

  const success = await send(message)

  if (!success) {
    console.error("\x1b[31mFailed to spawn god - is Iris running?\x1b[0m")
    return 1
  }

  const name = godName ? godName.charAt(0).toUpperCase() + godName.slice(1) : "god"
  console.log(`\x1b[32mSpawned ${name}\x1b[0m`)
  return 0
}
