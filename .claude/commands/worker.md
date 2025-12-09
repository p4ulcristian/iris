# Iris Worker Management

Manage Iris worker panes in tmux. Usage: `/worker <action> [args]`

**Arguments provided:** $ARGUMENTS

## Actions

Based on the arguments, perform ONE of these actions:

### `spawn <project>` or `spawn` or `new <project>`
Spawn a new worker pane for a project.

1. Determine the project directory:
   - "ironrainbow" or "iron rainbow": `/home/paul/Work/ironrainbow`
   - "elevathor": `/home/paul/Work/elevathor`
   - "colormecrazy" or "color me crazy": `/home/paul/Work/colormecrazy`
   - "iris": `/home/paul/Work/iris`
   - If no project specified, don't add a project directory

2. Create the worker pane and capture its **pane ID**. Always include --dangerously-skip-permissions:
   ```bash
   tmux split-window -t iris -h -d -P -F '#{pane_id}' "cd ~/Think && claude --dangerously-skip-permissions --add-dir <project_dir>"
   ```
   This returns the pane ID (like `%13`). Save this ID.

3. Set pane background color for visual distinction:
   ```bash
   tmux select-pane -t <pane_id> -P "bg=#2a1a1a"
   ```
   Use different colors: #2a1a1a (red), #1a2a2a (teal), #2a2a1a (yellow), #1a2a22 (mint)

4. Apply layout: `tmux select-layout -t iris main-vertical && tmux resize-pane -t iris:0.0 -x 60%`

5. **Refocus master pane** (important - new panes steal focus):
   ```bash
   tmux select-pane -t %0
   ```

6. Wait 3 seconds for Claude to start, then send a brief init:
   ```bash
   tmux send-keys -t <pane_id> "You are a worker. Never use ./say.sh - only master speaks."
   tmux send-keys -t <pane_id> Enter
   ```

7. Say "Spawned worker <pane_id> for <project>"

### `task <pane_id> <task_description>` or `<pane_id> <task_description>`
Send a task to a worker by pane ID (e.g., `%10`, `%11`).

1. Send the task:
   ```bash
   tmux send-keys -t <pane_id> "<task_description>"
   tmux send-keys -t <pane_id> Enter
   ```
2. Say "Sent task to worker <pane_id>"

### `status` or `status <pane_id>` or `check <pane_id>`
Check worker status by reading the tmux pane directly.

1. If pane ID specified, capture that pane:
   ```bash
   tmux capture-pane -t <pane_id> -p | tail -50
   ```
2. If no pane specified, list all panes and capture recent output from each worker
3. Summarize what each worker is doing
4. Say the summary

### `kill <pane_id>`
Kill a worker pane by ID.

1. Kill the pane: `tmux kill-pane -t <pane_id>`
2. Say "Killed worker <pane_id>"

### `list`
List all active worker panes with their stable IDs.

1. Run: `tmux list-panes -t iris -F "#{pane_id} | #{pane_title}"`
2. The first pane (%0) is master, all others are workers
3. Say the list with IDs and what each is working on (from title)

## Key Points

- **Use pane IDs** (like `%10`, `%11`) - these are stable and don't change with layout
- Pane titles are auto-set by Claude based on current task - useful for identification
- **No JSON files** - check status by reading tmux panes directly
- Always send Enter as a separate `send-keys` command after text
- Use `./say.sh` to speak confirmations

## Example Commands

```bash
# List workers
tmux list-panes -t iris -F "#{pane_id} | #{pane_title}"

# Send to specific worker
tmux send-keys -t %11 "Do something"
tmux send-keys -t %11 Enter

# Check worker output
tmux capture-pane -t %11 -p | tail -30

# Kill worker
tmux kill-pane -t %11
```
