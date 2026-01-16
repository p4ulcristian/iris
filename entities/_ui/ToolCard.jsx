import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTerminal,
  faFileCode,
  faFileExport,
  faPenToSquare,
  faFolderTree,
  faMagnifyingGlass,
  faRobot,
  faGlobe,
  faListCheck,
  faPlug,
  faWrench,
  faChevronDown,
  faChevronRight,
  faBook,
  faDisplay,
  faCode,
  faPlay
} from '@fortawesome/free-solid-svg-icons'
import CodeBlock from './CodeBlock'

// Tool configuration: icon, color, and how to extract display info
const TOOL_CONFIG = {
  // File operations
  Bash: { icon: faTerminal, color: 'orange', getDisplay: (input) => input?.command },
  Read: { icon: faFileCode, color: 'blue', getDisplay: (input) => input?.file_path },
  Write: { icon: faFileExport, color: 'green', getDisplay: (input) => input?.file_path },
  Edit: { icon: faPenToSquare, color: 'yellow', getDisplay: (input) => input?.file_path },
  Glob: { icon: faFolderTree, color: 'cyan', getDisplay: (input) => input?.pattern },
  Grep: { icon: faMagnifyingGlass, color: 'purple', getDisplay: (input) => input?.pattern },

  // Agent/Task
  Task: { icon: faRobot, color: 'pink', getDisplay: (input) => input?.description || input?.prompt?.slice(0, 50) },

  // Web
  WebFetch: { icon: faGlobe, color: 'blue', getDisplay: (input) => input?.url },
  WebSearch: { icon: faMagnifyingGlass, color: 'blue', getDisplay: (input) => input?.query },

  // Todo
  TodoWrite: { icon: faListCheck, color: 'green', getDisplay: (input) => `${input?.todos?.length || 0} items` },

  // Iris tools
  iris_read: { icon: faFileCode, color: 'blue', getDisplay: (input) => input?.path },
  iris_edit: { icon: faPenToSquare, color: 'yellow', getDisplay: (input) => input?.path },
  open_code: { icon: faCode, color: 'blue', getDisplay: (input) => input?.path },
  highlight_code: { icon: faCode, color: 'yellow', getDisplay: (input) => input?.path },

  // MCP tools (generic)
  mcp__playwright: { icon: faDisplay, color: 'green', getDisplay: (input) => input?.url || 'browser action' },
  mcp__linear: { icon: faListCheck, color: 'purple', getDisplay: (input) => input?.title || input?.id || 'linear' },

  // Skills
  Skill: { icon: faPlay, color: 'cyan', getDisplay: (input) => input?.skill },

  // Default
  default: { icon: faWrench, color: 'gray', getDisplay: () => null }
}

// Color classes
const COLOR_CLASSES = {
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  green: 'text-green-400 bg-green-500/10 border-green-500/20',
  yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  pink: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  gray: 'text-white/60 bg-white/5 border-white/10',
}

function getToolConfig(toolName) {
  // Direct match
  if (TOOL_CONFIG[toolName]) return TOOL_CONFIG[toolName]

  // MCP tool prefix match
  if (toolName.startsWith('mcp__')) {
    const prefix = toolName.split('__').slice(0, 2).join('__')
    if (TOOL_CONFIG[prefix]) return TOOL_CONFIG[prefix]
    return { icon: faPlug, color: 'gray', getDisplay: () => null }
  }

  return TOOL_CONFIG.default
}

export default function ToolCard({ name, input, result }) {
  const [expanded, setExpanded] = useState(false)
  const config = getToolConfig(name)
  const colorClass = COLOR_CLASSES[config.color]
  const displayValue = config.getDisplay?.(input)

  // Determine if this tool has code to show
  const hasCode = name === 'Bash' && input?.command
  const language = name === 'Bash' ? 'bash' : 'json'

  // Format result for display
  const formatResult = (r) => {
    if (!r) return null
    if (typeof r === 'string') return r
    if (r.content) return typeof r.content === 'string' ? r.content : JSON.stringify(r.content, null, 2)
    if (r.stdout) return r.stdout
    return JSON.stringify(r, null, 2)
  }
  const resultText = formatResult(result)

  return (
    <div className={`mt-2 rounded-lg border ${colorClass} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <FontAwesomeIcon icon={config.icon} className="text-sm" />
        <span className="font-medium text-sm">{name}</span>
        {displayValue && (
          <span className="flex-1 text-left text-xs text-white/50 truncate ml-2">
            {displayValue}
          </span>
        )}
        {result && <span className="text-xs text-green-400">✓</span>}
        <FontAwesomeIcon
          icon={expanded ? faChevronDown : faChevronRight}
          className="text-xs text-white/30"
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/10">
          {hasCode ? (
            <div className="p-2">
              <CodeBlock language={language} showLineNumbers={false}>
                {input.command}
              </CodeBlock>
            </div>
          ) : (
            <pre className="p-3 text-xs text-white/60 font-mono whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
              {JSON.stringify(input, null, 2)}
            </pre>
          )}

          {/* Result section */}
          {resultText && (
            <div className="border-t border-white/10 bg-green-500/5">
              <div className="px-3 py-1.5 text-xs text-green-400 font-medium">Result</div>
              <pre className="px-3 pb-3 text-xs text-white/70 font-mono whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                {resultText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
