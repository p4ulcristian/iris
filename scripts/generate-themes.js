#!/usr/bin/env node
/**
 * Generate terminal palettes and CSS from gods.yaml and themes.yaml
 *
 * Usage: node scripts/generate-themes.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Simple YAML parser for flat structure (pantheon.yaml)
// Only parses god entries (those with voice and color properties)
function parseGodsYaml(content) {
  const gods = {}
  let currentGod = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (!line.startsWith(' ') && trimmed.endsWith(':')) {
      currentGod = trimmed.slice(0, -1)
      gods[currentGod] = {}
    } else if (currentGod && line.startsWith('  ')) {
      const quotedMatch = trimmed.match(/^(\w+):\s*"([^"]+)"/)
      const unquotedMatch = trimmed.match(/^(\w+):\s*([^#\s]+)/)
      const match = quotedMatch || unquotedMatch
      if (match) {
        gods[currentGod][match[1]] = match[2].trim()
      }
    }
  }

  // Filter to only include entries with both voice and color (gods, not realms)
  const validGods = {}
  for (const [name, config] of Object.entries(gods)) {
    if (config.voice && config.color) {
      validGods[name] = config
    }
  }

  return validGods
}

// YAML parser for nested structure (themes.yaml)
function parseThemesYaml(content) {
  const themes = {}
  let currentTheme = null
  let currentSection = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Count leading spaces
    const indent = line.search(/\S/)

    // Top-level theme name (no indentation)
    if (indent === 0 && trimmed.endsWith(':')) {
      currentTheme = trimmed.slice(0, -1)
      themes[currentTheme] = { colors: {}, terminal: {} }
      currentSection = null
    }
    // Section (2 spaces): colors, terminal, label, gods
    else if (indent === 2 && currentTheme) {
      const match = trimmed.match(/^(\w+):\s*(.*)/)
      if (match) {
        const key = match[1]
        const value = match[2].replace(/^"(.*)"$/, '$1').trim()
        if (value) {
          // Direct value like label: "Divine Void"
          themes[currentTheme][key] = value
          currentSection = null
        } else {
          // Section start like colors: or gods:
          currentSection = key
          if (key === 'gods') {
            themes[currentTheme].gods = {}
          }
        }
      }
    }
    // Properties (4 spaces)
    else if (indent === 4 && currentTheme && currentSection) {
      const match = trimmed.match(/^([\w-]+):\s*(.+)/)
      if (match) {
        let value = match[2].replace(/^"(.*)"$/, '$1').trim()
        // Parse numbers
        if (!isNaN(value)) {
          value = parseFloat(value)
        }
        themes[currentTheme][currentSection][match[1]] = value
      }
    }
  }

  return themes
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

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function blendHue(baseHue, targetHue, amount) {
  let diff = targetHue - baseHue
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return baseHue + diff * amount
}

// Generate a full terminal palette from a primary color and theme settings
function generatePalette(primaryHex, themeTerminal = {}) {
  const primary = hexToHsl(primaryHex)

  // Background settings
  const bgLightness = themeTerminal['bg-lightness'] ?? 6
  const bgSaturation = themeTerminal['bg-saturation'] ?? 0.3
  const bgOpacity = themeTerminal['bg-opacity'] ?? 0.85
  const fgLightness = themeTerminal['fg-lightness'] ?? 88

  // ANSI modifiers
  const ansiSaturation = themeTerminal['ansi-saturation'] ?? 1.0
  const ansiWarmth = themeTerminal['ansi-warmth'] ?? 0
  const hueBlend = themeTerminal['hue-blend'] ?? 0.15
  const hueTarget = themeTerminal['hue-target'] ?? primary.h

  // Background with stronger god tint (rgba for transparency)
  const bgHex = hslToHex(primary.h, Math.min(primary.s * bgSaturation, 45), bgLightness)
  const bg = hexToRgba(bgHex, bgOpacity)
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
      // Blend toward god's hue (or theme's hue target)
      h = blendHue(base.h, hueTarget, hueBlend)
      // Apply warmth shift
      h = h + ansiWarmth
      // Apply saturation modifier
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
    cursorAccent: bg,
    selectionBackground: primaryHex + '44',
    selectionForeground: '#ffffff',
    ...colors,
    ...brightColors,
  }
}

// ============ MAIN ============

// Read config files (prompts/pantheon.yaml is the single source of truth for gods)
const godsYaml = readFileSync(join(ROOT, 'prompts', 'pantheon.yaml'), 'utf8')
const themesYaml = readFileSync(join(ROOT, 'config', 'themes.yaml'), 'utf8')

const gods = parseGodsYaml(godsYaml)
const themes = parseThemesYaml(themesYaml)

// Output directory
const outDir = join(ROOT, 'app', 'src', 'themes', 'generated')
mkdirSync(outDir, { recursive: true })

// ============ GOD PALETTES ============
// Export god colors for runtime palette generation
const godColors = {}
for (const [name, config] of Object.entries(gods)) {
  godColors[name] = config.color
}

const palettesJs = `// Auto-generated from prompts/pantheon.yaml
// Do not edit directly - run: node scripts/generate-themes.js

// God primary colors
export const GOD_COLORS = ${JSON.stringify(godColors, null, 2)}

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
  return \`#\${toHex(r)}\${toHex(g)}\${toHex(b)}\`
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`
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
  const bgLightness = themeTerminal['bg-lightness'] ?? 6
  const bgSaturation = themeTerminal['bg-saturation'] ?? 0.3
  const bgOpacity = themeTerminal['bg-opacity'] ?? 0.85
  const fgLightness = themeTerminal['fg-lightness'] ?? 88

  // ANSI modifiers
  const ansiSaturation = themeTerminal['ansi-saturation'] ?? 1.0
  const ansiWarmth = themeTerminal['ansi-warmth'] ?? 0
  const hueBlend = themeTerminal['hue-blend'] ?? 0.15
  const hueTarget = themeTerminal['hue-target'] ?? primary.h

  // Background with stronger god tint (rgba for transparency)
  const bgHex = hslToHex(primary.h, Math.min(primary.s * bgSaturation, 45), bgLightness)
  const bg = hexToRgba(bgHex, bgOpacity)
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
`
writeFileSync(join(outDir, 'palettes.js'), palettesJs)

// ============ GOD COLORS CSS ============
let colorsCss = `/* Auto-generated from prompts/pantheon.yaml */
/* Do not edit directly - run: node scripts/generate-themes.js */

@theme {
`
for (const [name, config] of Object.entries(gods)) {
  colorsCss += `  --color-god-${name}: ${config.color};\n`
}
colorsCss += `}\n`
writeFileSync(join(outDir, 'colors.css'), colorsCss)

// ============ THEMES CSS ============
let themesCss = `/* Auto-generated from config/themes.yaml */
/* Do not edit directly - run: node scripts/generate-themes.js */

`

// First theme is the default (applied to :root)
const themeEntries = Object.entries(themes)
const [defaultThemeName, defaultThemeConfig] = themeEntries[0]

themesCss += `:root,\n.theme-${defaultThemeName} {\n`
for (const [key, value] of Object.entries(defaultThemeConfig.colors)) {
  themesCss += `  --color-${key}: ${value};\n`
}
themesCss += `}\n\n`

// Other themes
for (let i = 1; i < themeEntries.length; i++) {
  const [themeName, themeConfig] = themeEntries[i]
  themesCss += `.theme-${themeName} {\n`
  for (const [key, value] of Object.entries(themeConfig.colors)) {
    themesCss += `  --color-${key}: ${value};\n`
  }
  themesCss += `}\n\n`
}

writeFileSync(join(outDir, 'themes.css'), themesCss)

// ============ THEMES JS ============
const themesJs = `// Auto-generated from config/themes.yaml
// Do not edit directly - run: node scripts/generate-themes.js

export const THEMES = ${JSON.stringify(
  Object.entries(themes).map(([id, config]) => ({
    id,
    label: config.label || id,
    accent: config.colors.accent,
    terminal: config.terminal || {},
    gods: config.gods || {}
  })),
  null,
  2
)}

export const DEFAULT_THEME = '${defaultThemeName}'

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
`
writeFileSync(join(outDir, 'themes.js'), themesJs)

// ============ DONE ============
console.log(`Generated:`)
console.log(`  Gods: ${Object.keys(gods).length}`)
console.log(`  Themes: ${Object.keys(themes).length}`)
console.log(`  → ${join(outDir, 'palettes.js')}`)
console.log(`  → ${join(outDir, 'colors.css')}`)
console.log(`  → ${join(outDir, 'themes.css')}`)
console.log(`  → ${join(outDir, 'themes.js')}`)
