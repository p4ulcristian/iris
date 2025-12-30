import { useRef, useEffect, useState } from 'react'

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com'

// Chrome user-agent - must be set via attribute before page loads
const CHROME_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export default function YouTubeMusicView() {
  const webviewRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null)

  // Track container size with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(containerRef.current)
    updateSize()

    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0">
      {containerSize.width > 0 && containerSize.height > 0 && (
        <webview
          ref={webviewRef}
          src={YOUTUBE_MUSIC_URL}
          useragent={CHROME_USER_AGENT}
          style={{
            width: `${containerSize.width}px`,
            height: `${containerSize.height}px`,
          }}
          allowpopups="true"
        />
      )}
    </div>
  )
}
