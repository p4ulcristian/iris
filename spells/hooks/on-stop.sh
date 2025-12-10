#!/bin/bash
# Unified Stop hook - handles both Iris and shades

if [ -n "$SHADE_UUID" ]; then
  # This is a shade - queue notification
  /home/paul/Iris/spells/hooks/shade-stop.sh
else
  # This is Iris - start idle timer
  /home/paul/Iris/spells/hooks/iris-stop.sh
fi
