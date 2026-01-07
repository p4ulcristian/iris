/**
 * HTTP client for Iris CLI (TTS server).
 */

import { getTtsUrl } from "./env"

/**
 * POST JSON to the TTS server.
 */
export async function postTts(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const url = `${getTtsUrl()}${endpoint}`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Speak text via TTS server.
 * If background is true, spawn a detached process.
 */
export async function speak(
  text: string,
  voice?: string,
  background = false
): Promise<boolean> {
  const payload: Record<string, unknown> = { text }
  if (voice) {
    payload.voice = voice
  }

  if (background) {
    // Spawn detached subprocess
    const proc = Bun.spawn({
      cmd: ["bun", "run", "-e", `
        fetch("${getTtsUrl()}/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(${JSON.stringify(payload)})
        }).catch(() => {})
      `],
      stdout: "ignore",
      stderr: "ignore",
    })
    proc.unref()
    return true
  }

  return postTts("/speak", payload)
}
