// Header text/logo sit on a gradient that starts at the team's primaryColor, so
// whatever color we pick has to read against primaryColor specifically. Prefer
// the team's secondaryColor when it's legible there; otherwise fall back to
// whichever of black/white contrasts best, so every team's header stays readable.

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const r = channel(parseInt(h.substring(0, 2), 16))
  const g = channel(parseInt(h.substring(2, 4), 16))
  const b = channel(parseInt(h.substring(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function getHeaderAccent(primaryHex: string, secondaryHex: string): string {
  if (contrastRatio(primaryHex, secondaryHex) >= 2.5) return secondaryHex
  const whiteContrast = contrastRatio(primaryHex, '#FFFFFF')
  const blackContrast = contrastRatio(primaryHex, '#000000')
  return whiteContrast >= blackContrast ? '#FFFFFF' : '#000000'
}

// SVG feColorMatrix "matrix" values that recolor any opaque pixel to `hex`,
// preserving alpha — used to tint the (monochrome) app logo.
export function getLogoTintMatrix(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  return `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0`
}
