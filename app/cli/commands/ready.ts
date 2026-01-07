/**
 * Set god's ready state in Iris UI.
 */

import { send } from "../lib/ws"
import { requireGodName } from "../lib/env"

const VALID_STATES = ["working", "done", "stuck", "question"] as const
type ReadyState = (typeof VALID_STATES)[number]

export async function ready(args: string[]): Promise<number> {
  const state = args[0]?.toLowerCase()

  if (!state || !VALID_STATES.includes(state as ReadyState)) {
    console.error("Usage: iris ready <state>")
    console.error("")
    console.error("States:")
    console.error("  working   Default - actively working")
    console.error("  done      Green glow - task complete")
    console.error("  stuck     Red pulse - needs help")
    console.error("  question  Yellow pulse - waiting for input")
    return 1
  }

  const godName = requireGodName()

  const success = await send({
    event: "god:set-ready",
    godName,
    readyState: state,
  })

  if (!success) {
    console.error("\x1b[31mFailed to set ready state - is Iris running?\x1b[0m")
    return 1
  }

  return 0
}
