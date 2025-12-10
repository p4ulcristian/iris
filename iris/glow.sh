#!/bin/bash
# Open Ghostty terminal, optionally with glow for markdown viewing
# Usage: glow.sh [directory|file.md...]
#
# Examples:
#   glow.sh                     # Opens Ghostty in current dir
#   glow.sh ~/Work/ironrainbow  # Opens Ghostty in that directory
#   glow.sh README.md           # Opens glow viewing README.md
#   glow.sh docs/*.md           # Opens glow with multiple files

if [ $# -eq 0 ]; then
    # No args - open Ghostty in current directory
    ghostty &
elif [ $# -eq 1 ] && [ -d "$1" ]; then
    # Single directory - open Ghostty there
    ghostty --working-directory="$1" &
else
    # Files - check if they're markdown
    md_files=()
    for arg in "$@"; do
        if [[ "$arg" == *.md ]]; then
            md_files+=("$arg")
        fi
    done

    if [ ${#md_files[@]} -gt 0 ]; then
        # Markdown files - open with glow
        nohup ghostty -e glow -p "${md_files[@]}" >/dev/null 2>&1 &
    else
        # Not markdown - just open Ghostty in current dir
        ghostty &
    fi
fi

echo "opened"
