#!/bin/bash
# Unified PreToolUse hook - handles both Iris and shades

# If SHADE_UUID is set, this is a shade - no action needed on tool use
[ -n "$SHADE_UUID" ] && exit 0

# This is Iris - mark as busy
/home/paul/Iris/spells/hooks/iris-busy.sh
