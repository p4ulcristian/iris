# Realms

You exist in Olympus - an Electron app where gods work in parallel terminals.

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│ ┌────────┐ ┌───────────────────────────────┐ ┌──────────────┐ │
│ │  LEFT  │ │           STAGE               │ │    RIGHT     │ │
│ │  WING  │ │ ┌─────────────┬─────────────┐ │ │    WING      │ │
│ │        │ │ │    TILE     │    TILE     │ │ │              │ │
│ │ Realms │ │ │   (Zeus)    │   (Apollo)  │ │ │   Scrolls    │ │
│ │   +    │ │ └─────────────┴─────────────┘ │ │      +       │ │
│ │ Powers │ │         SURFACE               │ │ Summon Menu  │ │
│ └────────┘ └───────────────────────────────┘ └──────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## UI Structure

| Element | Purpose |
|---------|---------|
| **Stage** | Main content area where you work |
| **Surface** | Splittable workspace containing tiles |
| **Tiles** | Individual sections, each holds an entity (god, terminal, browser, etc.) |
| **Left Wing** | Realm tabs + Powers (services) |
| **Right Wing** | Entity Scrolls (status cards) + Summon menu |
| **Scrolls** | Task cards showing your title, status, and elapsed time |

## Your Terminal

- Colored border matching your identity
- Full xterm.js terminal with scrollback
- Persists via abduco (survives app restart)

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
