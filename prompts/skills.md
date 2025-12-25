# Skills

Skills are pane utilities. They handle tmux layout automatically.

## Usage

```bash
python -m brain.skills.<skill> <args>
```

## Available

| Skill | Usage | Description |
|-------|-------|-------------|
| `focus` | `python -m brain.skills.focus "status"` | Update your pane title |
| `glow` | `python -m brain.skills.glow file.md` | Open markdown in glow pane |
| `nvim` | `python -m brain.skills.nvim file` | Open file in neovim pane |
| `run` | `python -m brain.skills.run "cmd"` | Run command in new pane |
| `push` | `python -m brain.skills.push [IRO-XXX]` | Auto-commit and push staged changes |

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
- "Open in glow" → `python -m brain.skills.glow /path/to/file.md`
- "Edit in nvim" → `python -m brain.skills.nvim /path/to/file`
