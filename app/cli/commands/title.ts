/**
 * Set god's title in Iris UI.
 */

import { send } from "../lib/ws"
import { requireGodName } from "../lib/env"

export async function title(args: string[]): Promise<number> {
  const text = args.join(" ")
  if (!text) {
    console.error("Usage: iris title <text>")
    console.error("Example: iris title 'iris/cli: implementing commands'")
    return 1
  }

  const godName = requireGodName()

  const success = await send({
    event: "god:set-title",
    godName,
    title: text,
  })

  if (!success) {
    console.error("\x1b[31mFailed to set title - is Iris running?\x1b[0m")
    return 1
  }

  return 0
}
