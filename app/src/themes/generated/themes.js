// Auto-generated from config/themes.yaml
// Do not edit directly - run: node scripts/generate-themes.js

export const THEMES = [
  {
    "id": "obsidian",
    "label": "Obsidian",
    "accent": "#888888",
    "terminal": {
      "bg-lightness": 6,
      "bg-saturation": 0,
      "fg-lightness": 85,
      "saturation": 0,
      "ansi-saturation": 0.7,
      "ansi-warmth": 0,
      "hue-blend": 0
    }
  },
  {
    "id": "charcoal",
    "label": "Charcoal",
    "accent": "#a0a0a0",
    "terminal": {
      "bg-lightness": 8,
      "bg-saturation": 0,
      "fg-lightness": 82,
      "saturation": 0,
      "ansi-saturation": 0.75,
      "ansi-warmth": 0,
      "hue-blend": 0
    }
  },
  {
    "id": "slate",
    "label": "Slate",
    "accent": "#959595",
    "terminal": {
      "bg-lightness": 10,
      "bg-saturation": 0,
      "fg-lightness": 78,
      "saturation": 0,
      "ansi-saturation": 0.8,
      "ansi-warmth": 0,
      "hue-blend": 0
    }
  },
  {
    "id": "graphite",
    "label": "Graphite",
    "accent": "#8a8a8a",
    "terminal": {
      "bg-lightness": 12,
      "bg-saturation": 0,
      "fg-lightness": 75,
      "saturation": 0,
      "ansi-saturation": 0.8,
      "ansi-warmth": 0,
      "hue-blend": 0
    }
  },
  {
    "id": "ash",
    "label": "Ash",
    "accent": "#7a7a7a",
    "terminal": {
      "bg-lightness": 14,
      "bg-saturation": 0,
      "fg-lightness": 72,
      "saturation": 0,
      "ansi-saturation": 0.85,
      "ansi-warmth": 0,
      "hue-blend": 0
    }
  }
]

export const DEFAULT_THEME = 'obsidian'

// Get terminal settings for a theme
export function getThemeTerminalSettings(themeId) {
  const theme = THEMES.find(t => t.id === themeId)
  return theme?.terminal || THEMES[0]?.terminal || {}
}

