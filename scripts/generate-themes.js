#!/usr/bin/env node
/**
 * Generate terminal palettes and CSS from gods.yaml
 *
 * Usage: node scripts/generate-themes.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Simple YAML parser for our flat structure
function parseGodsYaml(content) {
  const gods = {}
  let currentGod = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Top-level god name (no indentation)
    if (!line.startsWith(' ') && trimmed.endsWith(':')) {
      currentGod = trimmed.slice(0, -1)
      gods[currentGod] = {}
    }
    // Property (indented)
    else if (currentGod && line.startsWith('  ')) {
      // Match quoted or unquoted values
      const quotedMatch = trimmed.match(/^(\w+):\s*"([^"]+)"/)
      const unquotedMatch = trimmed.match(/^(\w+):\s*([^#\s]+)/)
      const match = quotedMatch || unquotedMatch
      if (match) {
        gods[currentGod][match[1]] = match[2].trim()
      }
    }
  }

  return gods
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
  // Blend hue toward target, handling wrap-around
  let diff = targetHue - baseHue
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return baseHue + diff * amount
}

// Generate a full terminal palette from a primary color
function generatePalette(primaryHex) {
  const primary = hexToHsl(primaryHex)

  // Background: very dark, tinted toward primary
  const bg = hslToHex(primary.h, Math.min(primary.s * 0.3, 15), 6)

  // Foreground: light, slightly tinted
  const fg = hslToHex(primary.h, Math.min(primary.s * 0.15, 10), 88)

  // Base ANSI hues
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

  // Generate colors, blending hue toward primary
  const hueBlend = 0.15  // How much to shift toward primary hue

  const colors = {}
  for (const [name, base] of Object.entries(ansiBase)) {
    const h = name === 'black' || name === 'white'
      ? base.h
      : blendHue(base.h, primary.h, hueBlend)
    colors[name] = hslToHex(h, base.s, base.l)
  }

  // Bright variants: lighter, slightly more saturated
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

// Main
const yamlPath = join(ROOT, 'config', 'gods.yaml')
const yamlContent = readFileSync(yamlPath, 'utf8')
const gods = parseGodsYaml(yamlContent)

// Generate palettes
const palettes = {}
for (const [name, config] of Object.entries(gods)) {
  palettes[name] = generatePalette(config.color)
}

// Output directory
const outDir = join(ROOT, 'app', 'src', 'themes', 'generated')
mkdirSync(outDir, { recursive: true })

// Write palettes.js
const palettesJs = `// Auto-generated from config/gods.yaml
// Do not edit directly - run: node scripts/generate-themes.js

export const GOD_PALETTES = ${JSON.stringify(palettes, null, 2)}

export function getGodPalette(godName) {
  return GOD_PALETTES[godName.toLowerCase()] || GOD_PALETTES.zeus
}
`
writeFileSync(join(outDir, 'palettes.js'), palettesJs)

// Write colors.css
let colorsCss = `/* Auto-generated from config/gods.yaml */
/* Do not edit directly - run: node scripts/generate-themes.js */

@theme {
`
for (const [name, config] of Object.entries(gods)) {
  colorsCss += `  --color-god-${name}: ${config.color};\n`
}
colorsCss += `}\n`

writeFileSync(join(outDir, 'colors.css'), colorsCss)

console.log(`Generated themes for ${Object.keys(gods).length} gods`)
console.log(`  → ${join(outDir, 'palettes.js')}`)
console.log(`  → ${join(outDir, 'colors.css')}`)
