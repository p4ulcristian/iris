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
  faRefresh
} from '@fortawesome/free-solid-svg-icons'
import { useStore } from '../store'
import { API_URL } from '../config'

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
    bash: 'shell'
  }
  return langMap[ext] || 'plaintext'
}

// Get file icon
function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || FILE_ICONS.default
}

// File tree node component
function TreeNode({ node, depth = 0, onFileClick, expandedFolders, toggleFolder }) {
  const isFolder = node.type === 'directory'
  const isExpanded = expandedFolders.has(node.path)

  return (
    <div>
      <div
        onClick={() => isFolder ? toggleFolder(node.path) : onFileClick(node)}
        className={`
          flex items-center gap-1.5 px-2 py-1 cursor-pointer
          hover:bg-white/10 transition-colors text-sm
          ${isFolder ? 'text-text-secondary' : 'text-text-primary'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder && (
          <FontAwesomeIcon
            icon={isExpanded ? faChevronDown : faChevronRight}
            className="w-2.5 h-2.5 text-text-tertiary"
          />
        )}
        {isFolder ? (
          <FontAwesomeIcon
            icon={isExpanded ? faFolderOpen : faFolder}
            className="w-4 h-4 text-yellow-500"
          />
        ) : (
          <span className="w-4 text-center text-xs">{getFileIcon(node.name)}</span>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
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
        group flex items-center gap-2 px-3 py-1.5 min-w-0 max-w-48
        cursor-pointer transition-all border-b-2
        ${isActive
          ? 'bg-black/40 border-accent'
          : 'bg-black/20 hover:bg-black/30 border-transparent'
        }
      `}
    >
      <span className="text-xs">{getFileIcon(file.name)}</span>
      <span className="truncate text-sm text-text-primary">
        {file.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(file.path)
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-opacity"
      >
        <FontAwesomeIcon icon={faXmark} className="w-3 h-3 text-text-tertiary" />
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
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])

  const codeHighlights = useStore(s => s.codeHighlights)

  // Apply highlights from store
  useEffect(() => {
    if (codeHighlights) {
      setHighlights(codeHighlights)
    }
  }, [codeHighlights])

  // Listen for file open events (from gods)
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'code:file:open' && data.entityId === entityId) {
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
      } catch (e) {
        // Not JSON or other error
      }
    }

    // Listen to WebSocket messages through custom event (would need to wire this up)
    window.addEventListener('iris:code:open', handleMessage)
    return () => window.removeEventListener('iris:code:open', handleMessage)
  }, [entityId, loadFile])

  // Load directory tree from server
  const loadDirectory = useCallback(async (dirPath) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/files?path=${encodeURIComponent(dirPath)}`)
      const data = await response.json()
      setFileTree(data)
      setRootPath(dirPath)
      // Auto-expand first level
      if (data.children) {
        setExpandedFolders(new Set([data.path]))
      }
    } catch (err) {
      console.error('Failed to load directory:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load file content
  const loadFile = useCallback(async (node) => {
    // Check if already open
    const existing = openFiles.find(f => f.path === node.path)
    if (existing) {
      setActiveFilePath(node.path)
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/file?path=${encodeURIComponent(node.path)}`)
      const content = await response.text()

      setOpenFiles(prev => [...prev, {
        path: node.path,
        name: node.name,
        content
      }])
      setActiveFilePath(node.path)
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }, [openFiles])

  // Toggle folder expansion
  const toggleFolder = useCallback((path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // Close file tab
  const closeFile = useCallback((path) => {
    setOpenFiles(prev => prev.filter(f => f.path !== path))
    if (activeFilePath === path) {
      setActiveFilePath(openFiles.find(f => f.path !== path)?.path || null)
    }
  }, [activeFilePath, openFiles])

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

  // Default: load iris project directory
  useEffect(() => {
    // Start with iris project by default
    loadDirectory('/home/p4ulcristian/Work/iris')
  }, [loadDirectory])

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-bg-secondary">
      {/* File tree sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r border-white/10 bg-black/30">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Explorer</span>
          <button
            onClick={() => rootPath && loadDirectory(rootPath)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Refresh"
          >
            <FontAwesomeIcon icon={faRefresh} className="w-3 h-3 text-text-tertiary" />
          </button>
        </div>

        {/* Path input */}
        <div className="px-2 py-2 border-b border-white/10">
          <input
            type="text"
            value={rootPath || ''}
            onChange={(e) => loadDirectory(e.target.value)}
            placeholder="Path..."
            className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {loading && (
            <div className="p-4 text-center text-text-tertiary text-sm">Loading...</div>
          )}
          {!loading && fileTree && (
            <TreeNode
              node={fileTree}
              onFileClick={loadFile}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        {openFiles.length > 0 && (
          <div className="flex-shrink-0 flex items-center border-b border-white/10 bg-black/20 overflow-x-auto">
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
        <div className="flex-1 min-h-0">
          {activeFile ? (
            <Editor
              height="100%"
              language={getLanguage(activeFile.name)}
              value={activeFile.content}
              theme="vs-dark"
              onMount={handleEditorMount}
              options={{
                readOnly: true,
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
          ) : (
            <div className="h-full flex items-center justify-center text-text-tertiary">
              <div className="text-center">
                <p className="text-lg mb-2">No file open</p>
                <p className="text-sm opacity-70">Select a file from the explorer</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
