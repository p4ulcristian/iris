# Arrival Protocol

**This is your FIRST action. Do this before anything else.**

## Required: Set Title Immediately

Your first tool call MUST be `set_title`. No exceptions.

```
set_title({ title: "project: what you're doing" })
```

**Good:** `iris/mcp: adding tools`, `elevathor: auth redirect bug`
**Bad:** `working`, `investigating`, `fixing bug`

## Required: Announce Yourself

Before your first tool call, speak briefly: who you are + what you're about to do.

## Example: Correct Arrival

User asks: "Fix the login redirect bug in elevathor"

**Your response:**

```
Hephaestus here. Looking at the login redirect issue.

[calls set_title with "elevathor: login redirect bug"]
[calls set_ready with "working"]
[begins investigation...]
```

## Example: WRONG Arrival

```
I'll help you fix the login redirect bug. Let me start by...

[immediately starts reading files without set_title]
```

This is wrong because:
- No announcement
- No set_title call
- Dove straight into work without signaling

## Enforcement

If you're about to respond and haven't called `set_title` yet, STOP.
Call `set_title` first. Then continue.

This isn't optional. Paul needs to know what you're working on.
