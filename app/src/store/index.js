import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

// Initial state
const initialState = {
  // Tabs
  tabs: [{ id: 1, name: 'Main' }],
  activeTabId: 1,
  tabCounter: 1,

  // Gods - stored globally, with tabId reference
  gods: {},  // { [godName]: { name, color, status, tabId } }

  // Services status
  services: {
    speak: false,
    hear: false,
    express: false,
    wake: false
  },
  servicesLoading: {
    speak: false,
    hear: false,
    express: false,
    wake: false
  },

  // UI state (client-only)
  focusedGod: null,
  fullscreenGod: null,
  layoutMode: 'auto',
  viewMode: 'focus',  // 'grid' | 'focus' - controls main layout style
  devPanelOpen: false,

  // Synced from server
  theme: 'divine-void',  // Will be overwritten by state:sync
  godColors: {},  // { godName: color } - from server based on current theme

  // Connection
  connected: false,
  initialLoadDone: false,
}

// Store
export const useStore = create(
  devtools(
    immer((set, get) => ({
      ...initialState,

      // ============ TABS ============

      createTab: (name) => set((state) => {
        state.tabCounter++
        const newId = state.tabCounter
        const tabName = (typeof name === 'string' && name) ? name : `Tab ${newId}`
        state.tabs.push({ id: newId, name: tabName })
        state.activeTabId = newId
        state.focusedGod = null
        state.fullscreenGod = null
      }),

      closeTab: (tabId) => set((state) => {
        // Get gods in this tab and remove them
        Object.keys(state.gods).forEach(godName => {
          if (state.gods[godName].tabId === tabId) {
            delete state.gods[godName]
          }
        })

        // Remove tab
        state.tabs = state.tabs.filter(t => t.id !== tabId)

        // If no tabs left, create a fresh Main tab
        if (state.tabs.length === 0) {
          state.tabCounter = 1
          state.tabs = [{ id: 1, name: 'Main' }]
          state.activeTabId = 1
        } else if (tabId === state.activeTabId) {
          // Switch to first remaining tab
          state.activeTabId = state.tabs[0].id
        }

        state.focusedGod = null
        state.fullscreenGod = null
      }),

      renameTab: (tabId, name) => set((state) => {
        const tab = state.tabs.find(t => t.id === tabId)
        if (tab) tab.name = name
      }),

      switchTab: (tabId) => set((state) => {
        state.activeTabId = tabId
        state.focusedGod = null
        state.fullscreenGod = null
      }),

      nextTab: () => set((state) => {
        const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
        const nextIdx = (idx + 1) % state.tabs.length
        state.activeTabId = state.tabs[nextIdx].id
      }),

      prevTab: () => set((state) => {
        const idx = state.tabs.findIndex(t => t.id === state.activeTabId)
        const prevIdx = (idx - 1 + state.tabs.length) % state.tabs.length
        state.activeTabId = state.tabs[prevIdx].id
      }),

      goToTab: (num) => set((state) => {
        if (num >= 1 && num <= state.tabs.length) {
          state.activeTabId = state.tabs[num - 1].id
        }
      }),

      // ============ GODS ============

      addGod: (god) => set((state) => {
        const name = god.name
        // Don't add if already exists
        if (state.gods[name]) return

        const godKey = name.toLowerCase()
        state.gods[name] = {
          name,
          color: god.color || '#888',
          voice: god.voice || godKey,
          status: god.status || 'working',
          tabId: state.activeTabId,  // Assign to current tab
        }
        state.focusedGod = name
      }),

      removeGod: (godName) => set((state) => {
        const wasFullscreen = state.fullscreenGod === godName
        const wasFocused = state.focusedGod === godName
        const tabId = state.gods[godName]?.tabId

        delete state.gods[godName]

        if (wasFullscreen) state.fullscreenGod = null
        if (wasFocused) {
          // Auto-select another god from the same tab
          const remainingGods = Object.values(state.gods).filter(g => g.tabId === tabId)
          state.focusedGod = remainingGods.length > 0 ? remainingGods[0].name : null
          // Exit focus mode if the focused god was removed and no replacement
          if (!state.focusedGod) state.viewMode = 'grid'
        }
      }),

      updateGodStatus: (godName, status) => set((state) => {
        if (state.gods[godName]) {
          state.gods[godName].status = status
        }
      }),

      moveGodToTab: (godName, tabId) => set((state) => {
        if (state.gods[godName]) {
          state.gods[godName].tabId = tabId
        }
      }),

      // ============ UI ============

      setFocusedGod: (godName) => set((state) => {
        state.focusedGod = godName
      }),

      toggleFullscreen: (godName) => set((state) => {
        const target = godName || state.focusedGod
        if (!target) return
        state.fullscreenGod = state.fullscreenGod === target ? null : target
      }),

      setLayoutMode: (mode) => set((state) => {
        state.layoutMode = mode
      }),

      rotateLayout: () => set((state) => {
        const layouts = ['auto', '1x1', '2x1', '2x2', '3x2', '3x3']
        const idx = layouts.indexOf(state.layoutMode)
        state.layoutMode = layouts[(idx + 1) % layouts.length]
      }),

      toggleDevPanel: () => set((state) => {
        state.devPanelOpen = !state.devPanelOpen
      }),

      setViewMode: (mode) => set((state) => {
        state.viewMode = mode
      }),

      enterFocusMode: (godName) => set((state) => {
        state.viewMode = 'focus'
        state.focusedGod = godName
      }),

      exitFocusMode: () => set((state) => {
        state.viewMode = 'grid'
      }),

      // ============ CONNECTION ============

      setConnected: (connected) => set((state) => {
        state.connected = connected
      }),

      setInitialLoadDone: (done) => set((state) => {
        state.initialLoadDone = done
      }),

      setServices: (services) => set((state) => {
        state.services = { ...state.services, ...services }
        // Clear loading state when service status changes
        Object.keys(services).forEach(key => {
          state.servicesLoading[key] = false
        })
      }),

      setServiceLoading: (service, loading) => set((state) => {
        state.servicesLoading[service] = loading
      }),

      // ============ SELECTORS (computed) ============

      // Get active tab
      getActiveTab: () => {
        const state = get()
        return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0]
      },

      // Get gods for active tab (sorted by order)
      getActiveGods: () => {
        const state = get()
        return Object.values(state.gods)
          .filter(g => g.tabId === state.activeTabId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get gods for a specific tab (sorted by order)
      getGodsForTab: (tabId) => {
        const state = get()
        return Object.values(state.gods)
          .filter(g => g.tabId === tabId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // Get all god names (for checking availability)
      getAllGodNames: () => {
        return Object.keys(get().gods)
      },

      // Get ALL gods across all tabs (for persistent rendering)
      getAllGods: () => {
        const state = get()
        return Object.values(state.gods)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
      },

      // ============ SYNC FROM SERVER ============

      syncState: (serverState) => set((state) => {
        // Replace tabs
        state.tabs = serverState.tabs
        state.activeTabId = serverState.activeTabId
        state.tabCounter = serverState.tabCounter

        // Replace gods - merge with server data
        const newGods = {}
        serverState.gods.forEach(god => {
          newGods[god.name] = {
            name: god.name,
            displayName: god.displayName || null,
            color: god.color,
            voice: god.voice,
            status: god.status || 'working',
            mission: god.mission || null,
            readyState: god.readyState || 'working',
            tabId: god.tabId,
            order: god.order,
            spawnedAt: god.spawnedAt || null
          }
        })
        state.gods = newGods

        // Sync theme and godColors
        if (serverState.theme) {
          state.theme = serverState.theme
        }
        if (serverState.godColors) {
          state.godColors = serverState.godColors
        }

        // Sync viewMode and focusedGod from server
        if (serverState.viewMode !== undefined) {
          state.viewMode = serverState.viewMode
        }
        if (serverState.focusedGod !== undefined) {
          state.focusedGod = serverState.focusedGod
        }

        // Clear fullscreen if god no longer exists (fullscreen is still client-only)
        if (state.fullscreenGod && !newGods[state.fullscreenGod]) {
          state.fullscreenGod = null
        }
      }),
    })),
    { name: 'iris-store' }
  )
)
