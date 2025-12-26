// Auto-generated from config/themes.yaml
// Do not edit directly - run: node scripts/generate-themes.js

export const THEMES = [
  {
    "id": "divine-void",
    "label": "Divine Void",
    "accent": "#c9a227",
    "terminal": {
      "bg-lightness": 5,
      "fg-lightness": 88,
      "saturation": 0.3
    },
    "gods": {
      "zeus": "#ffd700",
      "apollo": "#ffeb3b",
      "artemis": "#009688",
      "athena": "#2196f3",
      "hermes": "#ff9800",
      "hades": "#9c27b0",
      "poseidon": "#00bcd4",
      "hera": "#e91e63",
      "ares": "#f44336",
      "hephaestus": "#cd7f32",
      "aphrodite": "#ff6b9d",
      "dionysus": "#7c4dff",
      "demeter": "#4caf50"
    }
  },
  {
    "id": "olympus",
    "label": "Olympus",
    "accent": "#d4af37",
    "terminal": {
      "bg-lightness": 6,
      "fg-lightness": 90,
      "saturation": 0.35
    },
    "gods": {
      "zeus": "#ffc107",
      "apollo": "#ffab00",
      "artemis": "#26a69a",
      "athena": "#42a5f5",
      "hermes": "#ff6d00",
      "hades": "#6a1b9a",
      "poseidon": "#0097a7",
      "hera": "#ad1457",
      "ares": "#c62828",
      "hephaestus": "#d84315",
      "aphrodite": "#c2185b",
      "dionysus": "#6a1b9a",
      "demeter": "#2e7d32"
    }
  },
  {
    "id": "aether",
    "label": "Aether",
    "accent": "#7c4dff",
    "terminal": {
      "bg-lightness": 5,
      "fg-lightness": 88,
      "saturation": 0.4
    },
    "gods": {
      "zeus": "#e040fb",
      "apollo": "#ea80fc",
      "artemis": "#00e5ff",
      "athena": "#536dfe",
      "hermes": "#ff4081",
      "hades": "#7c4dff",
      "poseidon": "#40c4ff",
      "hera": "#f50057",
      "ares": "#ff1744",
      "hephaestus": "#b388ff",
      "aphrodite": "#ff80ab",
      "dionysus": "#d500f9",
      "demeter": "#69f0ae"
    }
  },
  {
    "id": "essence",
    "label": "Essence",
    "accent": "#888888",
    "terminal": {
      "bg-lightness": 6,
      "fg-lightness": 75,
      "saturation": 0.15
    },
    "gods": {
      "zeus": "#e0e0e0",
      "apollo": "#d0d0d0",
      "artemis": "#707070",
      "athena": "#909090",
      "hermes": "#b0b0b0",
      "hades": "#505050",
      "poseidon": "#808080",
      "hera": "#a0a0a0",
      "ares": "#606060",
      "hephaestus": "#858585",
      "aphrodite": "#c0c0c0",
      "dionysus": "#757575",
      "demeter": "#959595"
    }
  }
]

export const DEFAULT_THEME = 'divine-void'

// Get terminal settings for a theme
export function getThemeTerminalSettings(themeId) {
  const theme = THEMES.find(t => t.id === themeId)
  return theme?.terminal || THEMES[0]?.terminal || {}
}

// Get god colors for a theme
export function getThemeGodColors(themeId) {
  const theme = THEMES.find(t => t.id === themeId)
  return theme?.gods || THEMES[0]?.gods || {}
}
