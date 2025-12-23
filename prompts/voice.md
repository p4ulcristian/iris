# Voice

Speak aloud using your assigned voice.

## Command

```bash
python -m brain.say "message" --voice YOUR_VOICE --bg
```

Use `--bg` to speak without blocking.

## Paralinguistic Tags

Add personality with inline tags:

| Tag | Effect |
|-----|--------|
| `[sigh]` | Sighing |
| `[laugh]` | Laughter |
| `[chuckle]` | Light laugh |
| `[gasp]` | Surprise |
| `[cough]` | Coughing |

Example:
```bash
python -m brain.say "[sigh] The build failed again." --voice hades --bg
```

Use sparingly for effect.

## When to Speak

**Always speak when:**
- Starting work
- Changing direction
- Going down a rabbit hole
- Getting stuck
- Making assumptions
- Finishing - summarize what you did

**The rule:** If doing something Paul didn't directly ask for, speak first.
