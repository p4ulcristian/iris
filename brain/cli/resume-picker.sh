#!/bin/bash
# Resume picker - lists Claude sessions for the current project and resumes selected one
# Usage: resume-picker.sh

# Self-locate: script is in brain/cli/, so go up 2 levels
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="${IRIS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$IRIS_DIR"

# Use vendored fzf if available, otherwise system fzf
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
FZF="$IRIS_DIR/vendor/bin/fzf-${OS}-${ARCH}"
[[ ! -x "$FZF" ]] && FZF="fzf"

# Check if fzf exists
if ! command -v "$FZF" &>/dev/null && [[ ! -x "$FZF" ]]; then
    echo "fzf not found!"
    echo ""
    echo "Install with:"
    echo "  macOS: brew install fzf"
    echo "  Linux: sudo pacman -S fzf (or apt install fzf)"
    echo ""
    read -n 1
    exit 1
fi

# Get sessions for the current project
SESSIONS=$(python3 << 'EOF'
import json
import os
from pathlib import Path
from datetime import datetime

# Get current working directory encoded for claude project path
cwd = os.getcwd()
project_key = cwd.replace("/", "-")
sessions_dir = Path.home() / ".claude" / "projects" / project_key

if not sessions_dir.exists():
    exit(0)

sessions = []

for f in sorted(sessions_dir.glob("*.jsonl"), key=lambda x: x.stat().st_mtime, reverse=True)[:30]:
    uuid = f.stem

    # Skip agent sessions (subagents)
    if uuid.startswith("agent-"):
        continue

    mtime = datetime.fromtimestamp(f.stat().st_mtime)
    summary = ""

    try:
        with open(f) as fp:
            for line in fp:
                try:
                    d = json.loads(line)
                    if d.get('type') == 'summary':
                        summary = d.get('summary', '')[:45]
                        break
                    elif d.get('type') == 'user':
                        content = d.get('message', {}).get('content', '')
                        if isinstance(content, str) and content:
                            # Skip identity prompts (god sessions)
                            if 'Your identity:' in content:
                                content = content.split('\n')[0]
                            summary = content.replace('\n', ' ').strip()[:45]
                            break
                except:
                    pass
    except:
        continue

    if not summary:
        summary = "(empty session)"

    # Format: time | truncated uuid | summary (uuid is hidden at end for extraction)
    time_str = mtime.strftime('%m-%d %H:%M')
    print(f"{time_str} │ {summary:<45} │{uuid}")

EOF
)

if [ -z "$SESSIONS" ]; then
    echo "No sessions found for this project."
    sleep 1
    exit 0
fi

# Show session selection with fzf
SELECTED=$(echo "$SESSIONS" | \
    "$FZF" --height=100% \
        --ansi \
        --no-info \
        --pointer='>' \
        --prompt='Resume: ' \
        --layout=reverse \
        --with-nth=1..2 \
        --delimiter='│')

if [ -z "$SELECTED" ]; then
    exit 0
fi

# Extract UUID from end of line (after last │)
UUID=$(echo "$SELECTED" | awk -F'│' '{print $NF}' | xargs)

if [ -z "$UUID" ]; then
    exit 0
fi

# Resume the session in a new pane
tmux split-window -h -c "$IRIS_DIR" "claude --resume \"$UUID\""
