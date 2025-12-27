# Skills

Skills are utility commands available to gods.

## Usage

```bash
python -m brain.skills.<skill> <args>
```

## Available

| Skill | Usage | Description |
|-------|-------|-------------|
| `focus` | `python -m brain.skills.focus "title"` | Set your title (goal/task) in the app |
| `ready` | `python -m brain.skills.ready <state>` | Update your visual state (border effects) |
| `peek` | `python -m brain.skills.peek <god> [lines]` | View another god's terminal output |
| `glow` | `python -m brain.skills.glow file.md` | Open markdown in glow terminal |
| `nvim` | `python -m brain.skills.nvim file` | Open file in neovim terminal |
| `run` | `python -m brain.skills.run "cmd"` | Run command in new terminal |
| `push` | `python -m brain.skills.push [IRO-XXX]` | Auto-commit and push staged changes |
| `browse` | `python -m brain.skills.browse <url>` | Open URL in the Iris browser |

## focus

Set your title - what you're working on. This appears in the god card header and task card.

```bash
python -m brain.skills.focus "iris/app: fixing auth bug"
python -m brain.skills.focus "elevathor: payment flow refactor"
```

**Title vs Status:**
- **Title** (set via `focus`) - Your goal/task. Stable, changes when you switch focus.
- **Status** (auto-updated by hook) - Current action like "reading handlers.js". Changes frequently.

Both appear in the UI: title as the main text, status below it.

## peek

View another god's terminal scrollback. Useful for checking what a fellow god is working on or debugging.

```bash
python -m brain.skills.peek zeus        # Last 50 lines (default)
python -m brain.skills.peek zeus 100    # Last 100 lines
python -m brain.skills.peek Athena 20   # Last 20 lines
```

Note: Only captures output while the god's terminal is attached to the Iris app. Output before attachment won't be available.

## ready

Update your visual state in Iris. The border styling changes based on state.

```bash
python -m brain.skills.ready working   # Default state - actively working
python -m brain.skills.ready done      # Green glow - task complete
python -m brain.skills.ready stuck     # Red pulse - needs help
python -m brain.skills.ready question  # Yellow pulse - waiting for input
```

| State | Visual Effect |
|-------|---------------|
| `working` | Default god-colored border |
| `done` | Green static glow |
| `stuck` | Red slow pulse |
| `question` | Yellow gentle pulse |

Note: `question` state is automatically triggered when using `AskUserQuestion` tool and resets to `working` when you continue working.

## nvim-highlight

```bash
python -m brain.skills.nvim-highlight setup
python -m brain.skills.nvim-highlight lines 10 20 green
python -m brain.skills.nvim-highlight range 5 10 25 red
python -m brain.skills.nvim-highlight goto 42
python -m brain.skills.nvim-highlight clear
```

Colors: yellow, green, red, blue, orange, purple, cyan

## browse

Open a URL in the Iris browser. Switches to the browser view and navigates to the URL.

```bash
python -m brain.skills.browse github.com           # Protocol added automatically
python -m brain.skills.browse https://example.com  # Full URL
```

## When to Use

When Paul says "open in [tool]":
- "Open in glow" -> `python -m brain.skills.glow /path/to/file.md`
- "Edit in nvim" -> `python -m brain.skills.nvim /path/to/file`
- "Open in browser" -> `python -m brain.skills.browse <url>`
