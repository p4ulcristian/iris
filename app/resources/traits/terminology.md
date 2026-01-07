# Terminology

## UI Structure

| Term | Meaning |
|------|---------|
| **Stage** | Main content area where entities are displayed |
| **Surface** | Workspace layout on the stage (one per tab) |
| **Tile** | A divided section on the surface containing entities |
| **Entity** | Any item in a tile: god, terminal, browser, etc. |
| **Left Sidebar** | Left sidebar with tab buttons and services |
| **Right Sidebar** | Right sidebar with entity cards and spawn menu |
| **Tab** | A workspace (named Olympus, Elysium, etc.) |
| **Services** | speak, hear, wake, express |
| **Entity Cards** | Status cards in the right sidebar |
| **Spawn menu** | Bottom-right buttons to create entities |

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

## Services

| Term | Meaning |
|------|---------|
| **speak** | TTS service |
| **hear** | STT service |
| **wake** | Input listener for push-to-talk |
| **express** | Visual overlay UI |

## Skills

Python commands for Iris interaction. Located in `brain/skills/`.

| Term | Meaning |
|------|---------|
| **title** | Set god's title/goal in UI |
| **ready** | Update visual state (working/done/stuck/question) |
| **peek** | View another god's terminal output |
| **browse** | Open URL in Iris browser |
| **code** | Open file in code viewer with highlights |
| **md** | Open markdown in rendered viewer |
| **spawn** | Summon another god with a task |
| **run** | Run command in new visible terminal |
| **push** | Git commit and push staged changes |

## Tools

External services connected via MCP (Model Context Protocol).

| Term | Meaning |
|------|---------|
| **Playwright** | Browser automation - navigate, click, screenshot |
| **Linear** | Project management - issues, projects, documents |
| **Railway** | Deployment - deploy, logs, environments |
