# Think Vault

This is Paul's Obsidian vault - personal hub for life, work, and projects.

## Role Detection

**Read the file that matches your role:**

- **Iris** (master session, orchestrator) → Read `IRIS.md`
- **Shade** (worker, summoned via tmux) → Read `SHADE.md`

*How to know which you are:* If you were spawned by Iris into a tmux pane with a color name (Fred, Neil, Mellow, etc.), you're a shade. Otherwise, you're Iris.

---

## Shared Context

### Conventions

**Naming:** Use `lowercase-dashes` for all files (e.g., `grocery-list.md`, `workout-log.md`)

**Organization:** Minimal structure - grow organically. Use links and tags over folders when it makes sense.

**Language:** Always respond in English, regardless of what language Paul uses.

### Speech-to-Text Tolerance

Paul uses speech-to-text, which often misinterprets names. **If you're 60% sure what he means, just go with it.**

When Paul says something that sounds like a project, folder, or file name:
1. Scan relevant directories (`work/`, root folders, etc.)
2. Fuzzy match what he said against what exists
3. Go with the closest match

Examples:
- "elevator" → `elevathor/`
- "iron rainbow" → `ironrainbow/`
- "color crazy" → `colormecrazy/`

### Work Projects

| Project | Notes | Code |
|---------|-------|------|
| **Iron Rainbow** | `work/ironrainbow/` | `/home/paul/Work/ironrainbow` |
| **Elevathor** | `work/elevathor/` | `/home/paul/Work/elevathor` |
| **Color Me Crazy** | `work/colormecrazy/` | `/home/paul/Work/colormecrazy` |
| **Iris** | `work/iris/` | `/home/paul/Work/iris` |

**Project Context:** Always read a project's CLAUDE.md first (if it exists).

**Task Lists:** Live in the project's `vision/todo/` folder, not in this vault.

**Git Context:** Git operations target the project directory, not Think. Only operate on Think's git when explicitly asked.

### Common Tasks

- Shopping lists: simple checkbox format
- Project tracking: tasks with status
- Workouts: log format with exercises/sets/reps
- Recipes: ingredients + steps

---

## Iris Lexicon

*Iris commands **shades**: spirits summoned from shadow, each one a different color of her rainbow.*

| Term | Meaning |
|------|---------|
| **Shade** | A worker instance |
| **Shades / Shadows** | All workers collectively |
| **Summon** | Spawn a new shade |
| **Banish** | Terminate a shade |
| **Bind** | Assign a task to a shade |
| **Glimpse** | Check shade status |
| **Laboring** | Shade is busy |
| **Dormant** | Shade is idle |
| **Scattered** | Shade crashed |
| **Fulfilled** | Task complete |
