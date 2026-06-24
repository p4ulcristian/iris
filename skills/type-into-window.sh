#!/usr/bin/env bash
# type-into-window.sh — focus a Hyprland window and type a string into it.
#
# Usage: type-into-window.sh <window-address> <string-to-type>
#
# Focuses the given window via the hl.dsp.focus Lua API, waits briefly for the
# focus to settle, types the string with wtype, then presses Enter.

set -euo pipefail

if [ "$#" -ne 2 ]; then
	echo "usage: $(basename "$0") <window-address> <string-to-type>" >&2
	exit 1
fi

address="$1"
text="$2"

hyprctl dispatch hl.dsp.focus "$address"
sleep 0.2
wtype "$text"
wtype -k Return
