// Auto-generated from config/themes.yaml
// Do not edit directly - run: node scripts/generate-themes.js

export const THEMES = [
  {
    "id": "erebus",
    "label": "Erebus",
    "accent": "#6b4c9a",
    "terminal": {
      "bg-lightness": 6,
      "bg-saturation": 0.8,
      "fg-lightness": 70,
      "saturation": 0.25,
      "ansi-saturation": 0.6,
      "ansi-warmth": -10,
      "hue-blend": 0.2
    },
    "gods": {
      "zeus": "#b8a038",
      "apollo": "#c4a030",
      "artemis": "#4a7c74",
      "athena": "#5878a8",
      "hermes": "#b87830",
      "hades": "#7848a0",
      "poseidon": "#487888",
      "hera": "#a04878",
      "ares": "#a83838",
      "hephaestus": "#986040",
      "aphrodite": "#b85878",
      "dionysus": "#6838a0",
      "demeter": "#488048"
    }
  },
  {
    "id": "ichor",
    "label": "Ichor",
    "accent": "#d4a020",
    "terminal": {
      "bg-lightness": 7,
      "bg-saturation": 0.9,
      "fg-lightness": 88,
      "saturation": 0.4,
      "ansi-saturation": 1.1,
      "ansi-warmth": 15,
      "hue-blend": 0.25
    },
    "gods": {
      "zeus": "#ffd040",
      "apollo": "#ffb830",
      "artemis": "#40b090",
      "athena": "#50a0e0",
      "hermes": "#ff9020",
      "hades": "#a050d0",
      "poseidon": "#40b8d0",
      "hera": "#e050a0",
      "ares": "#e04040",
      "hephaestus": "#d08040",
      "aphrodite": "#ff70a0",
      "dionysus": "#9040e0",
      "demeter": "#50c050"
    }
  },
  {
    "id": "aether",
    "label": "Aether",
    "accent": "#4080b0",
    "terminal": {
      "bg-lightness": 6,
      "bg-saturation": 0.85,
      "fg-lightness": 84,
      "saturation": 0.35,
      "ansi-saturation": 0.9,
      "ansi-warmth": -20,
      "hue-blend": 0.2
    },
    "gods": {
      "zeus": "#c0a840",
      "apollo": "#d0b850",
      "artemis": "#30a898",
      "athena": "#4898d0",
      "hermes": "#d89030",
      "hades": "#8050b0",
      "poseidon": "#38c8e0",
      "hera": "#c04888",
      "ares": "#c83838",
      "hephaestus": "#a87048",
      "aphrodite": "#d86090",
      "dionysus": "#7040c0",
      "demeter": "#48a848"
    }
  },
  {
    "id": "morpheus",
    "label": "Morpheus",
    "accent": "#9060c0",
    "terminal": {
      "bg-lightness": 6,
      "bg-saturation": 0.9,
      "fg-lightness": 85,
      "saturation": 0.45,
      "ansi-saturation": 0.85,
      "ansi-warmth": 0,
      "hue-blend": 0.3,
      "hue-target": 280
    },
    "gods": {
      "zeus": "#e0c040",
      "apollo": "#f0d050",
      "artemis": "#40c0b0",
      "athena": "#6090e0",
      "hermes": "#f09830",
      "hades": "#a060e0",
      "poseidon": "#50c0e0",
      "hera": "#e060b0",
      "ares": "#e04848",
      "hephaestus": "#c08050",
      "aphrodite": "#f080b0",
      "dionysus": "#b050f0",
      "demeter": "#60c060"
    }
  },
  {
    "id": "adamant",
    "label": "Adamant",
    "accent": "#7080a0",
    "terminal": {
      "bg-lightness": 6,
      "bg-saturation": 0.5,
      "fg-lightness": 75,
      "saturation": 0.15,
      "ansi-saturation": 0.4,
      "ansi-warmth": -5,
      "hue-blend": 0.15
    },
    "gods": {
      "zeus": "#c0b090",
      "apollo": "#b8a880",
      "artemis": "#608880",
      "athena": "#7088a0",
      "hermes": "#a89070",
      "hades": "#706088",
      "poseidon": "#608898",
      "hera": "#987080",
      "ares": "#906060",
      "hephaestus": "#907868",
      "aphrodite": "#a07888",
      "dionysus": "#685880",
      "demeter": "#688068"
    }
  }
]

export const DEFAULT_THEME = 'erebus'

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
