import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRefresh } from '@fortawesome/free-solid-svg-icons'
import { useStore } from '../store'
import { API_URL } from '../config'
import MarkdownRenderer from '../utils/MarkdownRenderer'

export default function MarkdownView({ entityId }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const entities = useStore(s => s.entities)
  const entity = entities[entityId]
  const filePath = entity?.pendingFile

  const loadFile = async (path) => {
    if (!path) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/file?path=${encodeURIComponent(path)}`)
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`)
      }
      const text = await response.text()
      setContent(text)
    } catch (err) {
      console.error('Failed to load markdown file:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (filePath) {
      loadFile(filePath)
    }
  }, [filePath])

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
  }, [entityId])

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] text-white/40">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-red-400 gap-4">
        <p>{error}</p>
        <button
          onClick={() => loadFile(filePath)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded transition-colors text-sm text-white/70"
        >
          <FontAwesomeIcon icon={faRefresh} />
          Retry
        </button>
      </div>
    )
  }

  if (!filePath) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] text-white/40">
        No file selected
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#1e1e1e] p-8">
      <div className="max-w-3xl mx-auto">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  )
}
