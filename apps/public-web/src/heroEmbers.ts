/** Rising sparks. Now and then, at the height of one of its twinkles, an ember in the mountain's dark flank
 * lets a spark go. It hops up the painted lattice from glyph to glyph, now and then one aside (mostly downwind),
 * quickly at first and then slower, cooling from gold to orange to crimson, each cell it leaves fading behind it,
 * and goes out after three to eight cells. Twinkles near a rising spark hold still, and no spark leaves an ember the
 * alpenglow is passing over (the glyph layer holds those back), nor while light climbs to the summit. */
import { between, smooth } from './heroArtwork'

export type EmberSource = { i: number; period: number; phase: number }
export type EmberView = {
  // The glyph cell (css px), every glyph's centre (css px), the embers that may let sparks go, and how much light the
  // page lets through at a point.
  size: number
  xs: Float32Array
  ys: Float32Array
  sources: ReadonlyArray<EmberSource>
  calmAt(x: number, y: number): number
}
export type Embers = {
  layout(view: EmberView): void
  /** Hops the sparks on and lets a new one go now and then; `held` says which embers may not let one go now. */
  step(clock: number, held: (i: number) => boolean): void
  draw(context: CanvasRenderingContext2D, clock: number, gain: number): void
  /** How still a twinkle near a rising spark keeps (0 to 1). */
  hush(x: number, y: number): number
}

// A spark every SPAWN ms or so, waiting up to WAIT ms for an ember's twinkle to peak (a twinkle peaks PEAK into its
// period), never more than ALIVE at once.
const SPAWN = [700, 1600] as const
const WAIT = 1500
const PEAK = 0.07
const ALIVE = 4
// Each spark hops HOPS cells, the first after LEAVE ms, each hop slower than the one before, from HOP_FIRST to
// HOP_LAST ms; now and then one cell aside, mostly downwind. A cell it leaves fades over TRAIL_MS, and its last goes
// out over OUT_MS.
const HOPS = [3, 8] as const
const LEAVE = 90
const HOP_FIRST = 120
const HOP_LAST = 320
const ASIDE = 0.3
const DOWNWIND = 0.8
const TRAIL_MS = 300
const OUT_MS = 420
// White-gold as it leaves, then gold, orange and crimson; a hot spark glows a little (GLOW css px across).
const COLORS: ReadonlyArray<readonly [number, number, number]> = [[255, 244, 214], [255, 206, 130], [250, 140, 72], [226, 84, 70]]
const GLOW = 9

type Spark = { source: number; cells: Array<[number, number]>; times: number[]; total: number; next: number }

/** A hot spark's glow. */
function glowSprite(): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) return null
  const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16)
  glow.addColorStop(0, 'rgba(255,214,150,1)')
  glow.addColorStop(0.35, 'rgba(255,170,90,0.45)')
  glow.addColorStop(1, 'rgba(255,140,70,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 32, 32)
  return canvas
}

export function createEmbers(): Embers {
  const glow = glowSprite()
  let view: EmberView | undefined
  let sparks: Spark[] = []
  let spawnAt = between(SPAWN) + 2000
  // The glyphs by cell, to hop from one painted glyph to the next.
  let grid = new Map<number, number[]>()

  const key = (cx: number, cy: number): number => cx * 65536 + cy

  function layout(next: EmberView): void {
    view = next
    sparks = []
    grid = new Map()
    for (let i = 0; i < next.xs.length; i++) {
      const k = key(Math.floor(next.xs[i] / next.size), Math.floor(next.ys[i] / next.size))
      const list = grid.get(k)
      if (list) list.push(i)
      else grid.set(k, [i])
    }
  }

  /** The painted glyph nearest a point, within most of a cell, or the point itself. */
  function snap(x: number, y: number): [number, number] {
    if (!view) return [x, y]
    const { size, xs, ys } = view
    const cx = Math.floor(x / size)
    const cy = Math.floor(y / size)
    let best: [number, number] = [x, y]
    let nearest = size * 0.6
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of grid.get(key(cx + dx, cy + dy)) ?? []) {
          const d = Math.hypot(xs[i] - x, ys[i] - y)
          if (d < nearest) {
            nearest = d
            best = [xs[i], ys[i]]
          }
        }
      }
    }
    return best
  }

  /** How long a spark's hop takes: quick at first, slower as it cools. */
  const hopMs = (spark: Spark, hop: number): number => HOP_FIRST + (HOP_LAST - HOP_FIRST) * Math.min(1, (hop - 1) / Math.max(1, spark.total - 1))

  function step(clock: number, held: (i: number) => boolean): void {
    if (!view) return
    const { size } = view
    for (const spark of sparks) {
      const hops = spark.cells.length - 1
      if (hops >= spark.total || clock < spark.next) continue
      const [x, y] = spark.cells[hops]
      const aside = Math.random() < ASIDE ? (Math.random() < DOWNWIND ? 1 : -1) : 0
      const cell = snap(x + aside * size, y - size)
      if (view.calmAt(cell[0], cell[1]) < 0.6) {
        // It would drift over the page: it goes out here.
        spark.total = hops
        continue
      }
      spark.cells.push(cell)
      spark.times.push(clock)
      spark.next = clock + hopMs(spark, hops + 1)
    }
    sparks = sparks.filter((spark) => spark.cells.length - 1 < spark.total || clock - spark.times[spark.times.length - 1] < hopMs(spark, spark.total) + OUT_MS)
    if (clock < spawnAt) return
    if (sparks.length >= ALIVE) {
      spawnAt = clock + between(SPAWN)
      return
    }
    // A spark leaves an ember at the height of its twinkle.
    const ready = view.sources.filter((s) => {
      const phase = (((clock / s.period + s.phase) % 1) + 1) % 1
      return Math.abs(phase - PEAK) * s.period < 18 && !held(s.i) && !sparks.some((spark) => spark.source === s.i)
    })
    if (ready.length) {
      const s = ready[Math.floor(Math.random() * ready.length)]
      sparks.push({ source: s.i, cells: [[view.xs[s.i], view.ys[s.i]]], times: [clock], total: Math.round(between(HOPS)), next: clock + LEAVE })
      spawnAt = clock + between(SPAWN)
    } else if (clock - spawnAt > WAIT) spawnAt = clock + 300
  }

  function mark(context: CanvasRenderingContext2D, x: number, y: number, hot: boolean, rgb: readonly number[], alpha: number, size: number): void {
    const style = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`
    if (hot) {
      const a = size * 0.2
      context.strokeStyle = style
      context.beginPath()
      context.moveTo(x - a, y - a)
      context.lineTo(x + a, y + a)
      context.moveTo(x + a, y - a)
      context.lineTo(x - a, y + a)
      context.stroke()
    } else {
      const d = Math.max(1.3, size * 0.16)
      context.fillStyle = style
      context.fillRect(x - d / 2, y - d / 2, d, d)
    }
  }

  function draw(context: CanvasRenderingContext2D, clock: number, gain: number): void {
    if (!view || gain <= 0) return
    const { size } = view
    context.lineWidth = Math.max(1, size * 0.11)
    for (const spark of sparks) {
      const last = spark.cells.length - 1
      for (let k = Math.max(0, last - 2); k <= last; k++) {
        // Cooling as it rises: white-gold, gold, orange, crimson.
        const heat = Math.min(1, k / Math.max(1, spark.total)) * (COLORS.length - 1)
        const c = Math.min(COLORS.length - 2, Math.floor(heat))
        const t = heat - c
        const rgb = COLORS[c].map((v, j) => Math.round(v + (COLORS[c + 1][j] - v) * t))
        let alpha: number
        if (k < last) alpha = 1 - (clock - spark.times[k + 1]) / TRAIL_MS
        else {
          alpha = Math.min(1, (clock - spark.times[k]) / 60)
          // The last cell goes out.
          if (last >= spark.total) alpha *= 1 - Math.max(0, clock - spark.times[k] - hopMs(spark, spark.total)) / OUT_MS
        }
        alpha *= 0.92 * gain
        if (alpha <= 0.01) continue
        if (k < 3 && glow) {
          context.globalAlpha = alpha * 0.4 * (1 - k / 3)
          context.drawImage(glow, spark.cells[k][0] - GLOW / 2, spark.cells[k][1] - GLOW / 2, GLOW, GLOW)
          context.globalAlpha = 1
        }
        mark(context, spark.cells[k][0], spark.cells[k][1], k < 2, rgb, alpha, size)
      }
    }
  }

  function hush(x: number, y: number): number {
    if (!view || !sparks.length) return 0
    let most = 0
    for (const spark of sparks) {
      const [sx, sy] = spark.cells[spark.cells.length - 1]
      const [ox, oy] = spark.cells[0]
      const d = Math.min(Math.hypot(x - sx, y - sy), Math.hypot(x - ox, y - oy))
      most = Math.max(most, 1 - smooth(1.5 * view.size, 2.5 * view.size, d))
    }
    return most
  }

  return { layout, step, draw, hush }
}

