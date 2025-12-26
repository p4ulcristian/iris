import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

// God colors
const GOD_COLORS = {
  zeus: '#ffd700',
  apollo: '#ffeb3b',
  artemis: '#009688',
  athena: '#2196f3',
  hermes: '#ff9800',
  hades: '#9c27b0',
  poseidon: '#00bcd4',
  hera: '#e91e63',
  ares: '#f44336',
  hephaestus: '#cd7f32',
  aphrodite: '#ff6b9d',
  dionysus: '#7c4dff',
  demeter: '#4caf50'
}

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
    express: false
  },
  servicesLoading: {
    speak: false,
    hear: false,
    express: false
  },

  // UI state
  focusedGod: null,
  fullscreenGod: null,
  layoutMode: 'auto',
  devPanelOpen: false,

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
          color: god.color || GOD_COLORS[godKey] || '#888',
          voice: god.voice || godKey,
          status: god.status || 'laboring',
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

      // Get gods for active tab
      getActiveGods: () => {
        const state = get()
        return Object.values(state.gods).filter(g => g.tabId === state.activeTabId)
      },

      // Get gods for a specific tab
      getGodsForTab: (tabId) => {
        const state = get()
        return Object.values(state.gods).filter(g => g.tabId === tabId)
      },

      // Get all god names (for checking availability)
      getAllGodNames: () => {
        return Object.keys(get().gods)
      },
    })),
    { name: 'iris-store' }
  )
)

// Export GOD_COLORS for use elsewhere
export { GOD_COLORS }
