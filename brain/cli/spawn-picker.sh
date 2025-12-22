#!/bin/bash
# Spawn picker with god selection and task input

# Self-locate: script is in brain/cli/, so go up 2 levels
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRIS_DIR="${IRIS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
cd "$IRIS_DIR"

# Get available gods with theme colors (excludes active gods, shuffled)
GODS_COLORED=$(python3 -c "
import json
import random
import subprocess

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

# Load theme colors
with open('config/settings.json') as f:
    settings = json.load(f)
current_theme = settings.get('colors', {}).get('current_theme', 'catppuccin')
theme = settings.get('colors', {}).get('themes', {}).get(current_theme, {})
shades = {s['name']: s for s in theme.get('shades', [])}

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

# Build list of available gods with colors
gods = ['Zeus', 'Apollo', 'Artemis', 'Athena', 'Hermes', 'Hades', 'Poseidon',
        'Hera', 'Ares', 'Hephaestus', 'Aphrodite', 'Dionysus', 'Demeter']
available = [g for g in gods if g not in used]
random.shuffle(available)

for god in available:
    colors = shades.get(god, {'bg': '#1a1a1a', 'fg': '#ffffff'})
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
    fzf --height=100% \
        --ansi \
        --no-info \
        --pointer='>' \
        --prompt='Mission: ' \
        --layout=reverse \
        --disabled \
        --print-query)

# First line is the mission (query), second line is the god
TASK=$(echo "$RESULT" | head -n1)
SELECTED_GOD=$(echo "$RESULT" | tail -n1 | xargs)

if [ -z "$SELECTED_GOD" ]; then
    exit 0
fi

# Default task if empty
if [ -z "$TASK" ]; then
    TASK="Help Paul with whatever he needs."
fi

# Spawn the god with the task
iris spawn -q "$TASK" --god "$SELECTED_GOD"
