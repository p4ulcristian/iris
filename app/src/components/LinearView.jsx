import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRotate,
  faCircle,
  faCheckCircle,
  faExclamationTriangle,
  faArrowUp,
  faArrowDown,
  faMinus,
  faExternalLink,
  faFilter
} from '@fortawesome/free-solid-svg-icons'

const STATUS_CONFIG = {
  'backlog': { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Backlog' },
  'todo': { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Todo' },
  'in_progress': { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'In Progress' },
  'in review': { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'In Review' },
  'done': { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Done' },
  'canceled': { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Canceled' },
  'cancelled': { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Cancelled' },
}

const PRIORITY_CONFIG = {
  0: { icon: faMinus, color: 'text-gray-500', label: 'No priority' },
  1: { icon: faArrowUp, color: 'text-red-500', label: 'Urgent' },
  2: { icon: faArrowUp, color: 'text-orange-500', label: 'High' },
  3: { icon: faMinus, color: 'text-yellow-500', label: 'Medium' },
  4: { icon: faArrowDown, color: 'text-blue-500', label: 'Low' },
}

function IssueCard({ issue, isSelected, onSelect }) {
  const statusKey = issue.state?.type?.toLowerCase() || issue.state?.name?.toLowerCase() || 'todo'
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG['todo']
  const priorityConfig = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG[0]

  return (
    <div
      className={`rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? 'bg-accent/10 border-accent/30'
          : 'bg-black/20 border-white/10 hover:border-white/20'
      }`}
      onClick={() => onSelect(issue)}
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-text-tertiary font-mono">{issue.identifier}</span>
          <FontAwesomeIcon
            icon={priorityConfig.icon}
            className={`text-xs ${priorityConfig.color}`}
            title={priorityConfig.label}
          />
        </div>
        <div className="text-sm text-text-primary mb-2 line-clamp-2">
          {issue.title}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs rounded ${statusConfig.bg} ${statusConfig.color}`}>
            {issue.state?.name || statusConfig.label}
          </span>
          {issue.project && (
            <span className="text-xs text-text-tertiary truncate">
              {issue.project.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function IssueDetails({ issue }) {
  if (!issue) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary">
        Select an issue to view details
      </div>
    )
  }

  const statusKey = issue.state?.type?.toLowerCase() || issue.state?.name?.toLowerCase() || 'todo'
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG['todo']
  const priorityConfig = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG[0]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-black/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-text-tertiary font-mono">{issue.identifier}</span>
          {issue.url && (
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-tertiary hover:text-accent transition-colors"
              title="Open in Linear"
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs" />
            </a>
          )}
        </div>
        <h2 className="text-lg text-text-primary font-medium">{issue.title}</h2>
      </div>

      {/* Meta */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Status:</span>
          <span className={`px-2 py-0.5 text-xs rounded ${statusConfig.bg} ${statusConfig.color}`}>
            {issue.state?.name || statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Priority:</span>
          <span className={`flex items-center gap-1 text-xs ${priorityConfig.color}`}>
            <FontAwesomeIcon icon={priorityConfig.icon} />
            {priorityConfig.label}
          </span>
        </div>
        {issue.project && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Project:</span>
            <span className="text-xs text-text-primary">{issue.project.name}</span>
          </div>
        )}
        {issue.team && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Team:</span>
            <span className="text-xs text-text-primary">{issue.team.name}</span>
          </div>
        )}
        {issue.dueDate && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Due:</span>
            <span className="text-xs text-text-primary">
              {new Date(issue.dueDate).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Labels */}
      {issue.labels?.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1">
          {issue.labels.map(label => (
            <span
              key={label.id}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {issue.description ? (
          <div className="text-sm text-text-secondary whitespace-pre-wrap">
            {issue.description}
          </div>
        ) : (
          <div className="text-sm text-text-tertiary italic">
            No description
          </div>
        )}
      </div>

      {/* Branch name */}
      {issue.branchName && (
        <div className="px-4 py-2 border-t border-border bg-black/10">
          <span className="text-xs text-text-tertiary">Branch: </span>
          <code className="text-xs text-accent font-mono">{issue.branchName}</code>
        </div>
      )}
    </div>
  )
}

export default function LinearView({ send }) {
  const [issues, setIssues] = useState([])
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('active') // 'all' | 'active' | 'done'

  // Fetch issues on mount
  useEffect(() => {
    fetchIssues()
  }, [])

  const fetchIssues = useCallback(() => {
    setLoading(true)
    setError(null)
    send({ event: 'linear:issues:fetch', assignee: 'me' })
  }, [send])

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.event === 'linear:issues:response') {
          setIssues(msg.issues || [])
          setLoading(false)
        }

        if (msg.event === 'linear:issue:response') {
          setSelectedIssue(msg.issue)
        }

        if (msg.event === 'linear:error') {
          setError(msg.error)
          setLoading(false)
        }
      } catch {}
    }

    const ws = window.__irisWs
    if (ws) {
      ws.addEventListener('message', handleMessage)
      return () => ws.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleSelectIssue = useCallback((issue) => {
    setSelectedIssue(issue)
    // Optionally fetch full details
    send({ event: 'linear:issue:get', id: issue.id })
  }, [send])

  // Filter issues
  const filteredIssues = issues.filter(issue => {
    const stateType = issue.state?.type?.toLowerCase()
    if (filter === 'active') {
      return stateType !== 'completed' && stateType !== 'canceled' && stateType !== 'cancelled'
    }
    if (filter === 'done') {
      return stateType === 'completed'
    }
    return true
  })

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === 'active'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('done')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === 'done'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Done
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={fetchIssues}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/20 text-accent border border-accent/30 rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faRotate} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left sidebar - issues list */}
        <div className="w-80 flex flex-col gap-2 overflow-y-auto">
          {loading && issues.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm">
              Loading issues...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm">
              No issues found
            </div>
          ) : (
            filteredIssues.map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                isSelected={selectedIssue?.id === issue.id}
                onSelect={handleSelectIssue}
              />
            ))
          )}
        </div>

        {/* Right side - issue details */}
        <div className="flex-1 bg-black/20 border border-white/10 rounded-xl overflow-hidden">
          <IssueDetails issue={selectedIssue} />
        </div>
      </div>
    </div>
  )
}
