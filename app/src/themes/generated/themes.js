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
    }
  }
]

export const DEFAULT_THEME = 'divine-void'

// Get terminal settings for a theme
export function getThemeTerminalSettings(themeId) {
  const theme = THEMES.find(t => t.id === themeId)
  return theme?.terminal || THEMES[0]?.terminal || {}
}
