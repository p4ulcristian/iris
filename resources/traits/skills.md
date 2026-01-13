# Skills

Iris provides MCP tools for interacting with the UI, voice, and other gods. These tools are available directly - no CLI needed.

## Tool Preferences

**Use Iris tools for visual feedback.** These show operations in the UI so Paul can see what you're doing:

| Instead of... | Use... | Why |
|---------------|--------|-----|
| `Bash` | `run_terminal` | Shows command in visible terminal |
| `Read` | `iris_read` | Opens file in code viewer |
| `Edit` | `iris_edit` | Shows changes highlighted in code viewer |

The built-in tools work silently. The Iris alternatives provide visual feedback.

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
| `peek_run` | Get output from a command by run_id |
| `iris_read` | Read file AND show in code viewer |
| `iris_edit` | Edit file AND show changes in viewer |
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

Run a command in a visible terminal. Returns a `run_id` for tracking output.

**Parameters:**
- `command` (required): Shell command to execute
- `god_name` (optional): Which god's terminal (default: Hermes)
- `raw` (optional): Clean output mode (default: true)

On timeout, returns partial output and a `run_id` you can use with `peek_run`.

---

## peek_run

Get output from a specific command run by its run_id. Use after `run_terminal` times out to see what was captured.

**Parameters:**
- `run_id` (required): The run_id returned by run_terminal
- `lines` (optional): Number of lines to retrieve (default: all)

Returns the output and status (`running`, `completed`, `timeout`, `failed`).

---

## iris_read

Read a file AND display it in the Iris code viewer. Use instead of built-in Read for visual feedback.

**Parameters:**
- `path` (required): File path (relative or absolute)
- `line` (optional): Line number to jump to and highlight
- `highlight_lines` (optional): Lines to highlight (e.g., "10-20", "5,10,15")

Returns file contents with line numbers, same format as Read tool.

---

## iris_edit

Edit a file with visual feedback in Iris code viewer. Use instead of built-in Edit for visual feedback.

**Parameters:**
- `path` (required): File path (relative or absolute)
- `old_string` (required): The exact text to replace
- `new_string` (required): The replacement text
- `replace_all` (optional): Replace all occurrences (default: false)

Opens the file in code viewer and highlights the changed lines in green.

---

## git_push

Commit staged changes and push with auto-generated message.

**Parameters:**
- `issue_id` (optional): Issue ID to include (e.g., "IRO-123")

Stage your changes first with `git add`, then use this tool.
