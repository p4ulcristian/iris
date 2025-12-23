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
# Output format: time | summary | session_uuid | god_uuid | god_name
SESSIONS=$(python3 << 'EOF'
import json
import os
import re
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
    god_uuid = ""
    god_name = ""

    try:
        with open(f) as fp:
            for line in fp:
                try:
                    d = json.loads(line)
                    if d.get('type') == 'summary':
                        summary = d.get('summary', '')[:40]
                        # Don't break yet, we still want to find god info
                    elif d.get('type') == 'user':
                        content = d.get('message', {}).get('content', '')
                        if isinstance(content, str) and content:
                            # Check for god identity pattern
                            identity_match = re.search(r'Your identity: shadows/([^/]+)/identity\.md', content)
                            if identity_match:
                                god_uuid = identity_match.group(1)
                                # Extract god name from UUID (format: name-YYYYMMDD-HHMMSS-hex)
                                name_match = re.match(r'^([a-z]+)-\d{8}-\d{6}-[a-f0-9]+$', god_uuid)
                                if name_match:
                                    god_name = name_match.group(1).capitalize()

                            # Get summary from first user message if we don't have one
                            if not summary:
                                # Skip identity prompts for summary
                                if 'Your identity:' in content:
                                    # Get the actual task (first line before identity)
                                    first_line = content.split('\n')[0].strip()
                                    if first_line and 'Your identity:' not in first_line:
                                        summary = first_line[:40]
                                else:
                                    summary = content.replace('\n', ' ').strip()[:40]
                        break  # Only check first user message
                except:
                    pass
    except:
        continue

    if not summary:
        summary = "(empty session)"

    # Format: time | summary (god indicator) | session_uuid | god_uuid | god_name
    time_str = mtime.strftime('%m-%d %H:%M')
    god_indicator = f" [{god_name}]" if god_name else ""
    # Truncate summary to make room for god indicator
    max_summary = 40 - len(god_indicator)
    display_summary = summary[:max_summary] + god_indicator
    print(f"{time_str} │ {display_summary:<40} │{uuid}│{god_uuid}│{god_name}")

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

# Extract fields from selection (format: time│summary│session_uuid│god_uuid│god_name)
SESSION_UUID=$(echo "$SELECTED" | awk -F'│' '{print $3}' | xargs)
GOD_UUID=$(echo "$SELECTED" | awk -F'│' '{print $4}' | xargs)
GOD_NAME=$(echo "$SELECTED" | awk -F'│' '{print $5}' | xargs)

if [ -z "$SESSION_UUID" ]; then
    exit 0
fi

# Resume using Python (handles god setup, colors, permissions)
python3 -c "
from brain.cli import gods
result = gods.resume('$SESSION_UUID', god_uuid='$GOD_UUID' if '$GOD_UUID' else None, god_name='$GOD_NAME' if '$GOD_NAME' else None)
if result:
    name = result.get('name', 'Session')
    print(f'Resumed {name}')
"
