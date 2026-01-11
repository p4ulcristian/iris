# Folder Stats Cards - Plan v2

## Goal
Collapsible stats card below each folder, lazy-loaded on first expand.

## Design

```
📁 src (15)
├─────────────────────────────┤
│ 📄 12 files    📁 3 folders │
│ 📏 2.4k lines  💾 156 KB    │
├─────────────────────────────┤
📁 components (8)
   (stats collapsed)
```

- Click folder row = toggle children (existing behavior)
- Click stats toggle button = expand/collapse stats card
- Stats load lazily on first expand, then cached

## UI States

1. **Collapsed** - No stats visible, small toggle indicator
2. **Loading** - Stats card visible with spinner
3. **Loaded** - Stats card with data

## Implementation

### Frontend Changes

**1. Add stats state tracking**
```jsx
// In CodeView component
const [expandedStats, setExpandedStats] = useState(new Set()) // paths with expanded stats
const [loadedStats, setLoadedStats] = useState({}) // { path: { fileCount, folderCount, lineCount, totalSize } }
const [loadingStats, setLoadingStats] = useState(new Set()) // paths currently loading
```

**2. Update TreeNode props**
```jsx
function TreeNode({
  node,
  depth,
  // ... existing props
  expandedStats,
  toggleStats,
  loadedStats,
  loadingStats,
  showHidden
})
```

**3. TreeNode render**
```jsx
function TreeNode({ ... }) {
  const isFolder = node.type === 'directory'
  const isStatsExpanded = expandedStats.has(node.path)
  const isStatsLoading = loadingStats.has(node.path)
  const stats = loadedStats[node.path]

  return (
    <div>
      {/* Folder row */}
      <div className="flex items-center ...">
        <ChevronIcon /> {/* existing - toggles children */}
        <FolderIcon />
        <span>{node.name}</span>
        <span>({node.fileCount + node.folderCount})</span>

        {/* Stats toggle button */}
        {isFolder && (
          <button onClick={() => toggleStats(node.path)}>
            <FontAwesomeIcon icon={faChartBar} />
          </button>
        )}
      </div>

      {/* Stats card - collapsible */}
      {isFolder && isStatsExpanded && (
        <div className="ml-6 my-1 p-2 bg-white/5 rounded-lg border border-white/10">
          {isStatsLoading ? (
            <div className="animate-pulse text-white/40">Loading stats...</div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <div>📄 {stats.fileCount} files</div>
              <div>📁 {stats.folderCount} folders</div>
              <div>📏 {formatLines(stats.lineCount)} lines</div>
              <div>💾 {formatSize(stats.totalSize)}</div>
            </div>
          ) : null}
        </div>
      )}

      {/* Children - existing */}
      {isFolder && isExpanded && node.children && (
        ...
      )}
    </div>
  )
}
```

**4. Toggle stats handler in CodeView**
```jsx
const toggleStats = useCallback(async (path) => {
  // If collapsing, just remove from set
  if (expandedStats.has(path)) {
    setExpandedStats(prev => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    return
  }

  // Expanding - add to set
  setExpandedStats(prev => new Set([...prev, path]))

  // If already loaded, don't fetch again
  if (loadedStats[path]) return

  // Fetch stats
  setLoadingStats(prev => new Set([...prev, path]))

  try {
    const response = await request('file:folder-stats', { path, showHidden })
    if (response.ok) {
      setLoadedStats(prev => ({ ...prev, [path]: response.stats }))
    }
  } catch (err) {
    console.error('Failed to load stats:', err)
  } finally {
    setLoadingStats(prev => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }
}, [expandedStats, loadedStats, showHidden, request])
```

### Backend
Already implemented - `file:folder-stats` handler with caching.

## File Changes

| File | Changes |
|------|---------|
| `entities/code/frontend/View.jsx` | Add stats state, toggleStats handler, update TreeNode with stats card |

## Visual Design

```
┌─ Folder Row ──────────────────────────────┐
│ ▶ 📁 src (15)                        [📊] │
└───────────────────────────────────────────┘
         ↓ click [📊]
┌─ Folder Row ──────────────────────────────┐
│ ▶ 📁 src (15)                        [📊] │
├───────────────────────────────────────────┤
│   📄 12 files       📁 3 folders          │
│   📏 2.4k lines     💾 156 KB             │
└───────────────────────────────────────────┘
```

- Stats button: small chart icon, subtle until hovered
- Stats card: indented, subtle background, 2x2 grid layout
- Loading: pulsing "Loading stats..." text
