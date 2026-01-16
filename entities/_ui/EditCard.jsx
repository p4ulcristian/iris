import { useState, useEffect } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPenToSquare,
  faChevronRight,
  faChevronDown,
  faCheck,
  faCodeCompare,
  faFile
} from '@fortawesome/free-solid-svg-icons'

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
    edn: 'clojure',
    rs: 'rust',
    go: 'go',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp'
  }
  return langMap[ext] || 'plaintext'
}

export default function EditCard({ filePath, oldString, newString, result, onRequestFile }) {
  const [expanded, setExpanded] = useState(false)
  const [viewMode, setViewMode] = useState('diff') // 'diff' | 'full'
  const [fullFileContent, setFullFileContent] = useState(null)
  const [loadingFull, setLoadingFull] = useState(false)

  const filename = filePath?.split('/').pop() || 'unknown'
  const language = getLanguage(filename)
  const hasResult = !!result

  // Load full file when switching to full view
  useEffect(() => {
    if (viewMode === 'full' && !fullFileContent && onRequestFile) {
      setLoadingFull(true)
      onRequestFile(filePath).then(content => {
        setFullFileContent(content)
        setLoadingFull(false)
      }).catch(() => {
        setLoadingFull(false)
      })
    }
  }, [viewMode, fullFileContent, filePath, onRequestFile])

  // Build the modified full file content by applying the edit
  const getModifiedFullFile = () => {
    if (!fullFileContent) return ''
    return fullFileContent.replace(oldString, newString)
  }

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors"
      >
        <FontAwesomeIcon icon={faPenToSquare} className="text-yellow-400 text-sm" />
        <span className="text-white/70 text-sm font-medium">Edit</span>
        <span className="text-white/40 text-sm">-</span>
        <span className="text-white/60 text-sm truncate flex-1 text-left">{filename}</span>
        <FontAwesomeIcon
          icon={expanded ? faChevronDown : faChevronRight}
          className="text-white/30 text-xs"
        />
        {hasResult && (
          <FontAwesomeIcon icon={faCheck} className="text-green-500 text-xs" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-yellow-500/20">
          {/* Tab bar */}
          <div className="flex gap-1 px-2 py-1.5 bg-black/20 border-b border-white/10">
            <button
              onClick={() => setViewMode('diff')}
              className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
                viewMode === 'diff'
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <FontAwesomeIcon icon={faCodeCompare} className="text-[10px]" />
              Diff
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
                viewMode === 'full'
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <FontAwesomeIcon icon={faFile} className="text-[10px]" />
              Full File
            </button>
          </div>

          {/* Content */}
          {viewMode === 'diff' ? (
            // Side-by-side diff of old vs new string
            <div className="flex text-xs font-mono">
              {/* Old (left) */}
              <div className="flex-1 border-r border-white/10 overflow-hidden">
                <div className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-medium border-b border-white/10">
                  OLD
                </div>
                <div className="max-h-48 overflow-y-auto overflow-x-auto">
                  {oldString?.split('\n').map((line, i) => (
                    <div key={i} className="flex bg-red-500/20 border-b border-red-500/10">
                      <span className="text-red-400 select-none w-6 px-1 text-right bg-red-500/30 shrink-0">-</span>
                      <pre className="px-2 py-0.5 text-red-200 whitespace-pre">{line || ' '}</pre>
                    </div>
                  ))}
                </div>
              </div>
              {/* New (right) */}
              <div className="flex-1 overflow-hidden">
                <div className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-medium border-b border-white/10">
                  NEW
                </div>
                <div className="max-h-48 overflow-y-auto overflow-x-auto">
                  {newString?.split('\n').map((line, i) => (
                    <div key={i} className="flex bg-green-500/20 border-b border-green-500/10">
                      <span className="text-green-400 select-none w-6 px-1 text-right bg-green-500/30 shrink-0">+</span>
                      <pre className="px-2 py-0.5 text-green-200 whitespace-pre">{line || ' '}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Full file view with Monaco DiffEditor
            <div className="h-64">
              {loadingFull ? (
                <div className="h-full flex items-center justify-center text-white/40 text-sm">
                  Loading file...
                </div>
              ) : fullFileContent ? (
                <DiffEditor
                  width="100%"
                  height="100%"
                  language={language}
                  original={fullFileContent}
                  modified={getModifiedFullFile()}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    lineNumbers: 'on'
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-white/40 text-sm">
                  Could not load file
                </div>
              )}
            </div>
          )}

          {/* File path */}
          <div className="px-2 py-1.5 bg-black/20 border-t border-white/10">
            <span className="text-[10px] text-white/40 font-mono">{filePath}</span>
          </div>
        </div>
      )}
    </div>
  )
}
