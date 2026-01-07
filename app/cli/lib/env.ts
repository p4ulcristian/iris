/**
 * Environment helpers for Iris CLI.
 */

export function getGodName(): string | null {
  return process.env.GOD_NAME || null
}

export function requireGodName(): string {
  const name = getGodName()
  if (!name) {
    console.error("\x1b[31mNot running as a god (GOD_NAME not set)\x1b[0m")
    process.exit(1)
  }
  return name
}

export function getWsUrl(): string {
  return process.env.IRIS_WS_URL || "ws://127.0.0.1:9999"
}

export function getTtsUrl(): string {
  return process.env.IRIS_TTS_URL || "http://127.0.0.1:8765"
}
