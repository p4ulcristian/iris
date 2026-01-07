/**
 * Speak text via TTS server.
 */

import { speak } from "../lib/http"

// Voice aliases (god names map to their voice files)
const VOICE_ALIASES: Record<string, string> = {
  zeus: "zeus",
  hades: "hades",
  apollo: "apollo",
  athena: "athena",
  artemis: "artemis",
  hermes: "hermes",
  poseidon: "poseidon",
  hera: "hera",
  ares: "ares",
  hephaestus: "hephaestus",
  aphrodite: "aphrodite",
  dionysus: "dionysus",
  demeter: "demeter",
}

function resolveVoice(voice: string): string {
  const lower = voice.toLowerCase().trim()
  return VOICE_ALIASES[lower] || voice
}

export async function say(args: string[]): Promise<number> {
  let text: string | null = null
  let voice: string | null = null
  let background = false

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--voice" || args[i] === "-v") {
      if (i + 1 < args.length) {
        voice = args[i + 1]
        i++
      }
    } else if (args[i] === "--bg" || args[i] === "--async") {
      background = true
    } else if (text === null) {
      text = args[i]
    }
  }

  if (!text) {
    console.error("Usage: iris say <text> [--voice <name>] [--bg]")
    console.error("")
    console.error("Options:")
    console.error("  --voice, -v  Voice name (god name or voice code)")
    console.error("  --bg         Run in background, return immediately")
    console.error("")
    console.error("Paralinguistic tags: [sigh], [laugh], [gasp], [chuckle], [cough]")
    console.error("")
    console.error("Examples:")
    console.error("  iris say 'Hello Paul'")
    console.error("  iris say 'Task complete' --voice hermes --bg")
    console.error("  iris say '[sigh] Monday again.'")
    return 1
  }

  const resolvedVoice = voice ? resolveVoice(voice) : undefined
  const success = await speak(text, resolvedVoice, background)

  if (!success) {
    console.error("\x1b[31mSpeak failed - is TTS server running?\x1b[0m")
    return 1
  }

  return 0
}
