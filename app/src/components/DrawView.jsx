import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPaintBrush, faSpinner, faDownload, faToggleOn, faToggleOff } from '@fortawesome/free-solid-svg-icons'
import Button from './ui/Button'
import { DRAW_URL } from '../config'

/**
 * DrawView - UI for StarVector SVG generation
 *
 * Features:
 * - Text prompt input
 * - Generate button with loading state
 * - SVG preview
 * - Monochrome toggle
 * - Download button
 */
export default function DrawView() {
  const [prompt, setPrompt] = useState('')
  const [svg, setSvg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mono, setMono] = useState(false)
  const [monoColor, setMonoColor] = useState('#ffffff')

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${DRAW_URL}/text2svg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          mono,
          color: monoColor,
          max_length: 4000
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Generation failed')
      }

      const data = await res.json()
      setSvg(data.svg || '')
    } catch (err) {
      setError(err.message)
      setSvg('')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!svg) return

    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prompt.trim().slice(0, 30).replace(/\s+/g, '-')}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-text-secondary">
        <FontAwesomeIcon icon={faPaintBrush} />
        <span className="font-medium">StarVector SVG Generator</span>
      </div>

      {/* Input Row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the icon... (e.g., 'brake caliper icon')"
          className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:border-white/20"
          disabled={loading}
        />
        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim() || loading}
          icon={loading ? faSpinner : faPaintBrush}
          className={loading ? 'animate-pulse' : ''}
        >
          {loading ? 'Generating...' : 'Generate'}
        </Button>
      </div>

      {/* Options Row */}
      <div className="flex items-center gap-4 text-sm text-text-secondary">
        <button
          onClick={() => setMono(!mono)}
          className="flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <FontAwesomeIcon icon={mono ? faToggleOn : faToggleOff} className={mono ? 'text-accent' : ''} />
          <span>Monochrome</span>
        </button>

        {mono && (
          <div className="flex items-center gap-2">
            <span>Color:</span>
            <input
              type="color"
              value={monoColor}
              onChange={(e) => setMonoColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/10"
            />
            <span className="text-text-tertiary">{monoColor}</span>
          </div>
        )}

        {svg && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 hover:text-text-primary transition-colors ml-auto"
          >
            <FontAwesomeIcon icon={faDownload} />
            <span>Download SVG</span>
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-3 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* SVG Preview */}
      <div className="flex-1 bg-black/20 border border-white/10 rounded-lg p-4 overflow-auto flex items-center justify-center min-h-[200px]">
        {loading ? (
          <div className="text-text-tertiary flex flex-col items-center gap-2">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl" />
            <span>Generating SVG...</span>
            <span className="text-xs">This may take 10-30 seconds</span>
          </div>
        ) : svg ? (
          <div
            className="max-w-full max-h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="text-text-tertiary text-center">
            <p>Enter a prompt and click Generate</p>
            <p className="text-xs mt-2">Examples: "gear icon", "lightning bolt", "tree silhouette"</p>
          </div>
        )}
      </div>

      {/* Raw SVG (collapsible) */}
      {svg && (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
            View Raw SVG
          </summary>
          <pre className="mt-2 p-2 bg-black/30 border border-white/10 rounded text-xs text-text-tertiary overflow-auto max-h-32">
            {svg}
          </pre>
        </details>
      )}
    </div>
  )
}
