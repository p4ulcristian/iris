# Claude Code: Footer/Status Bar Customization Research

**Shade:** Amber
**Date:** 2025-12-10
**Status:** completed

## Summary

Researched whether Claude Code CLI has options to hide or customize the footer/status bar that displays "bypass permission zone", "plan mode", "shift+tab to cycle", etc. The footer UI hints **cannot be hidden**, but the status line content can be customized.

## Key Findings

### The Footer Cannot Be Hidden

- **No CLI flags** exist to hide the footer (`--no-footer`, `--hide-hints`, etc.)
- **No settings option** to disable keyboard hints or permission zone indicators
- The footer bar is a core UI element of Claude Code's interactive mode
- Hints like "shift+tab to cycle" and "bypass permissions mode" are static

### What CAN Be Customized: The Status Line

The **status line** (the informational display area) can be customized via:

#### Option 1: Using `/statusline` Command
Run `/statusline` in interactive mode to configure.

#### Option 2: Settings File Configuration
Add to `.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  }
}
```

Your custom script receives JSON input with session context and outputs a single line of text. The status line updates every 300ms when conversation changes.

### Third-Party Status Line Tools

Community tools for enhanced status lines:

| Tool | Description |
|------|-------------|
| **ccstatusline** | Highly customizable formatter with themes and git widgets |
| **claude_monitor_statusline** | Displays folder, git status, model, and usage metrics |
| **claude-code-usage-bar** | Lightweight token usage display |

### Available CLI Flags (UI-Related)

- `--verbose` - More detailed output
- `--debug` - Debug logging

No flags for footer control.

## What Remains Static (Cannot Be Changed)

- Keyboard hints (e.g., "shift+tab to cycle")
- Permission zone indicators ("bypass permissions mode")
- Plan mode indicator
- The footer bar's existence

## Recommendations

If minimizing visual clutter is the goal:

1. **Custom status line** - Keep it minimal, show only essential info
2. **Accept hints are permanent** - Part of Claude Code's UI design
3. **Consider terminal themes** - Some terminals allow styling that might de-emphasize certain UI elements

## Sources

- [Status line configuration - Claude Code Docs](https://code.claude.com/docs/en/statusline.md)
- [Interactive mode - Claude Code Docs](https://code.claude.com/docs/en/interactive-mode.md)
- [Settings - Claude Code Docs](https://code.claude.com/docs/en/settings.md)
- [CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference.md)
- [GitHub - sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline)
- [GitHub - gabriel-dehan/claude_monitor_statusline](https://github.com/gabriel-dehan/claude_monitor_statusline)

## Context for Future Shades

The Claude Code footer with keyboard hints is intentional UX design - they want users to always see available shortcuts and current mode. The customization focus is on the *status line content* (model info, git branch, token usage), not the hint system. If someone asks about hiding UI elements, the answer is: status line yes, hints no.
