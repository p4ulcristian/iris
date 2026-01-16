import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFileExport,
  faChevronRight,
  faChevronDown,
  faCheck
} from '@fortawesome/free-solid-svg-icons'

// Get language from file extension
function getLanguage(filename) {
  if (!filename) return 'plaintext'
  const ext = filename.split('.').pop()?.toLowerCase()
  const langMap = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    json: 'json', md: 'markdown', py: 'python', css: 'css', html: 'html',
    yaml: 'yaml', yml: 'yaml', sh: 'shell', bash: 'shell',
    clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
    rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp'
  }
  return langMap[ext] || 'plaintext'
}

export default function WriteCard({ filePath, content, result }) {
  const [expanded, setExpanded] = useState(true)

  const filename = filePath?.split('/').pop() || 'unknown'
  const hasResult = !!result
  const lines = content?.split('\n') || []

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/5 overflow-hidden min-w-0 w-full">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors"
      >
        <FontAwesomeIcon icon={faFileExport} className="text-green-400 text-sm" />
        <span className="text-white/70 text-sm font-medium">Write</span>
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

      {/* Content */}
      {expanded && (
        <div className="border-t border-green-500/20">
          {/* Code content */}
          <div className="max-h-64 overflow-y-auto overflow-x-auto">
            {lines.map((line, i) => (
              <pre
                key={i}
                className="px-2 py-0.5 whitespace-pre text-xs font-mono overflow-hidden text-ellipsis"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#bbf7d0' }}
              >
                {line || ' '}
              </pre>
            ))}
          </div>

          {/* File path */}
          <div className="px-2 py-1.5 bg-black/20 border-t border-white/10">
            <span className="text-[10px] text-white/40 font-mono">{filePath}</span>
          </div>
        </div>
      )}
    </div>
  )
}
