# Skills

Utility commands available to gods. All commands require `PYTHONPATH="$IRIS_HOME"` prefix.

| Skill | Usage | Description |
|-------|-------|-------------|
| `title` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.title "title"` | Set your title |
| `ready` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.ready <state>` | Update visual state |
| `peek` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.peek <god> [lines]` | View another god's output |
| `browse` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.browse <url>` | Open URL in browser |
| `code` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.code open <file>` | Open in code viewer |
| `md` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.md <file>` | Open markdown in viewer |
| `spawn` | `PYTHONPATH="$IRIS_HOME" python -m brain.skills.spawn --god <name> "task"` | Summon another god |
