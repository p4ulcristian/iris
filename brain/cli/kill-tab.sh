#!/bin/bash
# Kill current tab (window) with confirmation
# Reads from /tmp/iris-kill-tab (written by tmux keybinding)

# Read values from temp file
if [[ ! -f /tmp/iris-kill-tab ]]; then
    echo "Error: no tab info found"
    sleep 1
    exit 1
fi

mapfile -t lines < /tmp/iris-kill-tab
window_id="${lines[0]}"
window_name="${lines[1]}"

# Get pane count in this window
pane_count=$(tmux list-panes -t "$window_id" 2>/dev/null | wc -l)

# Show confirmation
echo ""
echo -e "  \033[1;33m⚠ Close this tab?\033[0m"
echo ""
echo -e "  \033[36m$window_name\033[0m"
if [ "$pane_count" -gt 1 ]; then
    echo -e "  \033[90m($pane_count panes will be closed)\033[0m"
fi
echo ""
echo -e "  \033[90mPress \033[1;37mEnter\033[0;90m to confirm, any other key to cancel\033[0m"
echo ""

read -n 1 -s key

# Enter key sends empty string
[ -n "$key" ] && exit 0

# Kill all pane processes in this window
for pid in $(tmux list-panes -t "$window_id" -F '#{pane_pid}' 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null
done

# Kill the window
tmux kill-window -t "$window_id" 2>/dev/null
