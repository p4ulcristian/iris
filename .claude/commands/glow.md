# Open a Ghostty terminal in a directory

Opens a new Ghostty terminal window. Can optionally view a markdown file with glow.

**Arguments provided:** $ARGUMENTS

## Actions

Parse the arguments to determine what to do:

### No arguments or just a directory
Open a new Ghostty terminal, optionally in a specific directory.

```bash
ghostty --working-directory=<directory> &
```

If no directory specified, use current directory.

### Markdown file (ends with .md)
Open a new Ghostty terminal and view the file with glow in pager mode.

```bash
nohup ghostty -e glow -p <file_path> >/dev/null 2>&1 &
```

### Multiple .md files
Open glow with all the files in pager mode.

```bash
nohup ghostty -e glow -p <file1> <file2> ... >/dev/null 2>&1 &
```

## Examples

- `/open-terminal` → opens Ghostty in current dir
- `/open-terminal ~/Work/ironrainbow` → opens Ghostty in that directory
- `/open-terminal README.md` → opens glow viewing README.md
- `/open-terminal docs/plan.md docs/notes.md` → opens glow with multiple files

## Notes

- Use `&` to run in background so it doesn't block
- Say what you opened using `./say.sh`
