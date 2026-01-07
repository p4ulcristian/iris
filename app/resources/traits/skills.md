# Skills

Commands for interacting with Iris. Use the `iris` CLI.

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

---

## title

Set your title so Paul knows what you're working on.

```bash
iris title "project/area: goal"
```

**Good:** `iris/cli: implementing commands`, `elevathor: auth redirect bug`
**Bad:** `working`, `investigating`

---

## ready

Update your visual state in the UI.

```bash
iris ready <state>
```

| State | Effect |
|-------|--------|
| `working` | Default - actively working |
| `done` | Green glow - task complete |
| `stuck` | Red pulse - needs help |
| `question` | Yellow pulse - waiting for input |

---

## peek

View another god's terminal output.

```bash
iris peek zeus        # Last 50 lines
iris peek zeus 100    # Last 100 lines
iris peek zeus --strip # Remove ANSI codes
```

---

## browse

Open a URL in the Iris browser.

```bash
iris browse github.com
iris browse https://example.com
iris browse /path/to/file.html
```

---

## code

Open files in the code viewer with optional highlighting.

```bash
# Open file
iris code open src/App.jsx
iris code open src/App.jsx 42      # Jump to line
iris code open src/App.jsx --new   # New viewer

# Highlight lines
iris code highlight src/App.jsx 10-20 yellow "Auth logic"
iris code highlight src/App.jsx 5 red "Bug here"

# Clear highlights
iris code clear
iris code clear src/App.jsx
```

Colors: `yellow`, `red`, `green`, `blue`, `orange`, `purple`, `cyan`

---

## md

Open markdown files in the rendered viewer.

```bash
iris md README.md
```

---

## spawn

Summon another god to work on a task.

```bash
iris spawn "fix the auth bug"
iris spawn "review this PR" --god zeus
```

---

## run

Run a command in a new visible terminal.

```bash
iris run './start-dev.sh'
iris run 'npm run dev' --cwd ~/Work/myproject
iris run 'pytest' --title Tests
```

---

## say

Speak text via TTS.

```bash
iris say "Hello Paul"
iris say "Task complete" --voice hermes --bg
iris say "[sigh] Monday again."
```

Paralinguistic tags: `[sigh]`, `[laugh]`, `[gasp]`, `[chuckle]`, `[cough]`

---

## greet

Time-aware greeting.

```bash
iris greet
iris greet --voice athena --bg
```

---

## push

Git commit and push staged changes with auto-generated message.

```bash
iris push           # Commit without issue
iris push IRO-123   # Commit with issue ID
```

Only works with staged changes. Stage your changes first, then push.
