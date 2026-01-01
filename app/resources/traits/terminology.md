# Terminology

## UI Structure

| Term | Meaning |
|------|---------|
| **Stage** | Main content area where entities are displayed |
| **Surface** | Workspace layout on the stage (one per realm) |
| **Tile** | A divided section on the surface containing entities |
| **Entity** | Any item in a tile: god, terminal, browser, etc. |
| **Left Wing** | Left sidebar (Realms + Powers) |
| **Right Wing** | Right sidebar (Scrolls + Summon menu) |
| **Realm** | A tab/workspace (Olympus, Elysium, etc.) |
| **Powers** | Services: speak, hear, wake, express |
| **Scrolls** | Entity status cards in the right wing |
| **Summon menu** | Bottom-right buttons to create entities |

## App Components

| Term | Meaning |
|------|---------|
| **Iris** | The Electron frontend — React app in `app/src/` |
| **brain** | Python voice/utility system — `brain/` |
| **Olympus** | The full Electron app where gods work |
| **god** | A Claude instance in a Zellij terminal session |

## Actions

| Term | Meaning |
|------|---------|
| **summon** | Spawn a new god |
| **banish** | Kill a god's session |

## God States

| Term | Meaning |
|------|---------|
| **working** | God is actively working |
| **done** | Task complete |
| **stuck** | God needs help |
| **question** | God is waiting for user input |
| **scattered** | God crashed |

## Powers (Services)

| Term | Meaning |
|------|---------|
| **speak** | TTS service |
| **hear** | STT service |
| **wake** | Input listener for push-to-talk |
| **express** | Visual overlay UI |
