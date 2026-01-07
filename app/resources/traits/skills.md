# Skills

Python commands for interacting with Iris. All require `PYTHONPATH="$IRIS_HOME"` prefix.

## Quick Reference

| Skill | Command | Description |
|-------|---------|-------------|
| `title` | `python -m brain.skills.title "text"` | Set your title in UI |
| `ready` | `python -m brain.skills.ready <state>` | Update visual state |
| `peek` | `python -m brain.skills.peek <god> [lines]` | View god's terminal |
| `browse` | `python -m brain.skills.browse <url>` | Open URL in browser |
| `code` | `python -m brain.skills.code open <file>` | Open in code viewer |
| `md` | `python -m brain.skills.md <file>` | Open markdown viewer |
| `spawn` | `python -m brain.skills.spawn "task"` | Summon another god |
| `run` | `python -m brain.skills.run <command>` | Run in new terminal |
| `push` | `python -m brain.skills.push [ISSUE-ID]` | Git commit and push |

---

## title

Set your title so Paul knows what you're working on.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.title "project/area: goal"
```

**Good:** `iris/brain: wiring title skill`, `elevathor: auth redirect bug`
**Bad:** `working`, `investigating`

---

## ready

Update your visual state in the UI.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.ready <state>
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
PYTHONPATH="$IRIS_HOME" python -m brain.skills.peek zeus        # Last 50 lines
PYTHONPATH="$IRIS_HOME" python -m brain.skills.peek zeus 100    # Last 100 lines
PYTHONPATH="$IRIS_HOME" python -m brain.skills.peek zeus --strip # Remove ANSI codes
```

---

## browse

Open a URL in the Iris browser.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.browse github.com
PYTHONPATH="$IRIS_HOME" python -m brain.skills.browse https://example.com
PYTHONPATH="$IRIS_HOME" python -m brain.skills.browse /path/to/file.html
```

---

## code

Open files in the code viewer with optional highlighting.

```bash
# Open file
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code open src/App.jsx
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code open src/App.jsx 42      # Jump to line
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code open src/App.jsx --new   # New viewer

# Highlight lines
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code highlight src/App.jsx 10-20 yellow "Auth logic"
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code highlight src/App.jsx 5 red "Bug here"

# Clear highlights
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code clear
PYTHONPATH="$IRIS_HOME" python -m brain.skills.code clear src/App.jsx
```

Colors: `yellow`, `red`, `green`, `blue`, `orange`, `purple`, `cyan`

---

## md

Open markdown files in the rendered viewer.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.md README.md
```

---

## spawn

Summon another god to work on a task.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.spawn "fix the auth bug"
PYTHONPATH="$IRIS_HOME" python -m brain.skills.spawn --god zeus "review this PR"
```

---

## run

Run a command in a new visible terminal.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.run './start-dev.sh'
PYTHONPATH="$IRIS_HOME" python -m brain.skills.run 'npm run dev' --cwd ~/Work/myproject
PYTHONPATH="$IRIS_HOME" python -m brain.skills.run 'pytest' --title "Tests"
```

---

## push

Git commit and push staged changes with auto-generated message.

```bash
PYTHONPATH="$IRIS_HOME" python -m brain.skills.push           # Commit without issue
PYTHONPATH="$IRIS_HOME" python -m brain.skills.push IRO-123   # Commit with issue ID
```

Only works with staged changes. Stage your changes first, then push.
