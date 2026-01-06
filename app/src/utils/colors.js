/**
 * Convert hex color to RGB for CSS (comma-separated).
 * @param {string} hex - Hex color string (with or without #)
 * @returns {string} RGB values as "r, g, b" string
 */
export function hexToRgbCss(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '128, 128, 128'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}
