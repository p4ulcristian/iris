import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Resizer - Draggable divider between split tiles
 */
export default function Resizer({
  direction,
  splitId,
  ratio,
  onResize
}) {
  const isHorizontal = direction === 'horizontal'
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef(null)
  const startPosRef = useRef(0)
  const startRatioRef = useRef(ratio)

  // Handle drag start
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
    startPosRef.current = isHorizontal ? e.clientX : e.clientY
    startRatioRef.current = ratio

    // Get parent container size for ratio calculation
    const parent = e.target.parentElement
    if (parent) {
      containerRef.current = parent
    }
  }, [isHorizontal, ratio])

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerSize = isHorizontal ? containerRect.width : containerRect.height
      const currentPos = isHorizontal ? e.clientX : e.clientY
      const startPos = startPosRef.current
      const delta = currentPos - startPos

      // Calculate new ratio
      const deltaRatio = delta / containerSize
      const newRatio = Math.max(0.1, Math.min(0.9, startRatioRef.current + deltaRatio))

      onResize(newRatio)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isHorizontal, onResize])

  return (
    <div
      className={`
        flex-shrink-0
        ${isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}
        ${isDragging ? 'bg-accent/50' : 'bg-transparent'}
        transition-colors
      `}
      onMouseDown={handleMouseDown}
      style={{
        touchAction: 'none',
        userSelect: 'none'
      }}
    />
  )
}
