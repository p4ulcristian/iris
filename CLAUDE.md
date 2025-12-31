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

### UI Structure

| Term | Meaning |
|------|---------|
| **Stage** | Main content area where entities are displayed |
| **Surface** | Workspace layout on the stage (one per realm) |
| **Tile** | A divided section on the surface containing entities |
| **Entity** | Any item in a tile: god, terminal, browser, etc. |
| **Left Wing** | Left sidebar (Realms + Powers) |
| **Right Wing** | Right sidebar (Scrolls + Summon menu) |
| **Realm** | A tab/workspace (Olympus, Elysium, etc.) |
| **Powers** | Services: speak, hear, wake, express |
| **Scrolls** | Entity status cards in the right wing |
| **Summon menu** | Bottom-right buttons to create entities |

### App Components

| Term | Meaning |
|------|---------|
| **Iris** | The Electron frontend — React app in `app/src/` |
| **brain** | Python voice/utility system — `brain/` |
| **Olympus** | The full Electron app where gods work |
| **god** | A Claude instance in an abduco terminal session |

### Actions

| Term | Meaning |
|------|---------|
| **summon** | Spawn a new god (`Ctrl+N`) |
| **banish** | Kill a god's session (`Ctrl+K`) |

### God States

| Term | Meaning |
|------|---------|
| **working** | God is actively working |
| **done** | Task complete |
| **stuck** | God needs help |
| **question** | God is waiting for user input |
| **scattered** | God crashed |

### Powers (Services)

| Term | Meaning |
|------|---------|
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
