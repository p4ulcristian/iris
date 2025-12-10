# Iris: Worker Spawn Optimization

**Worker:** Mellow
**Date:** 2025-12-09
**Status:** completed

## Summary
Investigated slow worker spawning and implemented non-blocking spawn to let Iris keep talking while workers start up.

## Key Findings

### The Actual Bottleneck
- **NOT tmux send-keys**: Tested timing - `send-keys` for 400 chars takes only ~4ms
- **NOT set-buffer vs send-keys**: Buffer approach is similar speed (~7ms)
- **The real issue**: The blocking wait loop (up to 30 seconds) that waits for Claude to be ready before sending the task

### Why It Felt Slow
1. Script waited synchronously for Claude to load (polling every 1 second, up to 30 times)
2. During this wait, Iris couldn't respond - lost the "continuous assistant" feeling
3. The visual appearance of slow character-by-character input is likely Claude CLI's rendering, not tmux

## Changes Made

### new-worker.sh
- Added `--sync` flag (optional) for synchronous spawning when needed
- **Default behavior is now async** - spawns background process to wait and send task
- Shows "Starting..." in title until Claude is ready
- Uses `set-buffer + paste-buffer` instead of `send-keys` (slightly faster for long text)
- Reduced poll interval from 1s to 0.5s
- Better argument parsing with `while` loop

### send-to-worker.sh
- Now uses `set-buffer + paste-buffer` instead of `send-keys`
- Unique buffer names per call to avoid conflicts

## Next Steps
- Monitor in practice to confirm the async spawning works smoothly
- Consider adding a "worker ready" notification/sound if desired

## Context for Future Workers

The key insight: **the blocking wait is the problem, not the text input speed**. Claude CLI needs time to start up (~3-10 seconds depending on system load), and the old script blocked during that entire time.

The new approach:
1. Spawn the tmux pane immediately (fast)
2. Set up colors and title (fast)
3. Return immediately with pane ID
4. Background process handles the wait-and-send

This means Iris gets the pane ID right away and can keep talking, while a detached background process waits for Claude and sends the task when ready.
