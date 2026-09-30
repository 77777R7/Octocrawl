/** The hero artwork's geometry and glyph kinds, shared by the glyph layer (heroGlyphs.ts), its night sky
 * (heroSky.ts), its sea of clouds (heroFog.ts) and the worker that finds the artwork's painted glyphs (heroGlyphsWorker.ts), with the small helpers
 * they share. Coordinates are the artwork's natural pixels. */

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

/** A stable pseudo-random value in [0, 1) for a pair of numbers. */
export const hash = (x: number, y: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** A random value in a [low, high] range: a rest between events, never quite the same twice. */
export const between = ([low, high]: readonly [number, number]): number => low + Math.random() * (high - low)

/** A small seeded generator, so procedural stars keep their places for a given hero size. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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

// The ridges of the blue ranges on the left, farthest to nearest (natural px), traced by hand from the artwork: fog
// pools in the valley above each one, in front of the range behind it (heroFog.ts traces each exactly from these).
export const RANGE_MID: ReadonlyArray<readonly [number, number]> = [
  [0, 742], [40, 735], [70, 734], [100, 723], [130, 711], [160, 702], [190, 693], [220, 696], [250, 704], [280, 712],
  [310, 719], [340, 722], [370, 734], [400, 735], [430, 738], [460, 743], [490, 750], [520, 758], [550, 751],
  [580, 743], [610, 727], [640, 736], [670, 746], [700, 755], [730, 761], [760, 765], [790, 772], [820, 781], [850, 784],
]
export const RANGE_NEAR: ReadonlyArray<readonly [number, number]> = [
  [0, 776], [40, 786], [70, 786], [100, 791], [130, 800], [160, 800], [190, 810], [220, 819], [250, 824], [280, 820],
  [310, 808], [340, 802], [370, 791], [400, 782], [430, 785], [460, 782], [490, 780],
]
export const RANGE_FORE: ReadonlyArray<readonly [number, number]> = [
  [260, 828], [300, 832], [340, 845], [370, 857], [400, 867], [430, 873], [460, 882], [490, 889], [520, 886],
  [550, 876], [580, 866], [610, 861], [640, 846], [670, 834], [700, 829], [730, 820], [760, 808],
]

/** A polyline's height at x, or NaN beyond its ends. */
export function lineAt(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x < points[0][0] || x > points[points.length - 1][0]) return NaN
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]
    if (x > x1) continue
    const [x0, y0] = points[i - 1]
    return y0 + (y1 - y0) * ((x - x0) / Math.max(1, x1 - x0))
  }
  return points[points.length - 1][1]
}

/** Smooth value noise in [0, 1] on an integer lattice. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi))
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi))
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
