// Theme system - hardcoded from pantheon.yaml and themes.yaml

// God colors from pantheon
export const GOD_COLORS = {
  zeus: '#FFCC00',
  ares: '#FF3366',
  artemis: '#00FF88',
  poseidon: '#0088FF',
  hermes: '#00DDFF',
  hera: '#FF44AA',
  hephaestus: '#FF6622',
  dionysus: '#AA44FF'
}

// Realms list
export const REALMS = [
  'Olympus', 'Elysium', 'Tartarus', 'Agora', 'Forge', 'Grove',
  'Styx', 'Temple', 'Acropolis', 'Nectar Hall', 'Labyrinth', 'Oracle'
]

// Theme definitions
export const THEMES = [
  { id: 'obsidian', label: 'Obsidian', accent: '#888888', terminal: { 'bg-lightness': 6, 'bg-saturation': 0, 'fg-lightness': 85, saturation: 0, 'ansi-saturation': 0.7, 'ansi-warmth': 0, 'hue-blend': 0 } },
  { id: 'charcoal', label: 'Charcoal', accent: '#a0a0a0', terminal: { 'bg-lightness': 8, 'bg-saturation': 0, 'fg-lightness': 82, saturation: 0, 'ansi-saturation': 0.75, 'ansi-warmth': 0, 'hue-blend': 0 } },
  { id: 'slate', label: 'Slate', accent: '#959595', terminal: { 'bg-lightness': 10, 'bg-saturation': 0, 'fg-lightness': 78, saturation: 0, 'ansi-saturation': 0.8, 'ansi-warmth': 0, 'hue-blend': 0 } },
  { id: 'graphite', label: 'Graphite', accent: '#8a8a8a', terminal: { 'bg-lightness': 12, 'bg-saturation': 0, 'fg-lightness': 75, saturation: 0, 'ansi-saturation': 0.8, 'ansi-warmth': 0, 'hue-blend': 0 } },
  { id: 'ash', label: 'Ash', accent: '#7a7a7a', terminal: { 'bg-lightness': 14, 'bg-saturation': 0, 'fg-lightness': 72, saturation: 0, 'ansi-saturation': 0.85, 'ansi-warmth': 0, 'hue-blend': 0 } }
]

export const DEFAULT_THEME = 'obsidian'

// Get terminal settings for a theme
export function getThemeTerminalSettings(themeId) {
  const theme = THEMES.find(t => t.id === themeId)
  return theme?.terminal || THEMES[0]?.terminal || {}
}

// Color utilities
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2

  let r, g, b
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function blendHue(baseHue, targetHue, amount) {
  let diff = targetHue - baseHue
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return baseHue + diff * amount
}

// Generate a full terminal palette from a god's primary color and theme settings
export function generatePalette(primaryHex, themeTerminal = {}) {
  const primary = hexToHsl(primaryHex)

  // Background settings
  const fgLightness = themeTerminal['fg-lightness'] ?? 88

  // ANSI modifiers
  const ansiSaturation = themeTerminal['ansi-saturation'] ?? 1.0
  const ansiWarmth = themeTerminal['ansi-warmth'] ?? 0
  const hueBlend = themeTerminal['hue-blend'] ?? 0.15
  const hueTarget = themeTerminal['hue-target'] ?? primary.h

  // Transparent background for xterm
  const bg = 'transparent'
  const fg = hslToHex(primary.h, Math.min(primary.s * 0.15, 10), fgLightness)

  const ansiBase = {
    black: { h: primary.h, s: 10, l: 12 },
    red: { h: 0, s: 65, l: 55 },
    green: { h: 120, s: 45, l: 50 },
    yellow: { h: 45, s: 60, l: 55 },
    blue: { h: 210, s: 50, l: 55 },
    magenta: { h: 300, s: 40, l: 55 },
    cyan: { h: 180, s: 45, l: 50 },
    white: { h: primary.h, s: 8, l: 78 },
  }

  const colors = {}
  for (const [name, base] of Object.entries(ansiBase)) {
    let h = base.h
    let s = base.s

    if (name !== 'black' && name !== 'white') {
      h = blendHue(base.h, hueTarget, hueBlend)
      h = h + ansiWarmth
      s = base.s * ansiSaturation
    }

    colors[name] = hslToHex(h, s, base.l)
  }

  const brightColors = {}
  for (const [name, base] of Object.entries(ansiBase)) {
    let h = base.h
    let s = base.s

    if (name !== 'black' && name !== 'white') {
      h = blendHue(base.h, hueTarget, hueBlend)
      h = h + ansiWarmth
      s = Math.min((base.s + 10) * ansiSaturation, 80)
    } else {
      s = Math.min(base.s + 10, 80)
    }

    const brightName = 'bright' + name.charAt(0).toUpperCase() + name.slice(1)
    brightColors[brightName] = hslToHex(h, s, base.l + 12)
  }

  return {
    background: bg,
    foreground: fg,
    cursor: primaryHex,
    cursorAccent: '#0a0a0a',
    selectionBackground: primaryHex + '44',
    selectionForeground: '#ffffff',
    ...colors,
    ...brightColors,
  }
}

// Get palette for a god with optional theme settings
export function getGodPalette(godName, themeTerminal = {}) {
  const color = GOD_COLORS[godName.toLowerCase()] || GOD_COLORS.zeus
  return generatePalette(color, themeTerminal)
}
