/**
 * Open markdown file in Iris viewer.
 */

import { send } from "../lib/ws"
import { resolve } from "path"

export async function md(args: string[]): Promise<number> {
  const filePath = args[0]

  if (!filePath) {
    console.error("Usage: iris md <file>")
    console.error("")
    console.error("Example:")
    console.error("  iris md README.md")
    return 1
  }

  // Resolve to absolute path
  const absPath = filePath.startsWith("/")
    ? filePath
    : resolve(process.cwd(), filePath)

  // Check if file exists
  const file = Bun.file(absPath)
  if (!(await file.exists())) {
    console.error(`\x1b[31mFile not found: ${absPath}\x1b[0m`)
    return 1
  }

  const success = await send({
    event: "md:open",
    filePath: absPath,
  })

  if (!success) {
    console.error(`\x1b[31mFailed to open ${filePath}\x1b[0m`)
    return 1
  }

  const basename = filePath.split("/").pop() || filePath
  console.log(`\x1b[32mOpened ${basename} in markdown viewer\x1b[0m`)
  return 0
}
