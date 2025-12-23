#!/bin/bash
# Kill current pane with confirmation
# Reads from /tmp/iris-kill-pane (written by tmux keybinding)

# Read values from temp file
if [[ ! -f /tmp/iris-kill-pane ]]; then
    echo "Error: no pane info found"
    sleep 1
    exit 1
fi

mapfile -t lines < /tmp/iris-kill-pane
window_id="${lines[0]}"
pane_id="${lines[1]}"
pid="${lines[2]}"
panes="${lines[3]}"
windows="${lines[4]}"
pane_title="${lines[5]}"

# Show confirmation
echo ""
echo -e "  \033[1;33m⚠ Banish this pane?\033[0m"
echo ""
echo -e "  \033[36m$pane_title\033[0m"
echo ""
echo -e "  \033[90mPress \033[1;37mEnter\033[0;90m to confirm, any other key to cancel\033[0m"
echo ""

read -n 1 -s key

# Enter key sends empty string
[ -n "$key" ] && exit 0

# Kill the process
kill -9 "$pid" 2>/dev/null

# Kill pane or window
if [ "$panes" -eq 1 ] && [ "$windows" -eq 1 ]; then
    tmux kill-pane -t "$pane_id" 2>/dev/null
elif [ "$panes" -eq 1 ]; then
    tmux kill-window -t "$window_id" 2>/dev/null
else
    tmux kill-pane -t "$pane_id" 2>/dev/null
fi
