/** A sea of clouds in the valleys between the blue ranges on the left, the painting's own haze thickened into fog.
 * Each valley's fog lies level, in front of the range behind it, and the nearer range cuts it off at its ridge,
 * traced from the artwork step for step. It is thickest just above that ridge and fades out over a few cells at its
 * top, which rises and falls a little as slow waves pass along it, and a faint texture drifts through it with the
 * wind. The painted marks inside it are lit in pale fog light, the more the thicker it is. Now and then, just right
 * of the dip in the nearer ridge left of the card, the fog wells up and spills a little way down the ridge's face,
 * then drains away again from the bottom up. The body is worked out one pixel per glyph cell and drawn smoothly
 * scaled up, so it is as soft as the painting's haze and shows no edge but the ridges'.
 *
 * The pixel work (the traced ridges and the lifted marks) is prepareFog's, done once in the glyph worker; createFog
 * draws from it. */
import { COOL, NIGHT, RANGE_FORE, RANGE_MID, RANGE_NEAR, between, lineAt, noise2, smooth } from './heroArtwork'
import { HALF, TILE, atlasSize, liftInk, tileAt, traceRidge, type Pixels } from './heroMarks'

type Line = ReadonlyArray<readonly [number, number]>
// Each valley: the ridge that cuts its fog off below and the level of the fog's top (artwork px).
const BASINS: ReadonlyArray<{ ridge: Line; level: number }> = [
  { ridge: RANGE_MID, level: 690 },
  { ridge: RANGE_NEAR, level: 757 },
  { ridge: RANGE_FORE, level: 820 },
]
// The artwork's glyph cell (natural px).
const ART_CELL = 12.5
// The top fades out over FADE cells above its level (and is full half a cell below it). Two slow waves pass along it
// the same way, together less than a cell high (css px of wavelength and per second), and the texture drifts with
// the wind (css px/s).
const FADE = 2.6
const WAVES = [
  { length: 300, speed: 10, share: 0.5 },
  { length: 190, speed: 7, share: 0.32 },
] as const
const DRIFT = 11
// The fog's light: its body's alpha where it is thickest, and the most a lit mark takes, in the pale blue of the
// painting's haze.
const BODY = 0.34
const MARK = 0.46
const COLOR = [168, 200, 255] as const
const MARK_COLOR = [226, 236, 255] as const
// The spill: over the second valley's ridge, SPILL_WIDTH artwork px either side of SPILL_X, falling up to SPILL_DROP
// artwork px (the range in front hides the rest); every POUR_REST ms or so, for POUR_MS.
const SPILL_BASIN = 1
const SPILL_UNDER = 2
const SPILL_X = 300
const SPILL_WIDTH = 30
const SPILL_DROP = 40
const POUR_FIRST = [6000, 9000] as const
const POUR_REST = [15000, 25000] as const
const POUR_MS = 6500

type Traced = { from: number; to: number; edge: Float32Array }
/** The fog's share of the worker's pixel work: each valley's traced ridge, and the marks it may light (their artwork
 * pixels and valleys, BASINS.length for the spill's), lifted into one atlas. */
export type FogPrep = {
  ridges: Traced[]
  px: Int32Array
  py: Int32Array
  basin: Int8Array
  atlas: Uint8ClampedArray
}

const ridgeOf = (ridges: ReadonlyArray<Traced>, b: number, ax: number): number => {
  const r = ridges[b]
  const k = Math.round(ax) - r.from
  return r.edge[Math.max(0, Math.min(r.edge.length - 1, k))]
}

/** Traces the ridges and lifts the ranges' own marks inside the fog's reach (the embers' colours are left alone). */
export function prepareFog(image: Pixels, glyphs: ReadonlyArray<{ x: number; y: number; kind: number }>): FogPrep {
  const ridges = BASINS.map(({ ridge }) => {
    const from = Math.max(0, ridge[0][0])
    const to = Math.min(image.width - 1, ridge[ridge.length - 1][0])
    return { from, to, edge: traceRidge(image, (x) => lineAt(ridge, x), from, to) }
  })
  const chosen: Array<[number, number, number]> = []
  glyphs.forEach((g) => {
    if (g.kind !== NIGHT && g.kind !== COOL) return
    const gx = Math.round(g.x)
    const gy = Math.round(g.y)
    if (gx < HALF || gy < HALF || gx >= image.width - HALF || gy >= image.height - HALF) return
    for (let b = 0; b < BASINS.length; b++) {
      if (g.x < ridges[b].from || g.x > ridges[b].to) continue
      if (g.y < ridgeOf(ridges, b, g.x) - 1.5 && g.y > BASINS[b].level - ART_CELL * FADE) {
        chosen.push([gx, gy, b])
        return
      }
    }
    if (Math.abs(g.x - SPILL_X) < SPILL_WIDTH * 1.8) {
      const top = ridgeOf(ridges, SPILL_BASIN, g.x)
      if (g.y > top && g.y < Math.min(top + SPILL_DROP + 4, ridgeOf(ridges, SPILL_UNDER, g.x) - 1.5)) chosen.push([gx, gy, BASINS.length])
    }
  })
  return {
    ridges,
    px: Int32Array.from(chosen, (c) => c[0]),
    py: Int32Array.from(chosen, (c) => c[1]),
    basin: Int8Array.from(chosen, (c) => c[2]),
    atlas: liftInk(image, chosen.map((c) => [c[0], c[1]] as const), MARK_COLOR),
  }
}

/** The buffers a prep can hand over without copying. */
export const fogTransfer = (prep: FogPrep): ArrayBuffer[] =>
  [...prep.ridges.map((r) => r.edge.buffer), prep.px.buffer, prep.py.buffer, prep.basin.buffer, prep.atlas.buffer] as ArrayBuffer[]

export type FogView = {
  width: number
  height: number
  // The artwork's place on the canvas (css px) and its scale, and the glyph cell there (css px).
  ix: number
  iy: number
  scale: number
  cell: number
  calmAt(x: number, y: number): number
}
export type Fog = {
  layout(view: FogView): void
  step(clock: number): void
  /** The fog's body and its lit marks, over the layer's glyphs. */
  draw(context: CanvasRenderingContext2D, clock: number, gain: number): void
}

type Pool = {
  // The canvas the body is worked out on, one pixel per cell, and where its first pixel's centre sits (css px).
  canvas: HTMLCanvasElement
  image: ImageData
  x0: number
  y0: number
  // Only the part above its ridge shows (and for the spill, only below the ridge it spills over).
  clip: Path2D
  below?: Path2D
}

export function createFog(prep: FogPrep): Fog {
  const { ridges } = prep
  const count = prep.px.length
  const [aw, ah] = atlasSize(count)
  const atlas = document.createElement('canvas')
  atlas.width = aw
  atlas.height = ah
  atlas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(prep.atlas), aw, ah), 0, 0)
  let view: FogView | undefined
  let pools: Array<Pool | null> = []
  let spill: Pool | null = null
  let pourAt = between(POUR_FIRST)

  const ridgeAt = (b: number, ax: number): number => ridgeOf(ridges, b, ax)

  /** A pool's canvas over a box of the hero (css px), one pixel per cell. */
  function pool(l: number, t: number, r: number, b: number, cell: number, clip: Path2D, below?: Path2D): Pool {
    const cols = Math.max(1, Math.ceil((r - l) / cell) + 2)
    const rows = Math.max(1, Math.ceil((b - t) / cell) + 2)
    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = rows
    return { canvas, image: new ImageData(cols, rows), x0: l, y0: t, clip, below }
  }

  function layout(next: FogView): void {
    view = next
    const { ix, iy, scale, cell, width, height } = next
    const sx = (x: number): number => ix + x * scale
    const sy = (y: number): number => iy + y * scale
    /** The part of the hero above a ridge (or below it), following it step for step. */
    const side = (b: number, from: number, to: number, above: boolean): Path2D => {
      const path = new Path2D()
      const far = above ? -20 : height + 20
      path.moveTo(sx(from), far)
      for (let x = from; x <= to; x++) path.lineTo(sx(x), sy(ridgeAt(b, x)))
      path.lineTo(sx(to), far)
      path.closePath()
      return path
    }
    pools = BASINS.map((basin, b) => {
      const r = ridges[b]
      const l = sx(r.from)
      const rr = sx(r.to)
      if (rr < 0 || l > width) return null
      let lowest = 0
      for (const y of r.edge) lowest = Math.max(lowest, y)
      return pool(Math.max(-cell, l), sy(basin.level) - cell * (FADE + 1), Math.min(width + cell, rr), sy(lowest) + cell, cell, side(b, r.from, r.to, true))
    })
    const top = ridgeAt(SPILL_BASIN, SPILL_X)
    const from = SPILL_X - SPILL_WIDTH * 2
    const to = SPILL_X + SPILL_WIDTH * 2
    spill = pool(sx(from), sy(top - 2 * ART_CELL), sx(to), sy(top + SPILL_DROP + ART_CELL), cell,
      side(SPILL_UNDER, Math.max(ridges[SPILL_UNDER].from, from - 10), to + 10, true), side(SPILL_BASIN, from - 10, to + 10, false))
  }

  /** The spill's swell, how far it has fallen (artwork px) and its strength, at a time into the pour. */
  function pouring(t: number): [number, number, number] {
    if (t < 0 || t > POUR_MS) return [0, 0, 0]
    const swell = smooth(0, 1400, t) * (1 - smooth(3800, 6000, t))
    const drop = SPILL_DROP * smooth(700, 2500, t) * (1 - smooth(3700, 5800, t))
    const strength = smooth(500, 1400, t) * (1 - smooth(4700, 6400, t))
    return [swell, drop, strength]
  }

  /** The fog's thickness (0 to 1) at a point of the hero in a valley, at this clock. */
  function density(b: number, x: number, y: number, clock: number, swell: number): number {
    if (!view) return 0
    const { ix, iy, scale, cell } = view
    const r = ridges[b]
    const ax = (x - ix) / scale
    const edge = iy + ridgeAt(b, ax) * scale
    const s = clock / 1000
    let level = iy + BASINS[b].level * scale
    for (const wave of WAVES) level -= cell * wave.share * Math.sin((2 * Math.PI * (x - wave.speed * s)) / wave.length + b * 1.9)
    if (b === SPILL_BASIN && swell > 0) level -= cell * 0.9 * swell * Math.exp(-(((ax - SPILL_X) / (SPILL_WIDTH * 1.6)) ** 2))
    // Below the ridge the field carries on as it is at the ridge: the ridge's clip hides it.
    const at = Math.min(y, edge)
    const top = smooth(level - cell * FADE, level + cell * 0.5, at)
    if (top <= 0) return 0
    const deep = 0.55 + 0.45 * smooth(level, Math.max(level + 1, edge), at)
    const texture = 0.62 + 0.38 * noise2((x - DRIFT * s) / 84 + b * 3.7, at / 38 + b * 1.3)
    const ends = smooth(r.from, r.from + 90, ax) * (1 - smooth(r.to - 90, r.to, ax))
    return top * deep * texture * ends * view.calmAt(x, at)
  }

  /** The spill's thickness (0 to 1) at a point below the ridge it pours over. */
  function spilled(x: number, y: number, clock: number, drop: number, strength: number): number {
    if (!view || strength <= 0 || drop <= 0) return 0
    const { ix, iy, scale } = view
    const ax = (x - ix) / scale
    const below = (y - iy) / scale - ridgeAt(SPILL_BASIN, ax)
    if (below < -3) return 0
    const across = Math.exp(-(((ax - SPILL_X) / SPILL_WIDTH) ** 2))
    const fall = 1 - smooth(drop * 0.35, drop, Math.max(0, below))
    const flow = 0.7 + 0.3 * noise2(x / 18 + 4.1, (y - clock * 0.022) / 11)
    return Math.min(1, 1.6 * across * fall * flow * strength)
  }

  function fill(p: Pool, value: (x: number, y: number) => number, cell: number): void {
    const data = p.image.data
    for (let r = 0; r < p.image.height; r++) {
      for (let c = 0; c < p.image.width; c++) {
        const q = (r * p.image.width + c) * 4
        data[q] = COLOR[0]
        data[q + 1] = COLOR[1]
        data[q + 2] = COLOR[2]
        data[q + 3] = Math.round(Math.min(1, value(p.x0 + (c - 1) * cell, p.y0 + (r - 1) * cell)) * BODY * 255)
      }
    }
    p.canvas.getContext('2d')?.putImageData(p.image, 0, 0)
  }

  function paint(context: CanvasRenderingContext2D, p: Pool, cell: number, gain: number): void {
    context.save()
    context.clip(p.clip)
    if (p.below) context.clip(p.below)
    context.globalAlpha = gain
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(p.canvas, p.x0 - cell * 1.5, p.y0 - cell * 1.5, p.canvas.width * cell, p.canvas.height * cell)
    context.restore()
  }

  function draw(context: CanvasRenderingContext2D, clock: number, gain: number): void {
    if (!view || gain <= 0) return
    const { cell, ix, iy, scale } = view
    const [swell, drop, strength] = pouring(clock - pourAt)
    pools.forEach((p, b) => {
      if (!p) return
      fill(p, (x, y) => density(b, x, y, clock, swell), cell)
      paint(context, p, cell, gain)
    })
    if (spill && strength > 0) {
      fill(spill, (x, y) => spilled(x, y, clock, drop, strength), cell)
      paint(context, spill, cell, gain)
    }
    // The painted marks in the fog, lit in its light.
    const size = TILE * scale
    for (let n = 0; n < count; n++) {
      const b = prep.basin[n]
      const x = ix + (prep.px[n] + 0.5) * scale
      const y = iy + (prep.py[n] + 0.5) * scale
      const d = b < BASINS.length ? density(b, x, y, clock, swell) : spilled(x, y, clock, drop, strength)
      const alpha = Math.min(MARK, 0.56 * d ** 1.5) * gain
      if (alpha < 0.01) continue
      const [tx, ty] = tileAt(n)
      context.globalAlpha = alpha
      context.drawImage(atlas, tx, ty, TILE, TILE, ix + (prep.px[n] - HALF) * scale, iy + (prep.py[n] - HALF) * scale, size, size)
    }
    context.globalAlpha = 1
  }

  return {
    layout,
    step(clock) {
      if (clock - pourAt > POUR_MS) pourAt = clock + between(POUR_REST)
    },
    draw,
  }
}
