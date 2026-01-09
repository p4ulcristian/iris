import { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRefresh } from '@fortawesome/free-solid-svg-icons'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'
import { MarkdownRenderer } from '../../_ui'
import { ActionButton } from '../../_ui'

export default function MarkdownView({ entity }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { request, connected } = useWebSocket(WS_URL)
  const entityId = entity?.id
  const filePath = entity?.pendingFile

  const loadFile = useCallback(async (path) => {
    if (!path) return
    if (!connected) {
      setTimeout(() => loadFile(path), 100)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await request('file:read', { path })
      if (response.ok) {
        setContent(response.content)
      } else {
        throw new Error(response.error || 'Failed to load file')
      }
    } catch (err) {
      console.error('Failed to load markdown file:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [request, connected])

  useEffect(() => {
    if (filePath) {
      loadFile(filePath)
    }
  }, [filePath, loadFile])

  // Listen for file open events
  useEffect(() => {
    const handleMdOpen = (event) => {
      const data = event.detail
      if (!data) return
      if (data.entityId && data.entityId !== entityId) return
      loadFile(data.filePath)
    }

    window.addEventListener('iris:md:open', handleMdOpen)
    return () => window.removeEventListener('iris:md:open', handleMdOpen)
  }, [entityId, loadFile])

  if (!filePath) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] text-white/40">
        No file selected
      </div>
    )
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-red-400 gap-4">
        <p>{error}</p>
        <ActionButton variant="ghost" icon={faRefresh} onClick={() => loadFile(filePath)}>
          Retry
        </ActionButton>
      </div>
    )
  }

  if (loading || !content) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] text-white/40">
        Loading...
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#1e1e1e] p-8 entity-content">
      <div className="max-w-3xl mx-auto">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  )
}
