import { useEffect, useRef, useState } from 'react'

/**
 * Wallpaper - Reactive animated background with glass effects
 *
 * Features:
 * - Animated blobs with chromatic aberration
 * - Caustic light refraction overlay
 * - Specular highlights that follow mouse
 * - Blobs subtly react to mouse position
 */
export default function Wallpaper() {
  const containerRef = useRef(null)
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 })
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const animationRef = useRef(null)

  // Smooth mouse tracking
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight
      }
    }

    // Animate mouse position smoothly
    const animate = () => {
      setMouse(prev => ({
        x: prev.x + (mouseRef.current.x - prev.x) * 0.05,
        y: prev.y + (mouseRef.current.y - prev.y) * 0.05
      }))
      animationRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMouseMove)
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  // Convert mouse to CSS custom properties for blob influence
  const style = {
    '--mouse-x': mouse.x,
    '--mouse-y': mouse.y,
    // Specular highlight position (offset from mouse)
    '--specular-x': `${mouse.x * 100}%`,
    '--specular-y': `${mouse.y * 100}%`,
  }

  return (
    <div ref={containerRef} className="wallpaper" style={style}>
      {/* Base layer */}
      <div className="wallpaper-base" />

      {/* Caustics layer - animated light refraction */}
      <div className="wallpaper-caustics" />

      {/* Blob layers with chromatic aberration */}
      {/* Each blob has R, G, B offset layers */}
      <div className="blob-layer">
        <div className="blob blob-1">
          <div className="blob-r" />
          <div className="blob-g" />
          <div className="blob-b" />
        </div>
        <div className="blob blob-2">
          <div className="blob-r" />
          <div className="blob-g" />
          <div className="blob-b" />
        </div>
        <div className="blob blob-3">
          <div className="blob-r" />
          <div className="blob-g" />
          <div className="blob-b" />
        </div>
        <div className="blob blob-4">
          <div className="blob-r" />
          <div className="blob-g" />
          <div className="blob-b" />
        </div>
      </div>

      {/* Specular highlight layer - follows mouse */}
      <div className="wallpaper-specular" />
    </div>
  )
}
