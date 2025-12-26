# Skills

Skills are utility commands available to gods.

## Usage

```bash
python -m brain.skills.<skill> <args>
```

## Available

| Skill | Usage | Description |
|-------|-------|-------------|
| `focus` | `python -m brain.skills.focus "status"` | Update your status in the app |
| `ready` | `python -m brain.skills.ready <state>` | Update your visual state (border effects) |
| `glow` | `python -m brain.skills.glow file.md` | Open markdown in glow terminal |
| `nvim` | `python -m brain.skills.nvim file` | Open file in neovim terminal |
| `run` | `python -m brain.skills.run "cmd"` | Run command in new terminal |
| `push` | `python -m brain.skills.push [IRO-XXX]` | Auto-commit and push staged changes |

## ready

Update your visual state in Iris. The border styling changes based on state.

```bash
python -m brain.skills.ready working  # Default state - actively working
python -m brain.skills.ready done     # Green glow - task complete
python -m brain.skills.ready stuck    # Red pulse - needs help
```

| State | Visual Effect |
|-------|---------------|
| `working` | Default god-colored border |
| `done` | Green static glow |
| `stuck` | Red slow pulse |

## nvim-highlight

```bash
python -m brain.skills.nvim-highlight setup
python -m brain.skills.nvim-highlight lines 10 20 green
python -m brain.skills.nvim-highlight range 5 10 25 red
python -m brain.skills.nvim-highlight goto 42
python -m brain.skills.nvim-highlight clear
```

Colors: yellow, green, red, blue, orange, purple, cyan

## When to Use

When Paul says "open in [tool]":
- "Open in glow" -> `python -m brain.skills.glow /path/to/file.md`
- "Edit in nvim" -> `python -m brain.skills.nvim /path/to/file`
