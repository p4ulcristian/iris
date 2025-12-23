#!/bin/bash
# Spawn picker with god selection and task input

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

# Get available gods with theme colors (excludes active gods, shuffled)
GODS_COLORED=$(python3 -c "
import random
import subprocess
import yaml

# Get used gods from tmux
result = subprocess.run(
    ['tmux', 'list-panes', '-t', 'iris', '-F', '#{pane_title}'],
    capture_output=True, text=True
)
used = set()
if result.returncode == 0:
    for line in result.stdout.strip().split('\n'):
        if ':' in line:
            used.add(line.split(':')[0].strip())

# Load settings and pantheon
with open('config/settings.yaml') as f:
    settings = yaml.safe_load(f)
with open('prompts/pantheon.yaml') as f:
    pantheon = yaml.safe_load(f)

current_theme = settings.get('colors', {}).get('current_theme', 'catppuccin')
theme = settings.get('colors', {}).get('themes', {}).get(current_theme, {})

# Helper to convert hex to ANSI 24-bit color
def hex_to_ansi_bg(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f'\033[48;2;{r};{g};{b}m'

def hex_to_ansi_fg(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f'\033[38;2;{r};{g};{b}m'

reset = '\033[0m'

# Build list of available gods from pantheon
gods = [name.capitalize() for name in pantheon.keys()]
available = [g for g in gods if g not in used]
random.shuffle(available)

for god in available:
    # Get god's color name from pantheon, then hex values from theme
    god_data = pantheon.get(god.lower(), {})
    color_name = god_data.get('color', 'gray')
    colors = theme.get(color_name, {'bg': '#1a1a1a', 'fg': '#ffffff'})
    bg = hex_to_ansi_bg(colors['bg'])
    fg = hex_to_ansi_fg(colors['fg'])
    # Full width, centered text (popup is ~50 chars, minus some padding)
    print(f'{bg}{fg}{god:^46}{reset}')
")

if [ -z "$GODS_COLORED" ]; then
    echo "All gods are busy!"
    sleep 1
    exit 0
fi

# Show god selection with mission input (no search, just text entry)
RESULT=$(echo "$GODS_COLORED" | \
    "$FZF" --height=100% \
        --ansi \
        --no-info \
        --pointer='>' \
        --prompt='Mission: ' \
        --layout=reverse \
        --disabled \
        --print-query)

# First line is the mission (query), second line is the god
TASK=$(echo "$RESULT" | head -n1)
# Strip ANSI codes and whitespace from god name
SELECTED_GOD=$(echo "$RESULT" | tail -n1 | sed 's/\x1b\[[0-9;]*m//g' | xargs)

if [ -z "$SELECTED_GOD" ]; then
    exit 0
fi

# Default task if empty
if [ -z "$TASK" ]; then
    TASK="Help Paul with whatever he needs."
fi

# Spawn the god with the task
iris spawn -q "$TASK" --god "$SELECTED_GOD"
