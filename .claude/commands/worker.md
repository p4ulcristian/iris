# Iris Worker Management

Manage Iris worker panes in tmux. Usage: `/worker <action> [args]`

**Arguments provided:** $ARGUMENTS

## Actions

Based on the arguments, perform ONE of these actions:

### `spawn <task>` or `new <task>` or just `<task>`
Spawn a new worker with a task. Use the script:

```bash
./iris/new-worker.sh "<task>"
```

With a project:
```bash
./iris/new-worker.sh --project ironrainbow "<task>"
```

Projects: ironrainbow, elevathor, colormecrazy, iris

The script handles everything: creates pane, sets color, waits for Claude, sends task, refocuses master, fixes layout.

Say "Spawned worker <pane_id> (<color>)"

### `task <pane_id> <task_description>`
Send a task to an existing worker:

```bash
./iris/send-to-worker.sh <pane_id> "<task>"
```

Say "Sent task to <pane_id>"

### `status` or `status <pane_id>`
Check worker status by reading the tmux pane:

```bash
tmux capture-pane -t <pane_id> -p | tail -50
```

Summarize what the worker is doing and say it.

### `kill <pane_id>`
Kill a worker:

```bash
tmux kill-pane -t <pane_id>
```

Say "Killed worker <pane_id>"

### `kill all`
Kill all workers (except master %0):

```bash
for pane in $(tmux list-panes -t iris -F '#{pane_id}' | grep -v '^%0$'); do
    tmux kill-pane -t "$pane"
done
```

Say "Killed all workers"

### `list`
List all workers:

```bash
tmux list-panes -t iris -F "#{pane_id} | #{pane_title}"
```

Say the list.

## Scripts

| Script | Purpose |
|--------|---------|
| `./iris/new-worker.sh` | Spawn worker with task (all-in-one) |
| `./iris/send-to-worker.sh` | Send task to existing worker |

## Notes

- Workers are identified by pane ID (like %15, %16)
- Colors rotate: red, teal, yellow, mint, plum, sky
- Master is always %0
- Use `./say.sh` to speak confirmations
