# Iris CLI Migration Plan

Migrate Python skills to a Bun-compiled TypeScript binary.

## Goal

Replace this:
```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.title "working on auth"
PYTHONPATH="$IRIS_HOME" python -m brain.say "Hello" --voice hermes --bg
```

With this:
```bash
iris title "working on auth"
iris say "Hello" --voice hermes --bg
```

## Why

| Metric | Python | Bun Binary |
|--------|--------|------------|
| Startup | ~100ms | ~10ms |
| Invocation | 67 chars | 5 chars |
| Dependencies | PYTHONPATH set | None |
| Distribution | Whole brain/ dir | Single file |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         iris CLI                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Command Router                        ││
│  │  iris <command> [args]                                   ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│  ┌───────────┬───────────┬───────────┬───────────┐         │
│  │  title    │  ready    │  peek     │  spawn    │  ...    │
│  └─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┘         │
│        │           │           │           │                │
│  ┌─────┴───────────┴───────────┴───────────┴─────┐         │
│  │              Transport Layer                   │         │
│  │  ┌─────────────┐  ┌─────────────────────────┐ │         │
│  │  │  WebSocket  │  │  HTTP (TTS server)      │ │         │
│  │  │  :9999      │  │  :8765                  │ │         │
│  │  └─────────────┘  └─────────────────────────┘ │         │
│  └───────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands

### Core (WebSocket → Iris)

| Command | Args | Description |
|---------|------|-------------|
| `title` | `<text>` | Set god's title |
| `ready` | `<state>` | Set ready state (working/done/stuck/question) |
| `peek` | `<god> [lines] [--strip]` | View god's terminal |
| `spawn` | `<task> [--god <name>]` | Summon a god |
| `browse` | `<url>` | Open URL in browser |
| `code` | `open <file> [line] [--new]` | Open in code viewer |
| `code` | `highlight <file> <lines> <color> [note]` | Highlight lines |
| `code` | `clear [file]` | Clear highlights |
| `md` | `<file>` | Open markdown viewer |
| `run` | `<command> [--cwd <dir>] [--title <t>]` | Run in terminal |

### Voice (HTTP → TTS server)

| Command | Args | Description |
|---------|------|-------------|
| `say` | `<text> [--voice <v>] [--bg]` | Speak text |
| `greet` | `[--voice <v>] [--bg]` | Time-aware greeting |

### Git (Local)

| Command | Args | Description |
|---------|------|-------------|
| `push` | `[ISSUE-ID]` | Commit and push staged changes |

---

## Project Structure

```
app/
├── cli/
│   ├── index.ts              # Entry point, command router
│   ├── commands/
│   │   ├── title.ts
│   │   ├── ready.ts
│   │   ├── peek.ts
│   │   ├── spawn.ts
│   │   ├── browse.ts
│   │   ├── code.ts
│   │   ├── md.ts
│   │   ├── run.ts
│   │   ├── say.ts
│   │   ├── greet.ts
│   │   └── push.ts
│   ├── lib/
│   │   ├── ws.ts             # WebSocket client
│   │   ├── http.ts           # HTTP client (for TTS)
│   │   ├── git.ts            # Git operations
│   │   └── env.ts            # Environment (GOD_NAME, etc)
│   └── types.ts              # Shared types
├── package.json
└── tsconfig.json
```

---

## Implementation

### 1. WebSocket Client (`lib/ws.ts`)

```typescript
const WS_URL = "ws://127.0.0.1:9999"

export async function send(message: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL)
    ws.onopen = () => {
      ws.send(JSON.stringify(message))
      ws.close()
      resolve(true)
    }
    ws.onerror = () => resolve(false)
    setTimeout(() => { ws.close(); resolve(false) }, 2000)
  })
}

export async function request<T>(
  message: Record<string, unknown>,
  responseEvent: string
): Promise<T | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL)
    ws.onopen = () => ws.send(JSON.stringify(message))
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.event === responseEvent) {
        ws.close()
        resolve(data as T)
      }
    }
    ws.onerror = () => resolve(null)
    setTimeout(() => { ws.close(); resolve(null) }, 5000)
  })
}
```

### 2. Command Example (`commands/title.ts`)

```typescript
import { send } from "../lib/ws"

export async function title(args: string[]): Promise<number> {
  const text = args.join(" ")
  if (!text) {
    console.error("Usage: iris title <text>")
    return 1
  }

  const godName = process.env.GOD_NAME
  if (!godName) {
    console.error("\x1b[31mNot running as a god (GOD_NAME not set)\x1b[0m")
    return 1
  }

  const success = await send({
    event: "god:set-title",
    godName,
    title: text
  })

  return success ? 0 : 1
}
```

### 3. Entry Point (`index.ts`)

```typescript
import { title } from "./commands/title"
import { ready } from "./commands/ready"
import { peek } from "./commands/peek"
import { spawn } from "./commands/spawn"
import { browse } from "./commands/browse"
import { code } from "./commands/code"
import { md } from "./commands/md"
import { run } from "./commands/run"
import { say } from "./commands/say"
import { greet } from "./commands/greet"
import { push } from "./commands/push"

const commands: Record<string, (args: string[]) => Promise<number>> = {
  title, ready, peek, spawn, browse, code, md, run, say, greet, push
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`
iris - Iris CLI

Commands:
  title <text>              Set god's title
  ready <state>             Set ready state (working/done/stuck/question)
  peek <god> [lines]        View god's terminal output
  spawn <task> [--god <n>]  Summon a god
  browse <url>              Open URL in browser
  code open <file> [line]   Open file in code viewer
  code highlight ...        Highlight lines in code viewer
  md <file>                 Open markdown viewer
  run <command>             Run command in visible terminal
  say <text> [--voice v]    Speak text
  greet [--voice v]         Time-aware greeting
  push [ISSUE-ID]           Git commit and push
`)
    process.exit(0)
  }

  const handler = commands[cmd]
  if (!handler) {
    console.error(`Unknown command: ${cmd}`)
    console.error("Run 'iris help' for usage")
    process.exit(1)
  }

  const exitCode = await handler(args)
  process.exit(exitCode)
}

main()
```

---

## Build

### package.json

```json
{
  "name": "iris-cli",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "bun build --compile --outfile dist/iris ./cli/index.ts",
    "build:linux": "bun build --compile --target=bun-linux-x64 --outfile dist/iris-linux ./cli/index.ts",
    "build:mac": "bun build --compile --target=bun-darwin-arm64 --outfile dist/iris-mac ./cli/index.ts",
    "dev": "bun run ./cli/index.ts"
  }
}
```

### Build command

```bash
cd app
bun run build
# Output: dist/iris (single executable, ~50MB)
```

---

## Installation

### Option A: Symlink (development)

```bash
ln -sf ~/Work/iris/app/dist/iris ~/.local/bin/iris
```

### Option B: Copy (distribution)

```bash
cp ~/Work/iris/app/dist/iris ~/.local/bin/iris
chmod +x ~/.local/bin/iris
```

### Option C: App installs it

Iris app copies the binary to `~/.local/bin/` on startup or via settings.

---

## Migration Steps

### Phase 1: Build CLI (Day 1)

1. Create `app/cli/` directory structure
2. Implement `lib/ws.ts` WebSocket client
3. Implement `lib/http.ts` HTTP client
4. Implement `lib/env.ts` environment helpers
5. Implement core commands: `title`, `ready`, `peek`
6. Test with `bun run dev title "test"`
7. Build binary: `bun run build`

### Phase 2: All Commands (Day 2)

1. Implement remaining commands:
   - `spawn`, `browse`, `code`, `md`, `run`
   - `say`, `greet`
   - `push`
2. Test each command
3. Add help text for each

### Phase 3: Integration (Day 3)

1. Install binary to `~/.local/bin/iris`
2. Update `skills.md` trait to use new syntax
3. Update `speak.md` trait for `iris say`
4. Update `god-persona.md` to reference `iris` command
5. Test with real god session

### Phase 4: Cleanup (Day 4)

1. Remove old Python skill invocations from traits
2. Keep `brain/skills/` for backward compat (mark deprecated)
3. Keep `brain/say.py` for backward compat
4. Update CLAUDE.md for other projects
5. Document in README

---

## Updated Traits

### skills.md (new)

```markdown
# Skills

Commands for interacting with Iris.

## Quick Reference

| Command | Description |
|---------|-------------|
| `iris title "text"` | Set your title |
| `iris ready <state>` | Update visual state |
| `iris peek <god>` | View god's terminal |
| `iris spawn "task"` | Summon a god |
| `iris browse <url>` | Open browser |
| `iris code open <file>` | Open code viewer |
| `iris md <file>` | Open markdown |
| `iris run <cmd>` | Run in terminal |
| `iris say "text"` | Speak aloud |
| `iris push` | Git commit+push |

...
```

### speak.md (new)

```markdown
# Voice

You have a voice. Use it.

## Command

```bash
iris say "message" --voice hermes --bg
```

...
```

---

## Rollback Plan

If issues arise:
1. Keep Python skills working (don't delete)
2. Traits can reference either:
   - `iris title "x"` (new)
   - `PYTHONPATH="$IRIS_HOME" python -m brain.skills.title "x"` (old)
3. Toggle via environment variable if needed

---

## Success Criteria

- [ ] All 11 commands work
- [ ] Startup time < 20ms
- [ ] Single binary, no dependencies
- [ ] Traits updated
- [ ] Gods can use `iris` command
- [ ] Backward compat with Python (deprecated but working)

---

## Future Enhancements

1. **Autocomplete** - Shell completions for commands
2. **Config file** - `~/.config/iris/cli.json` for defaults
3. **Colors** - Consistent ANSI color output
4. **Verbose mode** - `--verbose` for debugging
5. **Version** - `iris --version`
