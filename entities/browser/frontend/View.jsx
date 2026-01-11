import { useState, useRef, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowLeft,
  faArrowRight,
  faRotateRight,
  faXmark,
  faPlus,
  faLock,
  faHome,
  faDownload
} from '@fortawesome/free-solid-svg-icons'
import { faChrome } from '@fortawesome/free-brands-svg-icons'
import { useStore } from '@/store'
import { IconButton } from '../../_ui'

function BrowserTab({ tab, isActive, onClick, onClose }) {
  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center gap-2 px-3 py-1.5 min-w-0 max-w-48
        rounded-t-lg cursor-pointer transition-all
        ${isActive
          ? 'bg-black/40 border-t border-l border-r border-white/20'
          : 'bg-black/20 hover:bg-black/30 border border-transparent'
        }
      `}
    >
      {tab.favicon && (
        <img src={tab.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
      )}
      <span className="truncate text-sm text-text-primary flex-1">
        {tab.title || 'New Tab'}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-opacity"
      >
        <FontAwesomeIcon icon={faXmark} className="w-3 h-3 text-text-tertiary" />
      </button>
    </div>
  )
}

export default function BrowserView({ entity }) {
  const entityId = entity?.id
  const browserUrl = useStore(s => s.browserUrl)
  const initialUrl = entity?.url || 'https://duckduckgo.com'
  const [tabs, setTabs] = useState([
    { id: 1, url: initialUrl, title: 'Loading...', favicon: null, canGoBack: false, canGoForward: false }
  ])
  const [activeTabId, setActiveTabId] = useState(1)
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const webviewRefs = useRef({})
  const nextTabId = useRef(2)
  const lastBrowserUrl = useRef(null)

  const activeTab = tabs.find(t => t.id === activeTabId)

  // Update URL input when tab changes
  useEffect(() => {
    if (activeTab) {
      setUrlInput(activeTab.url)
    }
  }, [activeTabId, activeTab])

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

  // Navigate to URL
  const navigateTo = useCallback((url) => {
    let finalUrl = url.trim()
    if (!finalUrl) return

    // Add protocol if missing (but preserve file:// URLs)
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('file://')) {
      // Check if it looks like a URL
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl
      } else {
        // Search query
        finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(finalUrl)}`
      }
    }

    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, url: finalUrl } : t
    ))
    setUrlInput(finalUrl)
  }, [activeTabId])

  // Navigate when browserUrl changes from server (skill invocation)
  useEffect(() => {
    if (browserUrl && browserUrl !== lastBrowserUrl.current) {
      lastBrowserUrl.current = browserUrl
      navigateTo(browserUrl)
    }
  }, [browserUrl, navigateTo])

  // Handle URL form submit
  const handleSubmit = (e) => {
    e.preventDefault()
    navigateTo(urlInput)
  }

  // Navigation controls
  const goBack = () => {
    const webview = webviewRefs.current[activeTabId]
    if (webview && webview.canGoBack()) {
      webview.goBack()
    }
  }

  const goForward = () => {
    const webview = webviewRefs.current[activeTabId]
    if (webview && webview.canGoForward()) {
      webview.goForward()
    }
  }

  const refresh = () => {
    const webview = webviewRefs.current[activeTabId]
    if (webview) {
      webview.reload()
    }
  }

  const goHome = () => {
    navigateTo('https://duckduckgo.com')
  }

  // Import Chrome's Google session
  const importChromeSession = async () => {
    if (isImporting) return

    setIsImporting(true)
    try {
      const result = await window.iris.importChromeCookies()

      if (result.success) {
        alert(`Imported ${result.imported} cookies from Chrome. Reloading...`)
        // Reload current tab to apply new cookies
        const webview = webviewRefs.current[activeTabId]
        if (webview) {
          webview.reload()
        }
      } else {
        alert(`Failed to import: ${result.error}`)
      }
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setIsImporting(false)
    }
  }

  // Add new tab
  const addTab = () => {
    const newTab = {
      id: nextTabId.current++,
      url: 'https://duckduckgo.com',
      title: 'New Tab',
      favicon: null,
      canGoBack: false,
      canGoForward: false
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  // Close tab
  const closeTab = (tabId) => {
    if (tabs.length === 1) {
      // Last tab - reset to home
      setTabs([{ id: 1, url: 'https://duckduckgo.com', title: 'DuckDuckGo', favicon: null, canGoBack: false, canGoForward: false }])
      setActiveTabId(1)
      return
    }

    const idx = tabs.findIndex(t => t.id === tabId)
    setTabs(prev => prev.filter(t => t.id !== tabId))

    if (tabId === activeTabId) {
      // Switch to adjacent tab
      const newIdx = Math.max(0, idx - 1)
      const remaining = tabs.filter(t => t.id !== tabId)
      setActiveTabId(remaining[newIdx]?.id || remaining[0]?.id)
    }
  }

  // Setup webview event listeners
  const setupWebview = useCallback((webview, tabId) => {
    if (!webview) return

    webviewRefs.current[tabId] = webview

    const handleTitleUpdate = (e) => {
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, title: e.title } : t
      ))
    }

    const handleNavigate = (e) => {
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, url: e.url } : t
      ))
      if (tabId === activeTabId) {
        setUrlInput(e.url)
      }
    }

    const handleFaviconUpdate = (e) => {
      if (e.favicons && e.favicons.length > 0) {
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, favicon: e.favicons[0] } : t
        ))
      }
    }

    const handleLoadStart = () => {
      if (tabId === activeTabId) {
        setIsLoading(true)
      }
    }

    const handleLoadStop = () => {
      if (tabId === activeTabId) {
        setIsLoading(false)
      }
      // Update navigation state
      setTabs(prev => prev.map(t =>
        t.id === tabId ? {
          ...t,
          canGoBack: webview.canGoBack(),
          canGoForward: webview.canGoForward()
        } : t
      ))
    }

    webview.addEventListener('page-title-updated', handleTitleUpdate)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('page-favicon-updated', handleFaviconUpdate)
    webview.addEventListener('did-start-loading', handleLoadStart)
    webview.addEventListener('did-stop-loading', handleLoadStop)

    return () => {
      webview.removeEventListener('page-title-updated', handleTitleUpdate)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('page-favicon-updated', handleFaviconUpdate)
      webview.removeEventListener('did-start-loading', handleLoadStart)
      webview.removeEventListener('did-stop-loading', handleLoadStop)
    }
  }, [activeTabId])

  // Check if URL is secure
  const isSecure = activeTab?.url?.startsWith('https://')

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden entity-content">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 pt-2 bg-black/30">
        {tabs.map(tab => (
          <BrowserTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => setActiveTabId(tab.id)}
            onClose={closeTab}
          />
        ))}
        <button
          onClick={addTab}
          className="p-1.5 hover:bg-white/10 rounded transition-colors"
          title="New tab"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3 h-3 text-text-tertiary" />
        </button>
      </div>

      {/* Navigation bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-black/40 border-b border-white/10">
        {/* Nav buttons */}
        <div className="flex items-center gap-1">
          <IconButton icon={faArrowLeft} onClick={goBack} disabled={!activeTab?.canGoBack} title="Back" />
          <IconButton icon={faArrowRight} onClick={goForward} disabled={!activeTab?.canGoForward} title="Forward" />
          <IconButton icon={faRotateRight} onClick={refresh} spinning={isLoading} title="Refresh" />
          <IconButton icon={faHome} onClick={goHome} title="Home" />
        </div>

        {/* URL bar */}
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg focus-within:border-accent/50 transition-colors">
            {isSecure && (
              <FontAwesomeIcon icon={faLock} className="w-3 h-3 text-green-500" />
            )}
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Search or enter URL"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </form>

        {/* Import Chrome session */}
        <IconButton
          icon={faChrome}
          onClick={importChromeSession}
          disabled={isImporting}
          title="Import session from Chrome"
        />
      </div>

      {/* Webview container */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {containerSize.width > 0 && containerSize.height > 0 && tabs.map(tab => (
          <webview
            key={tab.id}
            ref={(el) => el && setupWebview(el, tab.id)}
            src={tab.url}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${containerSize.width}px`,
              height: `${containerSize.height}px`,
              display: tab.id === activeTabId ? 'flex' : 'none'
            }}
            allowpopups="true"
          />
        ))}
      </div>
    </div>
  )
}
