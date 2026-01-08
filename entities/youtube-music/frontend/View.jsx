import { useRef, useEffect, useState } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WS_URL } from '@/config'

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com'

// Chrome user-agent - must be set via attribute before page loads
const CHROME_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Script to extract now-playing info from YouTube Music
const NOW_PLAYING_SCRIPT = `
  (function() {
    const title = document.querySelector('.ytmusic-player-bar .title')?.textContent?.trim() || null;
    const artist = document.querySelector('.ytmusic-player-bar .byline a')?.textContent?.trim() || null;
    const isPlaying = document.querySelector('#play-pause-button[aria-label="Pause"]') !== null;
    return { title, artist, isPlaying };
  })()
`

export default function YouTubeMusicView({ entity }) {
  const entityId = entity?.id
  const webviewRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null)
  const lastTitleRef = useRef(null)
  const { send } = useWebSocket(WS_URL)

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

  // Poll for now-playing info
  useEffect(() => {
    if (!entityId) return

    const pollNowPlaying = async () => {
      const webview = webviewRef.current
      if (!webview) return

      try {
        const result = await webview.executeJavaScript(NOW_PLAYING_SCRIPT)
        if (result?.title) {
          const displayTitle = result.artist
            ? `${result.title} — ${result.artist}`
            : result.title

          // Only update if changed
          if (displayTitle !== lastTitleRef.current) {
            lastTitleRef.current = displayTitle
            send({
              event: 'entity:set-title',
              entityId,
              title: displayTitle
            })
          }
        }
      } catch (err) {
        // Webview not ready or page not loaded yet
      }
    }

    // Start polling after webview loads
    const webview = webviewRef.current
    if (webview) {
      webview.addEventListener('did-finish-load', () => {
        // Initial poll after short delay for page to render
        setTimeout(pollNowPlaying, 2000)
      })
    }

    // Poll every 3 seconds
    const interval = setInterval(pollNowPlaying, 3000)
    return () => clearInterval(interval)
  }, [entityId, send])

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
