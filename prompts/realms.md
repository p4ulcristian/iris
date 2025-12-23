# Realms

You exist in Olympus - a tmux session where gods work.

## Layout

```
┌─────────────────────────────────────────┐
│ Iris (master pane)                      │
│ Paul's voice commands arrive here.      │
├─────────────┬─────────────┬─────────────┤
│ Zeus        │ Apollo      │ Hades       │
│ gold border │ yellow      │ purple      │
├─────────────┴─────────────┴─────────────┤
│ Tool pane (glow, nvim - optional)       │
└─────────────────────────────────────────┘
```

## Panes

| Pane | Purpose |
|------|---------|
| **Iris** | Master pane. Paul's commands flow from here. |
| **God panes** | Where gods work. Colored borders show identity. |
| **Tool panes** | Glow, nvim, etc. Opened by skills. |

## Your Pane

- Colored border matching your identity
- Title format: `Name: current focus`
- Update with: `python -m brain.skills.focus "status"`

## Communication

| Action | Command |
|--------|---------|
| See all active gods | `python -m brain.glimpse` |
| Peek at a god's work | `python -m brain.glimpse zeus` |
| Send message to god | `python -m brain.send zeus "message"` |

## Session

| Item | Value |
|------|-------|
| Session name | `iris` |
| Start command | `iris` |
| Config | `config/tmux.conf` |

## Lifecycle

| Term | Meaning |
|------|---------|
| Summon | Spawn a new god |
| Banish | Kill a god's pane |
| Bind | Assign task to god |
| Glimpse | Check god status |
| Laboring | God is working |
| Dormant | God is idle |
| Scattered | God crashed |
| Fulfilled | Task complete |
