# Iris Worker Management

Manage Iris worker rays in tmux. Usage: `/worker <action> [args]`

**Arguments provided:** $ARGUMENTS

## Actions

Based on the arguments, perform ONE of these actions:

### Spawn a new worker (default)
If arguments look like a task (possibly with a project name), spawn a new worker.

Fuzzy-match project names:
- "iron rainbow" / "ironrainbow" → `--project ironrainbow`
- "elevathor" → `--project elevathor`
- "color me crazy" / "colormecrazy" → `--project colormecrazy`
- "iris" → `--project iris`

```bash
./iris/new-worker.sh --project <project> "<task>"
```

Or without a project:
```bash
./iris/new-worker.sh "<task>"
```

Say "Cast <color> to <project or 'general task'>"

### `list`
List all workers:

```bash
./iris/list-workers.sh
```

Say what workers are active.

### `kill <name-or-uuid>`
Kill a worker by color name or UUID:

```bash
./iris/kill-worker.sh <name-or-uuid>
```

Say "Recalled <name>"

### `kill all`
Kill all workers:

```bash
./iris/kill-worker.sh --all
```

Say "Recalled all rays"

### `status` or `glimpse`
Check worker status from registry:

```bash
cat iris/sessions/registry.json | jq '.active'
```

Summarize what workers are doing and say it.

### `task <name> <task_description>`
Send a task to an existing worker:

```bash
./iris/send-to-worker.sh <name-or-uuid> "<task>"
```

Say "Illuminated <name> with new task"

## Examples

- `/worker iron rainbow check the shader bug` → spawns worker for ironrainbow
- `/worker list` → shows active rays
- `/worker kill jade` → recalls jade
- `/worker elevathor fix the login` → spawns worker for elevathor

## Notes

- Worker colors: Ruby, Amber, Sol, Jade, Azure, Indigo, Violet, Coral, Cyan, Magenta, Crimson, Gold
- Use `./say.sh` to speak confirmations
- Workers are identified by UUID (like jade-20251210-015558-1234) or color name
