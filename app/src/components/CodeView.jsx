import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFolder,
  faFolderOpen,
  faFile,
  faXmark,
  faChevronRight,
  faChevronDown,
  faChevronLeft,
  faRefresh,
  faFolderTree,
  faEye,
  faEyeSlash,
  faBars
} from '@fortawesome/free-solid-svg-icons'
import { useStore } from '../store'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../config'

// File icons by extension
const FILE_ICONS = {
  js: '📜',
  jsx: '⚛️',
  ts: '📘',
  tsx: '⚛️',
  json: '📋',
  md: '📝',
  py: '🐍',
  css: '🎨',
  html: '🌐',
  yaml: '⚙️',
  yml: '⚙️',
  sh: '🔧',
  clj: '🟣',
  cljs: '🟣',
  cljc: '🟣',
  edn: '🟣',
  default: '📄'
}

// Highlight colors
const HIGHLIGHT_COLORS = {
  yellow: 'rgba(255, 255, 0, 0.3)',
  red: 'rgba(255, 0, 0, 0.25)',
  green: 'rgba(0, 255, 0, 0.2)',
  blue: 'rgba(0, 100, 255, 0.25)',
  orange: 'rgba(255, 165, 0, 0.3)',
  purple: 'rgba(128, 0, 255, 0.25)',
  cyan: 'rgba(0, 255, 255, 0.2)'
}

// Get language from file extension
function getLanguage(filename) {
  if (!filename) return 'plaintext'
  const ext = filename.split('.').pop()?.toLowerCase()
  const langMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    css: 'css',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    clj: 'clojure',
    cljs: 'clojure',
    cljc: 'clojure',
    edn: 'clojure'
  }
  return langMap[ext] || 'plaintext'
}

// Get file icon
function getFileIcon(filename) {
  if (!filename) return FILE_ICONS.default
  const ext = filename.split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || FILE_ICONS.default
}

// File tree node component
function TreeNode({ node, depth = 0, onFileClick, expandedFolders, toggleFolder, loadingFolders }) {
  if (!node) return null
  const isFolder = node.type === 'directory'
  const isExpanded = expandedFolders.has(node.path)
  const isLoading = loadingFolders?.has(node.path)

  return (
    <div>
      <div
        onClick={() => isFolder ? toggleFolder(node.path) : onFileClick(node)}
        className={`
          flex items-center gap-2 py-1.5 cursor-pointer rounded-lg mx-1
          hover:bg-white/8 active:bg-white/12 transition-all duration-150
          ${isFolder ? 'text-white/70' : 'text-white/85'}
          ${isExpanded ? 'bg-white/5' : ''}
        `}
        style={{ paddingLeft: `${depth * 14 + 10}px`, paddingRight: '10px' }}
      >
        {isFolder && (
          <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
            <FontAwesomeIcon
              icon={faChevronRight}
              className={`w-2 h-2 ${isLoading ? 'animate-pulse text-accent' : 'text-white/40'}`}
            />
          </span>
        )}
        {isFolder ? (
          <FontAwesomeIcon
            icon={isExpanded ? faFolderOpen : faFolder}
            className={`w-4 h-4 transition-colors ${isExpanded ? 'text-yellow-400' : 'text-yellow-500/70'}`}
          />
        ) : (
          <span className="w-4 text-center text-xs opacity-80">{getFileIcon(node.name)}</span>
        )}
        <span className="truncate text-[13px]">{node.name}</span>
      </div>
      {isFolder && isExpanded && node.children && (
        <div className="relative">
          {/* Subtle indent guide line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-white/8"
            style={{ left: `${depth * 14 + 18}px` }}
          />
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              loadingFolders={loadingFolders}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Editor tab component
function EditorTab({ file, isActive, onClick, onClose }) {
  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center gap-2 px-3 py-2 min-w-0 max-w-52
        cursor-pointer transition-all duration-150 rounded-t-lg mx-0.5
        ${isActive
          ? 'bg-white/10 text-white border-b-2 border-accent/60'
          : 'bg-white/5 hover:bg-white/8 text-white/70 border-b-2 border-transparent'
        }
      `}
    >
      <span className="text-xs opacity-80">{getFileIcon(file.name)}</span>
      <span className="truncate text-[13px]">
        {file.name}
      </span>
      {file.modified && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" title="Unsaved changes" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(file.path)
        }}
        className="ml-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-white/15 rounded-full transition-all"
      >
        <FontAwesomeIcon icon={faXmark} className="w-2.5 h-2.5 text-white/50 hover:text-white/80" />
      </button>
    </div>
  )
}

export default function CodeView({ entityId }) {
  const [rootPath, setRootPath] = useState(null)
  const [fileTree, setFileTree] = useState(null)
  const [openFiles, setOpenFiles] = useState([]) // [{path, name, content}]
  const [activeFilePath, setActiveFilePath] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [highlights, setHighlights] = useState({}) // {filePath: [{line, endLine, color, note}]}
  const [loading, setLoading] = useState(false)
  const [loadingFolders, setLoadingFolders] = useState(new Set())
  const [pendingFileHandled, setPendingFileHandled] = useState(null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [projects, setProjects] = useState([])
  const [projectsFetched, setProjectsFetched] = useState(false)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])

  const { send, request } = useWebSocket(WS_URL)
  const codeHighlights = useStore(s => s.codeHighlights)
  const entities = useStore(s => s.entities)
  const entity = entities[entityId]

  // Apply highlights from store
  useEffect(() => {
    if (codeHighlights) {
      setHighlights(codeHighlights)
    }
  }, [codeHighlights])

  // Fetch projects on mount - use send/listen pattern like PersonalitiesView
  useEffect(() => {
    if (!send) return
    send({ event: 'projects:list' })
  }, [send])

  // Listen for WebSocket responses
  useEffect(() => {
    const ws = window.__irisWs
    if (!ws) return

    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'projects:list:response') {
          console.log('[CodeView] Got projects:', msg.projects)
          setProjects(msg.projects || [])
          setProjectsFetched(true)
        }

        if (msg.event === 'file:list') {
          console.log('[CodeView] Got file:list response')
          setLoading(false)
          if (msg.ok && msg.tree) {
            // Show children directly, not the root folder
            setFileTree(msg.tree.children || [])
            setRootPath(msg.tree.path)
            setExpandedFolders(new Set())
          } else {
            console.error('Failed to load directory:', msg.error)
          }
        }

        if (msg.event === 'file:children') {
          setLoadingFolders(prev => {
            const next = new Set(prev)
            next.delete(msg.path)
            return next
          })
          if (msg.ok) {
            setFileTree(prev => updateTreeChildren(prev, msg.path, msg.children))
          } else {
            console.error('Failed to load folder children:', msg.error)
          }
        }
      } catch (e) {
        // ignore
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => ws.removeEventListener('message', handleMessage)
  }, [])

  // Load directory tree from server (using send/listen pattern)
  const loadDirectory = useCallback((dirPath, hidden = showHidden) => {
    if (!send) return
    console.log('[CodeView] loadDirectory:', dirPath)
    setLoading(true)
    send({ event: 'file:list', path: dirPath, showHidden: hidden })
  }, [showHidden, send])

  // Load file content
  const loadFile = useCallback(async (node) => {
    if (!request) return
    // Check if already open
    const existing = openFiles.find(f => f.path === node.path)
    if (existing) {
      setActiveFilePath(node.path)
      return
    }

    try {
      const response = await request('file:read', { path: node.path })
      if (response.ok) {
        setOpenFiles(prev => [...prev, {
          path: node.path,
          name: node.name,
          content: response.content
        }])
        setActiveFilePath(node.path)
      } else {
        console.error('Failed to load file:', response.error)
      }
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }, [openFiles, request])

  // Load pending file from entity (for newly created code entities)
  useEffect(() => {
    if (!entity?.pendingFile) return
    // Skip if we already handled this pending file
    if (pendingFileHandled === entity.pendingFile) return

    setPendingFileHandled(entity.pendingFile)

    const path = entity.pendingFile.replace(/\/$/, '')
    const name = path.split('/').pop()

    // Try to load as file first, fall back to directory if it fails
    const tryLoadFile = async () => {
      if (!request) {
        // If WebSocket not ready, try again shortly
        setTimeout(tryLoadFile, 100)
        return
      }
      try {
        const response = await request('file:read', { path })
        if (response.ok) {
          setOpenFiles([{ path, name, content: response.content }])
          setActiveFilePath(path)
          // Jump to line if specified
          if (entity.pendingLine) {
            setTimeout(() => {
              editorRef.current?.revealLineInCenter(entity.pendingLine)
              editorRef.current?.setPosition({ lineNumber: entity.pendingLine, column: 1 })
            }, 200)
          }
          return
        }
      } catch (err) {
        // File load failed, try as directory
      }
      // Fall back to directory
      loadDirectory(path)
    }

    tryLoadFile()
  }, [entity?.pendingFile, entity?.pendingLine, loadDirectory, pendingFileHandled])

  // Listen for file open events (from gods)
  useEffect(() => {
    const handleCodeOpen = (event) => {
      const data = event.detail
      if (!data) return

      // Accept if this is the target entity, or if no entityId specified (use any code viewer)
      if (data.entityId && data.entityId !== entityId) return

      // Load the file
      loadFile({ path: data.filePath, name: data.filePath.split('/').pop() })
      // Jump to line if specified
      if (data.line && editorRef.current) {
        setTimeout(() => {
          editorRef.current?.revealLineInCenter(data.line)
          editorRef.current?.setPosition({ lineNumber: data.line, column: 1 })
        }, 100)
      }
    }

    window.addEventListener('iris:code:open', handleCodeOpen)
    return () => window.removeEventListener('iris:code:open', handleCodeOpen)
  }, [entityId, loadFile])

  // Helper to update children in the tree (tree is an array of nodes)
  const updateTreeChildren = useCallback((tree, targetPath, children) => {
    if (!tree || !Array.isArray(tree)) return tree
    return tree.map(node => {
      if (node.path === targetPath) {
        return { ...node, children }
      }
      if (node.children) {
        return { ...node, children: updateTreeChildren(node.children, targetPath, children) }
      }
      return node
    })
  }, [])

  // Find node in tree (tree is an array of nodes)
  const findNode = useCallback((tree, targetPath) => {
    if (!tree || !Array.isArray(tree)) return null
    for (const node of tree) {
      if (node.path === targetPath) return node
      if (node.children) {
        const found = findNode(node.children, targetPath)
        if (found) return found
      }
    }
    return null
  }, [])

  // Load folder children on-demand (using send/listen pattern)
  const loadFolderChildren = useCallback((folderPath) => {
    if (!send) return
    setLoadingFolders(prev => new Set([...prev, folderPath]))
    send({ event: 'file:children', path: folderPath, showHidden })
  }, [showHidden, send])

  // Toggle folder expansion
  const toggleFolder = useCallback((path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // Check if folder needs children loaded
        const node = findNode(fileTree, path)
        if (node && node.type === 'directory' && (!node.children || node.children.length === 0)) {
          loadFolderChildren(path)
        }
      }
      return next
    })
  }, [fileTree, findNode, loadFolderChildren])

  // Close file tab
  const closeFile = useCallback((path) => {
    setOpenFiles(prev => prev.filter(f => f.path !== path))
    if (activeFilePath === path) {
      setActiveFilePath(openFiles.find(f => f.path !== path)?.path || null)
    }
  }, [activeFilePath, openFiles])

  // Save file to disk
  const saveFile = useCallback(async (filePath) => {
    if (!request) return
    const file = openFiles.find(f => f.path === filePath)
    if (!file || !file.modified) return

    try {
      const response = await request('file:write', { path: filePath, content: file.content })
      if (response.ok) {
        setOpenFiles(prev => prev.map(f =>
          f.path === filePath ? { ...f, modified: false } : f
        ))
        console.log('File saved:', filePath)
      } else {
        console.error('Failed to save file:', response.error)
      }
    } catch (err) {
      console.error('Save error:', err)
    }
  }, [openFiles, request])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (activeFilePath) saveFile(activeFilePath)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeFilePath, saveFile])

  // Restore persisted open files on mount
  useEffect(() => {
    if (initialLoadDone) return

    // No persisted files - mark as done so syncing can begin
    if (!entity?.openFiles?.length) {
      setInitialLoadDone(true)
      return
    }

    // Load persisted files
    const loadPersistedFiles = async () => {
      if (!request) {
        // If WebSocket not ready, try again shortly
        setTimeout(loadPersistedFiles, 100)
        return
      }
      const loaded = []
      for (const f of entity.openFiles) {
        try {
          const response = await request('file:read', { path: f.path })
          if (response.ok) {
            loaded.push({ path: f.path, name: f.name, content: response.content })
          }
        } catch (err) {
          console.error('Failed to load persisted file:', f.path, err)
        }
      }
      if (loaded.length > 0) {
        setOpenFiles(loaded)
        setActiveFilePath(entity.activeFilePath || loaded[0].path)
      }
      setInitialLoadDone(true)
    }

    loadPersistedFiles()
  }, [entity?.openFiles, entity?.activeFilePath, initialLoadDone, request])

  // Sync open files to server when they change
  useEffect(() => {
    console.log('[CodeView sync check]', { initialLoadDone, hasSend: !!send, activeFilePath, rootPath })
    if (!initialLoadDone || !send) return

    // Only send path and name, not content (too large)
    const filesToSync = openFiles.map(f => ({ path: f.path, name: f.name }))

    console.log('[CodeView sync SENDING]', { entityId, activeFilePath, rootPath })
    send({
      event: 'code:files:sync',
      entityId,
      openFiles: filesToSync,
      activeFilePath,
      rootPath
    })
  }, [openFiles, activeFilePath, rootPath, entityId, send, initialLoadDone])

  // Apply decorations for highlights
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFilePath) return

    const monaco = monacoRef.current
    const editor = editorRef.current
    const fileHighlights = highlights[activeFilePath] || []

    // Clear old decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])

    if (fileHighlights.length === 0) return

    // Create new decorations
    const decorations = fileHighlights.map(h => ({
      range: new monaco.Range(h.line, 1, h.endLine || h.line, 1),
      options: {
        isWholeLine: true,
        className: `highlight-${h.color}`,
        glyphMarginClassName: `glyph-${h.color}`,
        hoverMessage: h.note ? { value: h.note } : undefined
      }
    }))

    decorationsRef.current = editor.deltaDecorations([], decorations)
  }, [highlights, activeFilePath])

  // Handle editor mount
  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Define custom CSS classes for highlights
    const styleEl = document.getElementById('monaco-highlight-styles') || document.createElement('style')
    styleEl.id = 'monaco-highlight-styles'
    styleEl.textContent = Object.entries(HIGHLIGHT_COLORS).map(([name, color]) => `
      .highlight-${name} { background: ${color} !important; }
      .glyph-${name}::before {
        content: '';
        display: block;
        width: 4px;
        height: 100%;
        background: ${color.replace(/[\d.]+\)$/, '0.8)')};
        margin-left: 3px;
      }
    `).join('\n')
    if (!document.getElementById('monaco-highlight-styles')) {
      document.head.appendChild(styleEl)
    }
  }

  // Get active file
  const activeFile = openFiles.find(f => f.path === activeFilePath)

  // Track if we've done initial load
  const initialLoadRef = useRef(false)

  // Default: load project directory (only if no pending file)
  useEffect(() => {
    // Skip if there's a pending file - that effect will handle loading
    if (entity?.pendingFile) return
    // Wait for projects to be fetched
    if (!projectsFetched) return
    // Only load once
    if (initialLoadRef.current) return
    initialLoadRef.current = true

    // Determine which project path to use
    let projectPath = null

    // 1. If entity has a project set, use that
    if (entity?.project) {
      const entityProject = projects.find(p => p.name === entity.project)
      if (entityProject?.path) {
        projectPath = entityProject.path
      }
    }

    // 2. Otherwise use default project
    if (!projectPath) {
      const defaultProject = projects.find(p => p.isDefault)
      if (defaultProject?.path) {
        projectPath = defaultProject.path
      }
    }

    // 3. Fall back to first project if no default
    if (!projectPath && projects[0]?.path) {
      projectPath = projects[0].path
    }

    // 4. Last resort: home directory
    if (!projectPath) {
      projectPath = '/home'
    }

    console.log('[CodeView] Initial load:', projectPath)
    loadDirectory(projectPath)
  }, [loadDirectory, entity?.pendingFile, entity?.project, projects, projectsFetched])

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* File tree sidebar - liquid glass */}
      <div
        className={`flex-shrink-0 flex flex-col border-r border-white/8 bg-black/20 backdrop-blur-xl transition-all duration-200 ${
          sidebarCollapsed ? 'w-10' : 'w-60'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center border-b border-white/8 ${sidebarCollapsed ? 'justify-center px-0 py-2' : 'justify-between px-3 py-2'}`}>
          {!sidebarCollapsed && (
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Explorer</span>
          )}
          <div className={`flex ${sidebarCollapsed ? 'flex-col gap-1' : 'gap-0.5'}`}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 hover:bg-white/8 rounded-lg transition-all duration-150 text-white/40 hover:text-white/60"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <FontAwesomeIcon icon={sidebarCollapsed ? faChevronRight : faChevronLeft} className="w-3 h-3" />
            </button>
            {!sidebarCollapsed && (
              <>
                <button
                  onClick={() => {
                    const newVal = !showHidden
                    setShowHidden(newVal)
                    if (rootPath) loadDirectory(rootPath, newVal)
                  }}
                  className={`p-1.5 rounded-lg transition-all duration-150 ${showHidden ? 'bg-white/10 text-accent' : 'hover:bg-white/8 text-white/40'}`}
                  title={showHidden ? "Hide hidden files" : "Show hidden files"}
                >
                  <FontAwesomeIcon icon={showHidden ? faEye : faEyeSlash} className="w-3 h-3" />
                </button>
                <button
                  onClick={() => rootPath && loadDirectory(rootPath)}
                  className="p-1.5 hover:bg-white/8 rounded-lg transition-all duration-150 text-white/40 hover:text-white/60"
                  title="Refresh"
                >
                  <FontAwesomeIcon icon={faRefresh} className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Project selector - hidden when collapsed */}
        {!sidebarCollapsed && (
          <div className="px-2 py-2 border-b border-white/8">
            {projects.length === 0 ? (
              <div className="text-xs text-white/40">Loading projects... ({projectsFetched ? 'fetched but empty' : 'fetching'})</div>
            ) : (
            <select
              value={rootPath || ''}
              onChange={(e) => {
                console.log('[CodeView] Project selected:', e.target.value)
                loadDirectory(e.target.value)
              }}
              className="w-full pl-2 pr-6 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/85 focus:outline-none focus:bg-white/8 focus:border-white/20 transition-all cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.name} value={p.path} className="bg-[#1a1a1a]">
                  {p.name}{p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            )}
          </div>
        )}

        {/* Path input with folder picker - hidden when collapsed */}
        {!sidebarCollapsed && (
          <div className="px-2 py-2 border-b border-white/8">
            <div className="flex gap-1">
              <input
                type="text"
                value={rootPath || ''}
                onChange={(e) => loadDirectory(e.target.value)}
                placeholder="Path..."
                className="flex-1 min-w-0 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/85 placeholder:text-white/30 focus:outline-none focus:bg-white/8 focus:border-white/20 transition-all"
              />
              <button
                onClick={async () => {
                  const selectedPath = await window.iris?.selectFolder()
                  if (selectedPath) loadDirectory(selectedPath)
                }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/8 border border-white/10 rounded-lg text-white/60 hover:bg-white/12 hover:text-white/80 transition-all"
                title="Browse folder"
              >
                <FontAwesomeIcon icon={faFolderTree} className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tree - hidden when collapsed */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {loading && (
              <div className="p-6 text-center text-white/40 text-sm">
                <div className="animate-pulse">Loading...</div>
              </div>
            )}
            {!loading && fileTree && fileTree.map(node => (
              <TreeNode
                key={node.path}
                node={node}
                onFileClick={loadFile}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                loadingFolders={loadingFolders}
              />
            ))}
          </div>
        )}

        {/* Collapsed state - show folder icon to expand */}
        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center pt-2 gap-1">
            <button
              onClick={async () => {
                const selectedPath = await window.iris?.selectFolder()
                if (selectedPath) {
                  loadDirectory(selectedPath)
                  setSidebarCollapsed(false)
                }
              }}
              className="p-1.5 hover:bg-white/8 rounded-lg transition-all duration-150 text-white/40 hover:text-white/60"
              title="Browse folder"
            >
              <FontAwesomeIcon icon={faFolderTree} className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => rootPath && loadDirectory(rootPath)}
              className="p-1.5 hover:bg-white/8 rounded-lg transition-all duration-150 text-white/40 hover:text-white/60"
              title="Refresh"
            >
              <FontAwesomeIcon icon={faRefresh} className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0 bg-black/30">
        {/* Tab bar */}
        {openFiles.length > 0 && (
          <div className="flex-shrink-0 flex items-end pt-1.5 px-1 border-b border-white/8 bg-black/20 overflow-x-auto scrollbar-none">
            {openFiles.map(file => (
              <EditorTab
                key={file.path}
                file={file}
                isActive={file.path === activeFilePath}
                onClick={() => setActiveFilePath(file.path)}
                onClose={closeFile}
              />
            ))}
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 relative">
          {activeFile ? (
            <div className="absolute inset-0">
              <Editor
                width="100%"
                height="100%"
                language={getLanguage(activeFile.name)}
                value={activeFile.content}
                theme="vs-dark"
                onMount={handleEditorMount}
                onChange={(value) => {
                  setOpenFiles(prev => prev.map(f =>
                    f.path === activeFilePath ? { ...f, content: value, modified: true } : f
                  ))
                }}
                options={{
                  minimap: { enabled: true },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  glyphMargin: true,
                  folding: true,
                  wordWrap: 'on'
                }}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-white/30">
                <FontAwesomeIcon icon={faFile} className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base mb-1">No file open</p>
                <p className="text-sm opacity-60">Select a file from the explorer</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
