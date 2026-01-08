# Skills

Iris provides MCP tools for interacting with the UI, voice, and other gods. These tools are available directly - no CLI needed.

## Quick Reference

| Tool | Description |
|------|-------------|
| `set_title` | Set your title in the UI |
| `set_ready` | Update visual state (working/done/stuck/question) |
| `say` | Speak text via TTS |
| `greet` | Time-aware greeting |
| `spawn_god` | Summon another god |
| `peek_god` | View god's terminal output |
| `browse` | Open URL in browser |
| `open_code` | Open file in code viewer |
| `highlight_code` | Highlight lines in code |
| `clear_highlights` | Clear code highlights |
| `open_markdown` | Open markdown viewer |
| `run_terminal` | Run command in visible terminal |
| `git_push` | Commit and push staged changes |

---

## set_title

Set your title so Paul knows what you're working on. Auto-detects your god name.

**Parameters:**
- `title` (required): The title to display
- `god_name` (optional): Defaults to self

**Good titles:** `iris/mcp: adding tools`, `elevathor: auth redirect bug`
**Bad titles:** `working`, `investigating`

---

## set_ready

Update your visual state in the UI. Auto-detects your god name.

**Parameters:**
- `state` (required): One of `working`, `done`, `stuck`, `question`
- `god_name` (optional): Defaults to self

| State | Effect |
|-------|--------|
| `working` | Default - actively working |
| `done` | Green glow - task complete |
| `stuck` | Red pulse - needs help |
| `question` | Yellow pulse - waiting for input |

---

## say

Speak text via TTS. Voice defaults to your god name.

**Parameters:**
- `text` (required): Text to speak
- `voice` (optional): Voice name (defaults to god name)
- `background` (optional): Don't wait for speech (default: true)

Supports paralinguistic tags: `[sigh]`, `[laugh]`, `[gasp]`, `[chuckle]`

---

## greet

Speak a time-aware greeting.

**Parameters:**
- `voice` (optional): Voice name

---

## spawn_god

Summon another god to work on a task.

**Parameters:**
- `task` (required): What the god should work on
- `god_name` (optional): Specific god name
- `project` (optional): Project to work in

---

## peek_god

View another god's terminal output.

**Parameters:**
- `god_name` (required): The god to peek at
- `lines` (optional): Number of lines (default: 50)

---

## browse

Open a URL in the Iris browser.

**Parameters:**
- `url` (required): URL to open (auto-adds https:// if needed)

---

## open_code

Open a file in the code viewer.

**Parameters:**
- `path` (required): File path (relative or absolute)
- `line` (optional): Line number to jump to
- `project` (optional): Project context

---

## highlight_code

Highlight lines in the code viewer.

**Parameters:**
- `path` (required): File path
- `lines` (required): Lines to highlight (e.g., "10", "10-20", "5,10-15")
- `color` (required): One of `yellow`, `red`, `green`, `blue`, `orange`, `purple`, `cyan`
- `note` (optional): Note to display with highlight

---

## clear_highlights

Clear highlights from code viewer.

**Parameters:**
- `path` (optional): File to clear (clears all if not specified)

---

## open_markdown

Open a markdown file in the rendered viewer.

**Parameters:**
- `path` (required): Path to markdown file

---

## run_terminal

Run a command in a visible terminal.

**Parameters:**
- `command` (required): Shell command to execute
- `god_name` (optional): Which god's terminal (default: Hermes)

---

## git_push

Commit staged changes and push with auto-generated message.

**Parameters:**
- `issue_id` (optional): Issue ID to include (e.g., "IRO-123")

Stage your changes first with `git add`, then use this tool.
