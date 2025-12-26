# Iris

Voice assistant for Paul.

@prompts/god.md
@prompts/realms.md
@prompts/voice.md
@prompts/skills.md
@prompts/pantheon.yaml

@architecture.md

---

## Terminology

| Term | Meaning |
|------|---------|
| **Iris** | The Electron frontend — React app in `app/src/` |
| **brain** | Python voice/utility system — `brain/` |
| **Olympus** | The full Electron app where gods work |
| **god** | A Claude instance in a dtach terminal session |
| **pane** | A god's terminal window |
| **realm** | A tab/workspace (Olympus, Elysium, etc.) |
| **summon** | Spawn a new god (`Ctrl+N`) |
| **banish** | Kill a god's session (`Ctrl+K`) |
| **working** | God is actively working |
| **done** | Task complete |
| **stuck** | God needs help |
| **scattered** | God crashed |
| **speak** | TTS service (`brain/speak/`, port 8765) |
| **hear** | STT service (`brain/hear/`, port 8766) |
| **wake** | Input listener for push-to-talk (`brain/wake/`) |
| **express** | Visual overlay UI (`brain/express/`, port 8767) |

---

## Conventions

**Naming:** Use `lowercase-dashes` for all files (e.g., `grocery-list.md`, `workout-log.md`)

**Organization:** Minimal structure - grow organically.

**Language:** Always respond in English, regardless of what language Paul uses.

---

## Speech-to-Text Tolerance

Paul uses speech-to-text, which often misinterprets names. **If you're 60% sure what he means, just go with it.**

Examples:
- "elevator" → `elevathor/`
- "iron rainbow" → `ironrainbow/`
- "color crazy" → `colormecrazy/`

---

## Projects

| Project | Path |
|---------|------|
| **Iron Rainbow** | `~/Work/ironrainbow` |
| **Elevathor** | `~/Work/elevathor` |
| **Color Me Crazy** | `~/Work/colormecrazy` |
| **Iris** | `~/Work/iris` |

**Project Context:** Always read a project's CLAUDE.md first (if it exists).

**Task Lists:** Live in the project's `vision/todo/` folder.

---

## Memory

Personal notes live in `memory/`:
- `memory/daily/` - shopping lists, daily notes
- `memory/recipes/` - recipes
- `memory/3d-printer/` - 3D printer notes
