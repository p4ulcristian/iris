// Auto-generated from config/gods.yaml
// Do not edit directly - run: node scripts/generate-themes.js

// God primary colors
export const GOD_COLORS = {
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

// Color utilities for runtime palette generation
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

  const bgLightness = themeTerminal['bg-lightness'] ?? 6
  const fgLightness = themeTerminal['fg-lightness'] ?? 88
  const satFactor = themeTerminal['saturation'] ?? 0.3

  const bg = hslToHex(primary.h, Math.min(primary.s * satFactor, 15), bgLightness)
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

  const hueBlend = 0.15

  const colors = {}
  for (const [name, base] of Object.entries(ansiBase)) {
    const h = name === 'black' || name === 'white'
      ? base.h
      : blendHue(base.h, primary.h, hueBlend)
    colors[name] = hslToHex(h, base.s, base.l)
  }

  const brightColors = {}
  for (const [name, base] of Object.entries(ansiBase)) {
    const h = name === 'black' || name === 'white'
      ? base.h
      : blendHue(base.h, primary.h, hueBlend)
    const brightName = 'bright' + name.charAt(0).toUpperCase() + name.slice(1)
    brightColors[brightName] = hslToHex(h, Math.min(base.s + 10, 80), base.l + 12)
  }

  return {
    background: bg,
    foreground: fg,
    cursor: primaryHex,
    cursorAccent: bg,
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

// Get theme-adjusted god color for headers/borders
export function getGodColor(godName, themeTerminal = {}) {
  const baseColor = GOD_COLORS[godName.toLowerCase()] || GOD_COLORS.zeus
  const hsl = hexToHsl(baseColor)

  // Apply theme saturation factor (default 1.0 = no change for UI elements)
  const satFactor = themeTerminal['ui-saturation'] ?? themeTerminal['saturation'] ?? 1.0
  // Normalize: terminal saturation is 0.3-0.4, UI should be higher
  const adjustedSat = satFactor < 1 ? hsl.s * Math.min(satFactor * 2.5, 1) : hsl.s * satFactor

  return hslToHex(hsl.h, adjustedSat, hsl.l)
}
