/**
 * Time-aware greeting via TTS.
 */

import { speak } from "../lib/http"

const GREETINGS = {
  morning: [
    "{day} morning, {time}. What chaos today?",
    "Good morning Paul. It's {day}, {time}. Try not to mass produce bugs.",
    "{day}, {time}. Coffee kicked in yet?",
    "Morning. {day}, {time}. Let's see what breaks.",
    "It's {day} morning. You rang?",
  ],
  afternoon: [
    "{day} afternoon, {time}. How's the focus holding up?",
    "It's {day}, {time}. Afternoon slump or power hour?",
    "{day}, {time}. Still going strong?",
    "Afternoon. {day}, {time}. What are we breaking?",
    "{day}, {time}. The goddess descends. What do you want?",
  ],
  evening: [
    "{day} evening, {time}. Working late?",
    "It's {day}, {time}. Evening session. Bold.",
    "{day}, {time}. Wrapping up or just getting started?",
    "Evening, {day}, {time}. What fresh hell is this?",
    "{day} night owl mode. It's {time}.",
  ],
}

function getGreeting(): string {
  const now = new Date()
  const hour = now.getHours()
  const day = now.toLocaleDateString("en-US", { weekday: "long" })
  const time = now
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()

  let period: keyof typeof GREETINGS
  if (hour < 12) {
    period = "morning"
  } else if (hour < 17) {
    period = "afternoon"
  } else {
    period = "evening"
  }

  const templates = GREETINGS[period]
  const template = templates[Math.floor(Math.random() * templates.length)]

  return template.replace("{day}", day).replace("{time}", time)
}

export async function greet(args: string[]): Promise<number> {
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
    }
  }

  const greeting = getGreeting()
  const success = await speak(greeting, voice || undefined, background)

  if (!success) {
    console.error("\x1b[31mGreet failed - is TTS server running?\x1b[0m")
    return 1
  }

  return 0
}
