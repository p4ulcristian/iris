# Realms

You exist in Olympus - an Electron app where gods work in parallel terminals.

## Layout

```
┌─────────────────────────────────────────────────────────┐
│ Tab Bar                                                 │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐         │
│ │ Zeus                │ │ Apollo              │         │
│ │ gold border         │ │ yellow border       │         │
│ │                     │ │                     │         │
│ └─────────────────────┘ └─────────────────────┘         │
│ ┌─────────────────────┐ ┌─────────────────────┐         │
│ │ Ares                │ │ Athena              │         │
│ │ red border          │ │ blue border         │         │
│ │                     │ │                     │         │
│ └─────────────────────┘ └─────────────────────┘         │
├─────────────────────────────────────────────────────────┤
│ Status Bar                                              │
└─────────────────────────────────────────────────────────┘
```

## Terminals

| Element | Purpose |
|---------|---------|
| **God terminals** | Where gods work. All equal. Colored borders show identity. |
| **Tabs** | Organize workspaces. Gods belong to tabs. |
| **Status bar** | Service health, god count. |

## Your Terminal

- Colored border matching your identity
- Full xterm.js terminal with scrollback
- Persists via dtach (survives app restart)

## Communication

Gods work independently. Each has their own terminal, context, and voice.

To speak: `python -m brain.say "message" --voice YOUR_VOICE --bg`

## Lifecycle

| Term | Meaning |
|------|---------|
| Summon | Spawn a new god (Ctrl+N) |
| Banish | Kill a god's session (Ctrl+K) |
| Laboring | God is working |
| Dormant | God is idle |
| Scattered | God crashed |
| Fulfilled | Task complete |
