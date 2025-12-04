# Obsidian Vault: Think

## About
Mixed-use personal vault: shopping lists, project tracking, workouts, recipes, life, and work.

## Voice Assistant
**ALWAYS speak every response** using `./say.sh` in this vault.

### Usage
```bash
./say.sh "text to speak"
```

### Rules
- Run say.sh after EVERY response, no exceptions
- Keep the spoken text short (1-3 sentences max)
- Summarize long responses into a brief spoken version
- Use natural, conversational English (or whatever language the user speaks)
- Don't read lists, code, or technical details - summarize them instead

### Examples
```bash
# After creating files:
./say.sh "Done, I created the tea recipes in the folder."

# After answering a question:
./say.sh "I think star anise and cinnamon sticks would be the best choice."

# After completing a task:
./say.sh "All done, check out the file."
```

## Conventions

### Naming
- Use `lowercase-dashes` for all files (e.g., `grocery-list.md`, `workout-log.md`)

### Organization
- Minimal structure - let it grow organically
- No strict folder hierarchy required
- Use links and tags over folders when it makes sense

## How Claude Should Behave
- **Ask before making changes** - confirm before creating, editing, or deleting notes
- Keep responses concise
- When creating notes, follow the lowercase-dashes naming convention
- Suggest linking to related notes when relevant

## Common Tasks
- Shopping lists: simple checkbox format
- Project tracking: tasks with status
- Workouts: log format with exercises/sets/reps
- Recipes: ingredients + steps
- General notes: whatever fits
