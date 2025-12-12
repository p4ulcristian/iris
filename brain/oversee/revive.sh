#!/bin/bash
# Revive a dead shade from the shadows folder
# Usage: revive.sh <shade-name-or-partial>
#
# Finds the most recent matching shadow and spawns a new shade to continue its work

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IRIS_DIR="$HOME/Iris"
SHADOWS_DIR="$IRIS_DIR/shadows"

if [ -z "$1" ]; then
    echo "Usage: revive.sh <shade-name-or-partial>"
    echo "Example: revive.sh magenta"
    exit 1
fi

SEARCH="$1"

# Find matching shadow folders (by color name or full UUID)
# Sort by name descending to get most recent first (timestamps in name)
MATCHES=$(ls -1d "$SHADOWS_DIR"/*"$SEARCH"* 2>/dev/null | sort -r)

if [ -z "$MATCHES" ]; then
    echo "No shadows found matching: $SEARCH"
    exit 1
fi

# Pick the most recent match
SHADOW_DIR=$(echo "$MATCHES" | head -1)
SHADOW_UUID=$(basename "$SHADOW_DIR")

# Extract color name from UUID (first part before the date)
COLOR_NAME=$(echo "$SHADOW_UUID" | cut -d'-' -f1)
# Capitalize first letter
COLOR_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${COLOR_NAME:0:1})${COLOR_NAME:1}"

# Read original task
if [ ! -f "$SHADOW_DIR/task.txt" ]; then
    echo "No task.txt found in $SHADOW_DIR"
    exit 1
fi
ORIGINAL_TASK=$(cat "$SHADOW_DIR/task.txt")

# Read project if exists
PROJECT=""
PROJECT_FLAG=""
if [ -f "$SHADOW_DIR/project.txt" ]; then
    PROJECT=$(cat "$SHADOW_DIR/project.txt")
    PROJECT_FLAG="--project $PROJECT"
fi

# Extract last ~100 lines of clean output (strip ANSI codes)
CONTEXT=""
if [ -f "$SHADOW_DIR/output.log" ]; then
    # Strip ANSI codes and get last 100 lines of meaningful content
    CONTEXT=$(cat "$SHADOW_DIR/output.log" | \
        sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | \
        sed 's/\x1b\[[0-9;]*m//g' | \
        sed 's/\x1b\[?[0-9]*[a-zA-Z]//g' | \
        tr -cd '[:print:]\n\t' | \
        grep -v '^[[:space:]]*$' | \
        tail -100)
fi

# Build the revival prompt
REVIVAL_PROMPT="CONTINUING PREVIOUS WORK from $COLOR_NAME ($SHADOW_UUID)

=== ORIGINAL TASK ===
$ORIGINAL_TASK

=== CONTEXT FROM PREVIOUS SESSION ===
The previous shade was working on this task. Here is the last part of their session output:

$CONTEXT

=== YOUR MISSION ===
Continue where they left off. Review what was done and complete any remaining work."

# Spawn the new shade
echo "Reviving $COLOR_NAME from $SHADOW_UUID..."
$SCRIPT_DIR/spawn.sh $PROJECT_FLAG "$REVIVAL_PROMPT"
