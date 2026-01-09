# Git Entity Plan

## Current State

The git entity has a basic working tree view with:
- Project selector dropdown
- File list showing staged/unstaged/untracked files
- Basic diff viewer for selected files
- Stage/unstage/discard actions per file
- "Compare" mode tab (not implemented)

### Backend (`server/git.js`)
- `getStatus()` - porcelain status parsing
- `getDiff()` / `getStagedDiff()` - file diffs
- `stageFiles()` / `unstageFiles()` / `discardChanges()`
- `getCommits()` - commit history with hash, subject, author, date, parents
- `getBranches()` / `getCurrentBranch()`

### Handlers (`server/handlers/git.js`)
- `git:status`, `git:diff`, `git:stage`, `git:unstage`, `git:discard`
- `git:commits`, `git:branches`
- `git:projects:add`, `git:projects:remove`

---

## Design Philosophy

Keep it simple. The git entity should show what matters:
1. **What changed** (working tree)
2. **What happened** (history)
3. **Where you are** (branch)

Don't recreate GitKraken. Gods use the terminal for complex git operations. This is a visual companion.

---

## Phase 1: Polish Working Tree View

### File List Improvements
- [ ] Group files by directory (collapsible tree, not flat list)
- [ ] Show status icon (M, A, D, R) in addition to color
- [ ] Bulk actions: "Stage All", "Unstage All", "Discard All"
- [ ] Keyboard nav: arrow keys, space to stage/unstage, d to discard

### Diff Viewer Improvements
- [ ] Side-by-side diff option (not just unified)
- [ ] Line numbers in diff
- [ ] Syntax highlighting in diff (use Monaco?)
- [ ] Click line to stage/unstage individual hunks (stretch goal)

### Header
- [ ] Show ahead/behind count vs remote
- [ ] Quick commit button (opens commit modal)
- [ ] Pull/push buttons with status

---

## Phase 2: Commit History (Compare Tab)

The "Compare" tab should show commit history, not just file comparison.

### Commit Graph
- [ ] Vertical commit list with branch visualization
- [ ] Show commit hash (short), subject, author, relative time
- [ ] Branch/tag labels on commits
- [ ] Color-code branches (like git log --graph)

### Commit Detail Panel
When a commit is selected:
- [ ] Full commit message
- [ ] Changed files list (click to see diff)
- [ ] Diff viewer showing changes in that commit

### Branch Switcher
- [ ] List local branches
- [ ] List remote branches (collapsed by default)
- [ ] Current branch highlighted
- [ ] Click to checkout (with confirmation for dirty tree)

---

## Phase 3: Quick Actions

### Commit Modal
- [ ] Commit message input (summary + description)
- [ ] Show staged files list
- [ ] "Commit" and "Commit & Push" buttons
- [ ] Amend checkbox (shows last commit message)

### Branch Operations
- [ ] Create branch (from current HEAD or selected commit)
- [ ] Delete branch (with force option for unmerged)
- [ ] Rename branch

### Remote Operations
- [ ] Fetch (all remotes)
- [ ] Pull (with rebase option)
- [ ] Push (with force option, warning on main/master)

---

## Phase 4: Stash Support

- [ ] List stashes in sidebar
- [ ] Create stash (with message)
- [ ] Apply/pop/drop stash
- [ ] Show stash diff

---

## Implementation Notes

### State Structure
```js
{
  selectedProject: { path, name },
  status: { staged, unstaged, untracked, branch, ahead, behind },
  commits: [{ hash, short, subject, author, date, parents, branches }],
  branches: { local: [], remote: [], current: '' },
  selectedCommit: null,
  selectedFile: null,
  viewMode: 'working' | 'history',
  commitModal: { open: false, message: '', amend: false }
}
```

### New Backend Functions Needed
```js
// server/git.js additions
getAheadBehind(projectPath, branch) // git rev-list --left-right --count
checkout(projectPath, ref)
createBranch(projectPath, name, startPoint)
deleteBranch(projectPath, name, force)
commit(projectPath, message, amend)
push(projectPath, remote, branch, force)
pull(projectPath, remote, branch, rebase)
fetch(projectPath, remote)
stashList(projectPath)
stashCreate(projectPath, message)
stashApply(projectPath, index)
stashDrop(projectPath, index)
```

### New Handlers Needed
```js
// server/handlers/git.js additions
'git:checkout'
'git:branch:create'
'git:branch:delete'
'git:commit'
'git:push'
'git:pull'
'git:fetch'
'git:stash:list'
'git:stash:create'
'git:stash:apply'
'git:stash:drop'
```

---

## UI Layout

```
+------------------------------------------+
|  [Working Tree] [History]    [iris ▼] [⟳] |
+------------------------------------------+
|          |                               |
| BRANCH   |                               |
| main     |         DIFF VIEWER           |
| ↑2 ↓0    |         (or commit detail)    |
|          |                               |
+----------+                               |
| STAGED   |                               |
| ✓ file.js|                               |
+----------+                               |
| MODIFIED |                               |
| ~ foo.js |                               |
+----------+                               |
| UNTRACKED|                               |
| + bar.js |                               |
+----------+-------------------------------+
| [Stage All] [Commit...]                  |
+------------------------------------------+
```

History view:
```
+------------------------------------------+
|  [Working Tree] [History]    [iris ▼] [⟳] |
+------------------------------------------+
|  BRANCHES  |  COMMITS        | DETAIL    |
|  ──────────|  ──────────────  | ───────── |
| ▸ local    | ● abc123 Fix... | <commit>  |
|   main*    | │ 2h ago        | message   |
|   feature  | ● def456 Add... |           |
| ▸ remote   | │ yesterday     | FILES:    |
|   origin/* | ● ghi789 Init   | - foo.js  |
|            |   3 days ago    | + bar.js  |
+------------------------------------------+
```

---

## Priority Order

1. **Phase 1** - Make the working tree view actually useful
2. **Phase 2** - History is essential for understanding context
3. **Phase 3** - Quick actions make it practical for daily use
4. **Phase 4** - Stash is nice to have

---

## Questions to Resolve

1. Should commit history show all branches or just current branch by default?
   - *Suggestion: current branch, with toggle for all*

2. How to handle merge conflicts in the UI?
   - *Suggestion: show conflict markers, let user resolve in code editor, mark resolved*

3. Should we support interactive rebase?
   - *Suggestion: no, too complex, use terminal*

4. How much commit graph visualization?
   - *Suggestion: simple vertical line with merge points, not full GitKraken-style*
