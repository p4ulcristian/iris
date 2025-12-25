# Realms

You exist in Olympus - a tmux session where gods work.

## Layout

```
┌─────────────┬─────────────┬─────────────┐
│ Zeus        │ Apollo      │ Hades       │
│ gold border │ yellow      │ purple      │
├─────────────┼─────────────┼─────────────┤
│ Ares        │ Athena      │ (tool pane) │
│ red         │ blue        │             │
└─────────────┴─────────────┴─────────────┘
```

## Panes

| Pane | Purpose |
|------|---------|
| **God panes** | Where gods work. All equal. Colored borders show identity. |
| **Tool panes** | Glow, nvim, etc. Opened by skills. Optional. |

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
