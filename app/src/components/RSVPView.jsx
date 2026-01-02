import { useState, useEffect, useRef, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBook,
  faPlay,
  faPause,
  faRotateLeft,
  faForwardStep,
  faBackwardStep
} from '@fortawesome/free-solid-svg-icons'
import { useStore } from '../store'

// Calculate ORP (Optimal Recognition Point) index for a word
const getORPIndex = (word) => {
  const len = word.length
  if (len <= 3) return 0
  if (len <= 5) return 1
  if (len <= 9) return 2
  return 3
}

// Render word with ORP highlighting - red letter is ALWAYS at center
function ORPWord({ word, fontSize }) {
  if (!word) return null

  const orpIndex = getORPIndex(word)
  const before = word.slice(0, orpIndex)
  const orp = word[orpIndex]
  const after = word.slice(orpIndex + 1)

  // Fixed width for before/after sections (in ch units for monospace)
  const sideWidth = 12 // characters

  return (
    <div className="flex items-center font-mono" style={{ fontSize: `${fontSize}px` }}>
      {/* Before section - right aligned, fixed width */}
      <span
        className="text-text-primary text-right inline-block"
        style={{ width: `${sideWidth}ch` }}
      >
        {before}
      </span>
      {/* ORP letter - always at center */}
      <span className="text-red-500 font-bold">{orp}</span>
      {/* After section - left aligned, fixed width */}
      <span
        className="text-text-primary text-left inline-block"
        style={{ width: `${sideWidth}ch` }}
      >
        {after}
      </span>
    </div>
  )
}

export default function RSVPView({ entityId }) {
  const entity = useStore((s) => s.entities[entityId])
  const [text, setText] = useState('')
  const [words, setWords] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [wpm, setWpm] = useState(300)
  const [fontSize, setFontSize] = useState(48)
  const intervalRef = useRef(null)
  const containerRef = useRef(null)

  // Parse text into words
  useEffect(() => {
    const parsed = text.split(/\s+/).filter(w => w.length > 0)
    setWords(parsed)
    setCurrentIndex(0)
    setIsPlaying(false)
  }, [text])

  // Playback interval
  useEffect(() => {
    if (isPlaying && words.length > 0) {
      const delay = 60000 / wpm
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= words.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, delay)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, wpm, words.length])

  // Keyboard controls
  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'TEXTAREA') return

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        if (words.length > 0) {
          setIsPlaying(prev => !prev)
        }
        break
      case 'ArrowRight':
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex(prev => Math.min(prev + 1, words.length - 1))
        break
      case 'ArrowLeft':
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setIsPlaying(false)
        setCurrentIndex(0)
        break
    }
  }, [words.length])

  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener('keydown', handleKeyDown)
      return () => container.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  const togglePlay = () => {
    if (words.length === 0) return
    if (currentIndex >= words.length - 1 && !isPlaying) {
      setCurrentIndex(0)
    }
    setIsPlaying(prev => !prev)
  }

  const reset = () => {
    setIsPlaying(false)
    setCurrentIndex(0)
  }

  const stepBackward = () => {
    setIsPlaying(false)
    setCurrentIndex(prev => Math.max(prev - 1, 0))
  }

  const stepForward = () => {
    setIsPlaying(false)
    setCurrentIndex(prev => Math.min(prev + 1, words.length - 1))
  }

  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0

  if (!entity) return null

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="absolute inset-0 flex flex-col bg-bg-primary/50 outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faBook} className="text-lg text-[#10B981]" />
          <span className="text-text-primary font-medium">RSVP Reader</span>
        </div>
        <div className="flex items-center gap-6">
          {/* WPM Slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">WPM:</span>
            <input
              type="range"
              min="100"
              max="1000"
              step="50"
              value={wpm}
              onChange={(e) => setWpm(Number(e.target.value))}
              className="w-24 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#10B981] [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs text-text-primary w-8">{wpm}</span>
          </div>
          {/* Font Size Slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Size:</span>
            <input
              type="range"
              min="24"
              max="96"
              step="4"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-20 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#10B981] [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs text-text-primary w-6">{fontSize}</span>
          </div>
        </div>
      </div>

      {/* Display Area */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        {words.length === 0 ? (
          <div className="text-text-tertiary text-center">
            <FontAwesomeIcon icon={faBook} className="text-4xl mb-4 opacity-50" />
            <div className="text-lg">Paste or type text below</div>
            <div className="text-sm opacity-70 mt-2">Then press play to start speed reading</div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <ORPWord word={words[currentIndex]} fontSize={fontSize} />
            {/* Focus line */}
            <div className="mt-2 flex items-center gap-1">
              <div className="w-16 h-0.5 bg-white/20" />
              <div className="w-1 h-3 bg-red-500" />
              <div className="w-16 h-0.5 bg-white/20" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-4">
          {/* Playback buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              disabled={words.length === 0}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
              title="Reset (Home)"
            >
              <FontAwesomeIcon icon={faRotateLeft} className="text-text-tertiary" />
            </button>
            <button
              onClick={stepBackward}
              disabled={words.length === 0 || currentIndex === 0}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
              title="Previous word (Left arrow)"
            >
              <FontAwesomeIcon icon={faBackwardStep} className="text-text-tertiary" />
            </button>
            <button
              onClick={togglePlay}
              disabled={words.length === 0}
              className="p-3 bg-[#10B981]/30 hover:bg-[#10B981]/40 rounded-xl transition-colors disabled:opacity-30"
              title="Play/Pause (Space)"
            >
              <FontAwesomeIcon
                icon={isPlaying ? faPause : faPlay}
                className="text-[#10B981] w-4"
              />
            </button>
            <button
              onClick={stepForward}
              disabled={words.length === 0 || currentIndex >= words.length - 1}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
              title="Next word (Right arrow)"
            >
              <FontAwesomeIcon icon={faForwardStep} className="text-text-tertiary" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#10B981] transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-text-tertiary w-20 text-right">
              {words.length > 0 ? `${currentIndex + 1} / ${words.length}` : '0 / 0'}
            </span>
          </div>
        </div>
      </div>

      {/* Text Input */}
      <div className="p-4 border-t border-white/10">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type your text here..."
          className="w-full h-24 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-text-primary placeholder-text-tertiary resize-none focus:outline-none focus:border-[#10B981]/50"
        />
      </div>
    </div>
  )
}
