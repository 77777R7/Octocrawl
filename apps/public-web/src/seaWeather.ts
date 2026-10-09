/* The Get started cloud's weather (glyphRipple.ts), kept pure so it can be tested. The cloud breathes as before, and
 * slowly, one at a time, the water around it changes: a current runs across it, light from the surface plays on its
 * top rows, then it is calm again. A few flakes of marine snow fall through it. Now and then one row of it is read: a
 * scan runs along it, re-typing its marks, and they settle back behind it, which is what a crawl does to a page. And
 * the octopus leaves a wake in it as it swims. Every effect only lifts the marks the cloud already has, or adds a
 * faint one where the cloud is; the clear centre round the heading stays clear, and nothing moves off its cell. */

export const WEATHER = {
  /** One round of the weather, in seconds, and the windows of it that a current and the surface light take. */
  cycle: 120,
  current: [6, 46] as const,
  glints: [66, 106] as const,
  /** How long a state takes to come and go. */
  fade: 4,
  /** Marine snow: at most this many flakes, falling this many rows a second. */
  flakes: 5,
  fall: 0.7,
  /** A scan runs along its row at this many columns a second, re-typing a trail this long behind it. */
  scanSpeed: 38,
  scanTrail: 20,
  /** A wake reaches this many cells round the octopus and fades over this long. */
  wakeReach: 3,
  wakeMs: 1400,
} as const

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const smooth = (a: number, b: number, n: number) => { const t = clamp01((n - a) / (b - a)); return t * t * (3 - 2 * t) }
const fract = (n: number) => n - Math.floor(n)
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453)
const phase = (t: number) => ((t % WEATHER.cycle) + WEATHER.cycle) % WEATHER.cycle
const windowed = ([a, b]: readonly [number, number], c: number) => smooth(a, a + WEATHER.fade, c) * (1 - smooth(b - WEATHER.fade, b, c))

/** How much of each state the water is in at `t` seconds: 0 to 1 each, never both at once. */
export function weatherMix(t: number): { current: number, glints: number } {
  const c = phase(t)
  return { current: windowed(WEATHER.current, c), glints: windowed(WEATHER.glints, c) }
}

/** The current at a cell (x, y in 0–1 across the cloud) at `t`: a soft diagonal band that crosses the cloud once in
 * its window, 0 to 1. */
export function currentAt(x: number, y: number, t: number): number {
  const [a, b] = WEATHER.current
  const s = (phase(t) - a) / (b - a) * 1.7 - 0.35
  const u = x * 0.78 + y * 0.32
  return Math.exp(-(((u - s) / 0.09) ** 2))
}

/** Light from the surface on a cell (column and row, `rows` in all) at `t`: patches that drift across the top third
 * only, 0 to 1. */
export function glintAt(col: number, row: number, rows: number, t: number): number {
  const depth = row / rows
  if (depth > 0.36) return 0
  const g = Math.sin(col * 0.31 + t * 0.55 + Math.sin(row * 0.9)) * Math.sin(col * 0.11 - t * 0.37 + row * 0.45)
  return clamp01((g - 0.55) / 0.45) * (1 - smooth(0.2, 0.36, depth))
}

/** Where the flakes of marine snow are at `t`: up to WEATHER.flakes cells, each falling one column top to bottom and
 * starting again in a new one. */
export function snowCells(t: number, cols: number, rows: number, seed: number): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  const span = rows / WEATHER.fall
  for (let k = 0; k < WEATHER.flakes; k++) {
    const p = t / span + k / WEATHER.flakes
    const round = Math.floor(p)
    cells.push([Math.floor(hash(k + seed, round) * cols), Math.floor(fract(p) * rows)])
  }
  return cells
}

/** What a scan, `age` seconds along its row, does to the cell in column `col`: null if it has not reached it or has
 * passed and left it settled; otherwise how much to lift it (0 to 1), which mark to flicker through (1 to 4, an index
 * into the cloud's glyphs) and how warm it is (the scan's head is the warmest). */
export function scanCell(col: number, age: number): { lift: number, level: number, warm: number } | null {
  const head = age * WEATHER.scanSpeed
  const behind = head - col
  if (behind < 0 || behind > WEATHER.scanTrail) return null
  const f = 1 - behind / WEATHER.scanTrail
  return { lift: 0.6 + 0.8 * f, level: 1 + ((col * 7 + Math.floor(age * 18)) % 4), warm: behind < 2 ? 1 : 0.6 * f }
}

/** How long a scan takes to cross `cols` columns, in seconds. */
export const scanSeconds = (cols: number) => (cols + WEATHER.scanTrail) / WEATHER.scanSpeed

/** How much a wake lifts a cell `dx`, `dy` cells from where the octopus passed, `ms` ago: most at its path, nothing
 * past WEATHER.wakeReach or after WEATHER.wakeMs. Rows count double, since the cloud's cells are about twice as tall
 * as they are wide. */
export function wakeLift(dx: number, dy: number, ms: number): number {
  if (ms < 0 || ms >= WEATHER.wakeMs) return 0
  const d = Math.hypot(dx, dy * 2) / WEATHER.wakeReach
  return d >= 1 ? 0 : (1 - d * d) * (1 - ms / WEATHER.wakeMs)
}
