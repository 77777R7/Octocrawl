/** The hero artwork's geometry and glyph kinds, shared by the glyph layer (heroGlyphs.ts) and the worker that
 * finds the artwork's painted glyphs (heroGlyphsWorker.ts). Coordinates are the artwork's natural pixels. */

export const ART = '/assets/mountain-hero.webp'
// The ridge of the mountain in the lower right, traced from the artwork: glyphs below it are mountain, above it
// sunset sky.
export const RIDGE: ReadonlyArray<readonly [number, number]> = [
  [560, 745], [640, 734], [700, 740], [752, 722], [768, 698], [848, 676], [880, 672], [928, 652], [976, 626],
  [1024, 592], [1056, 566], [1110, 548], [1168, 570], [1204, 578], [1264, 552], [1312, 532], [1360, 500],
  [1424, 476], [1475, 456], [1520, 484], [1568, 505], [1600, 500], [1672, 527],
]
// The mountain's light rises from the foot of the artwork to the summit.
export const BASE = 941
export const SUMMIT = [1475, 456] as const

// The mountain's sunlit faces, its embers and its blue dots; the sunset clouds; the night sky and the ranges.
export const FACE = 0
export const EMBER = 1
export const COOL = 2
export const CLOUD = 3
export const NIGHT = 4

export const smooth = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

function ridgeAt(x: number): number {
  for (let i = 1; i < RIDGE.length; i++) {
    const [x1, y1] = RIDGE[i]
    if (x > x1) continue
    const [x0, y0] = RIDGE[i - 1]
    return y0 + (y1 - y0) * Math.max(0, (x - x0) / (x1 - x0))
  }
  return RIDGE[RIDGE.length - 1][1]
}

/** How much a point belongs to the mountain: below the ridge, fading in from the left. */
export function onMountain(x: number, y: number): number {
  const ridge = ridgeAt(x)
  return smooth(ridge - 2, ridge + 14, y) * smooth(600, 820, x)
}

/** A computed background-position component (its first layer's) as an offset in px: a percentage, a length or a
 * calc() of both. Anything else centres the artwork, as the browser would. */
export function position(value: string | undefined, free: number): number {
  let offset = 0
  let terms = 0
  for (const [, sign, number, unit] of (value ?? '').split(',')[0].matchAll(/([+-]?)\s*(\d*\.?\d+)(%|px)/g)) {
    const amount = Number(number) * (sign === '-' ? -1 : 1)
    offset += unit === '%' ? (free * amount) / 100 : amount
    terms++
  }
  return terms && Number.isFinite(offset) ? offset : free / 2
}
