/** Life in the format cards' paintings, a different life for each. The paintings are cross-stitch, every mark on a grid
 * about 14.5 px apart in the source, so nothing here moves or bends the picture: a canvas over each card, screened onto
 * it (product.css), lights the painting's own marks in place and draws glyphs of its own on the same grid.
 *
 * Every card shares a quiet base: a faint light drifting with the clouds, a decode sweep when the card comes to the
 * front, a warm pool and sparks under the pointer, and a ring of turned-over marks on a click. On top, each painting has
 * its own scene (SCENES, in card order):
 *
 * 1. Golden clouds: rays turning slowly round the sun, the marks along them travelling outwards; the sun breathes.
 * 2. Wind clouds: gusts streaming the way the clouds lean, each a run of glyphs hopping cell to cell.
 * 3. Night clouds: the painting's own stars twinkling and flaring, and shooting stars.
 * 4. Lake at sunset: glints dancing on the water, thickest in the sun's path; the sun breathes.
 * 5. River in the woods: fireflies wandering and blinking, lighting the leaves around them.
 * 6. Misty mountains: fog drifting through the valleys, and now and then a flock of birds crossing the sky.
 *
 * Only the cards on screen, and on wide screens only those not covered, are drawn; the loop stops off screen and while
 * the tab is hidden. With reduced motion nothing is mounted and the paintings stay still. */

type RGB = readonly [number, number, number]
type Star = { u: number; v: number; color: RGB; speed: number; phase: number }
/** A moving thing a scene keeps: a gust, a meteor, a firefly, a bird, a spark. Positions in CSS px on the card. */
type Mover = { x: number; y: number; vx: number; vy: number; born: number; life: number; seed: number }
type Card = {
  el: HTMLElement
  index: number
  scene: Scene
  canvas: HTMLCanvasElement
  paint: CanvasRenderingContext2D
  solid: CanvasRenderingContext2D
  solidCanvas: HTMLCanvasElement
  /** Each grid cell's brightness in the painting, 0 to 1, so glyphs can take a colour that reads there. */
  lum: Float32Array
  mask: HTMLCanvasElement
  maskPaint: CanvasRenderingContext2D
  maskData: ImageData | null
  image: HTMLImageElement | null
  stars: Star[]
  fit: { x: number; y: number; w: number; h: number }
  size: { w: number; h: number; ratio: number }
  grid: { cell: number; ox: number; oy: number; cols: number; rows: number }
  seen: boolean
  front: boolean
  entered: number
  movers: Mover[]
  sparks: Mover[]
  ripples: Array<{ x: number; y: number; born: number }>
  next: number
  light: { x: number; y: number; k: number }
}
/** What a scene adds: light per grid cell (0 to 1, under the painting's marks), and glyphs drawn on top. */
type Scene = {
  stars: boolean
  lift: (card: Card, x: number, y: number, t: number) => number
  /** `light` is added as light on the screened canvas; `solid` is painted as it is on a plain canvas above it, so its
   * glyphs read on bright parts of the painting too. */
  draw: (card: Card, light: Ink, solid: Ink, t: number, dt: number) => void
}

const SOURCE_WIDTH = 1672
const SOURCE_CELL = 14.5
const MARKS = '·:+×'
const WARM: RGB = [255, 196, 140]
const GOLD: RGB = [255, 214, 150]
const PALE: RGB = [226, 238, 248]
const FIREFLY: RGB = [255, 238, 120]
const ENTER_SECONDS = 1.3
const RIPPLE_SECONDS = 1.4
/** The base light never lifts a mark by more than this, so the paintings keep their colour instead of washing white. */
const BASE_LIFT = 0.22

const within = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const soft = (a: number, b: number, v: number): number => {
  const k = within((v - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const rgba = (c: RGB, a: number): string => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${within(a).toFixed(3)})`
/** A repeatable value in [0, 1) for two numbers. */
const hash = (x: number, y: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return v - Math.floor(v)
}
/** Smooth value noise in [0, 1). */
const noise = (x: number, y: number): number => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * sx
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * sx
  return a + (b - a) * sy
}
/** A point in the painting, as fractions of it, on the card. */
const at = (card: Card, u: number, v: number): [number, number] => [card.fit.x + u * card.fit.w, card.fit.y + v * card.fit.h]

/** Glyphs and glows for one frame, grouped by look so the canvas changes style as seldom as it can. Every glyph lands
 * on a grid cell. */
class Ink {
  private glyphs = new Map<string, number[]>()
  private glows: Array<[number, number, number, RGB, number]> = []
  constructor(private card: Card) {}
  /** A glyph at the cell nearest (x, y). */
  mark(mark: string, x: number, y: number, color: RGB, alpha: number): void {
    if (alpha < 0.04) return
    const { cell, ox, oy } = this.card.grid
    const cx = ox + (Math.floor((x - ox) / cell) + 0.5) * cell
    const cy = oy + (Math.floor((y - oy) / cell) + 0.5) * cell
    const key = `${mark}|${color[0]},${color[1]},${color[2]}|${Math.round(within(alpha) * 10)}`
    const list = this.glyphs.get(key)
    if (list) list.push(cx, cy)
    else this.glyphs.set(key, [cx, cy])
  }
  /** A glyph in `bright` where the painting is light and in `dark` where it is dark, so it reads either way. */
  contrast(mark: string, x: number, y: number, dark: RGB, bright: RGB, alpha: number): void {
    const { cell, ox, oy, cols } = this.card.grid
    const c = Math.floor((x - ox) / cell)
    const r = Math.floor((y - oy) / cell)
    const lum = this.card.lum[r * cols + c] ?? 0.5
    this.mark(mark, x, y, lum > 0.62 ? bright : dark, alpha)
  }
  /** A soft glow of light, radius r. */
  glow(x: number, y: number, r: number, color: RGB, alpha: number): void {
    if (alpha >= 0.02) this.glows.push([x, y, r, color, alpha])
  }
  flush(g: CanvasRenderingContext2D, scale = 1.05): void {
    for (const [x, y, r, color, alpha] of this.glows) {
      const glow = g.createRadialGradient(x, y, 0, x, y, r)
      glow.addColorStop(0, rgba(color, alpha))
      glow.addColorStop(0.35, rgba(color, alpha * 0.3))
      glow.addColorStop(1, rgba(color, 0))
      g.fillStyle = glow
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    g.font = `700 ${Math.round(this.card.grid.cell * scale)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const [key, points] of this.glyphs) {
      const [mark, color, step] = key.split('|') as [string, string, string]
      g.fillStyle = `rgba(${color}, ${Number(step) / 10})`
      for (let i = 0; i < points.length; i += 2) g.fillText(mark, points[i]!, points[i + 1]!)
    }
  }
}

/** Moves a scene's movers and drops the ones whose life is over. */
const age = (list: Mover[], t: number): Mover[] => list.filter((m) => t - m.born < m.life)
const fade = (m: Mover, t: number): number => Math.sin(within((t - m.born) / m.life) * Math.PI)

/** A run of glyphs behind a moving head, fading ×+:·, each glyph a cell further back. */
function trail(ink: Ink, card: Card, x: number, y: number, vx: number, vy: number, length: number, color: RGB, alpha: number, onBright?: RGB): void {
  const speed = Math.hypot(vx, vy) || 1
  const { cell } = card.grid
  for (let i = 0; i < length; i++) {
    const mark = i === 0 ? '×' : i < length * 0.25 ? '+' : i < length * 0.6 ? ':' : '·'
    const px = x - (vx / speed) * i * cell
    const py = y - (vy / speed) * i * cell
    if (onBright) ink.contrast(mark, px, py, color, onBright, alpha * (1 - i / length))
    else ink.mark(mark, px, py, color, alpha * (1 - i / length))
  }
}

const SCENES: readonly Scene[] = [
  // 1. Golden clouds: rays turning round the sun, their marks travelling outwards; the sun breathes and sends out a
  //    ring of light every few seconds.
  {
    stars: true,
    lift(card, x, y, t) {
      const [sx, sy] = at(card, 0.6, 0.59)
      const d = Math.hypot(x - sx, y - sy) / card.size.h
      const a = Math.atan2(y - sy, x - sx)
      // Beams: narrow, turning slowly, each fading out from the sun.
      const beam = (0.5 + 0.5 * Math.cos(a * 6 + t * 0.15)) ** 10 * (0.65 + 0.35 * Math.cos(a * 2 - t * 0.1))
      const breath = 0.75 + 0.25 * Math.sin(t * 1.1)
      return Math.max(beam * Math.exp(-d / 0.75) * 0.6, Math.exp(-(d * d) / 0.025) * 0.45 * breath)
    },
    draw(card, light, solid, t) {
      const [sx, sy] = at(card, 0.6, 0.59)
      const { cell, ox, oy, cols, rows } = card.grid
      const { h } = card.size
      const pulse = (t % 4.5) / 4.5
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + (c + 0.5) * cell
          const y = oy + (r + 0.5) * cell
          const d = Math.hypot(x - sx, y - sy)
          // The ring: a band of marks leaving the sun.
          const ring = Math.abs(d - pulse * h * 0.9) / cell
          if (ring < 1.2 && hash(c, r + Math.floor(t * 10)) < 0.7) solid.contrast(MARKS[Math.floor(hash(r, c) * 4)]!, x, y, [255, 214, 150], [214, 120, 60], (1 - ring / 1.2) * (1 - pulse) * 0.9)
          if (hash(c, r) > 0.62) continue
          const a = Math.atan2(y - sy, x - sx)
          const ray = (0.5 + 0.5 * Math.cos(a * 6 + t * 0.15)) ** 6
          if (ray < 0.25) continue
          // Marks travel outwards: the mark a cell shows steps with the distance minus time.
          const phase = (((d / cell - t * 3) % 4) + 4) % 4
          solid.contrast(MARKS[Math.floor(phase)]!, x, y, [255, 214, 150], [222, 116, 52], within(ray * Math.exp(-d / (h * 0.9)) * 1.1))
        }
      }
      light.glow(sx, sy, h * 0.2, [255, 230, 190], 0.22 * (0.75 + 0.25 * Math.sin(t * 1.1)))
    },
  },
  // 2. Wind clouds: gusts streaming up and to the right, the way the clouds lean, each swaying as it goes.
  {
    stars: false,
    lift(card, x, y, t) {
      // Each gust lights a streak of the painting behind its head.
      let lift = 0
      const { cell } = card.grid
      for (const m of card.movers) {
        const s = t - m.born
        const hx = m.x + m.vx * s
        const hy = m.y + m.vy * s
        const speed = Math.hypot(m.vx, m.vy) || 1
        const back = cell * (12 + m.seed)
        const tx = hx - (m.vx / speed) * back
        const ty = hy - (m.vy / speed) * back
        if (x < Math.min(hx, tx) - cell * 2 || x > Math.max(hx, tx) + cell * 2 || y < Math.min(hy, ty) - cell * 2 || y > Math.max(hy, ty) + cell * 2) continue
        const k = within(((x - tx) * (hx - tx) + (y - ty) * (hy - ty)) / (back * back))
        const off = Math.hypot(x - (tx + (hx - tx) * k), y - (ty + (hy - ty) * k)) / (cell * 1.4)
        if (off < 1) lift = Math.max(lift, (1 - off * off) * k * 0.6 * fade(m, t))
      }
      return lift
    },
    draw(card, _light, solid, t) {
      const { w, h } = card.size
      if (t > card.next && card.movers.length < 16) {
        card.next = t + 0.1 + hash(t, card.index) * 0.2
        const speed = w * (0.3 + 0.3 * hash(t, 3))
        card.movers.push({ x: w * (-0.15 + 0.85 * hash(t, 5)), y: h * (0.3 + 0.8 * hash(t, 7)), vx: speed * 0.92, vy: -speed * 0.38, born: t, life: 2.2 + hash(t, 9) * 1.2, seed: hash(t, 11) * 10 })
      }
      card.movers = age(card.movers, t)
      for (const m of card.movers) {
        const s = t - m.born
        const sway = Math.sin(s * 3 + m.seed) * card.grid.cell * 1.4
        const x = m.x + m.vx * s + sway * 0.38
        const y = m.y + m.vy * s + sway * 0.92
        const color: RGB = m.seed > 6.5 ? [255, 222, 186] : m.seed > 3 ? [206, 255, 232] : [240, 250, 255]
        const length = 12 + Math.round(m.seed)
        trail(solid, card, x, y, m.vx, m.vy, length, color, fade(m, t), [24, 104, 104])
        // A second, fainter row beside it, so the gust reads as a streak rather than a dotted line.
        trail(solid, card, x + card.grid.cell * 0.38, y + card.grid.cell * 0.92, m.vx, m.vy, Math.round(length * 0.7), color, 0.55 * fade(m, t), [24, 104, 104])
        _light.glow(x, y, card.grid.cell * 3.5, color, 0.6 * fade(m, t))
      }
    },
  },
  // 3. Night clouds: the stars twinkle and flare, star dust glitters in the dark, and shooting stars cross the sky.
  {
    stars: true,
    lift: () => 0,
    draw(card, light, solid, t) {
      const { w, h } = card.size
      const { cell, ox, oy, cols, rows } = card.grid
      // Star dust: dark cells glittering on and off, each on its own beat.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hash(c, r) > 0.09 || (card.lum[r * cols + c] ?? 1) > 0.42) continue
          const k = Math.max(0, Math.sin(t * (1 + hash(r, c) * 2) + hash(c, r) * 40)) ** 6
          solid.mark(k > 0.7 ? '+' : '·', ox + (c + 0.5) * cell, oy + (r + 0.5) * cell, [236, 244, 255], k * 0.9)
        }
      }
      if (t > card.next) {
        card.next = t + 0.8 + hash(t, card.index) * 1.4
        const speed = w * (0.75 + 0.45 * hash(t, 2))
        const tilt = 0.3 + 0.35 * hash(t, 4)
        card.movers.push({ x: w * (0.05 + 0.7 * hash(t, 6)), y: h * (0.02 + 0.25 * hash(t, 8)), vx: speed, vy: speed * tilt, born: t, life: 0.9 + 0.4 * hash(t, 10), seed: 0 })
      }
      card.movers = age(card.movers, t)
      for (const m of card.movers) {
        const s = t - m.born
        const x = m.x + m.vx * s
        const y = m.y + m.vy * s
        const k = fade(m, t)
        trail(solid, card, x, y, m.vx, m.vy, 16, [255, 238, 205], k)
        light.glow(x, y, cell * 4.5, [255, 244, 220], 0.8 * k)
      }
    },
  },
  // 4. Lake at sunset: glints dancing on the water, thickest in the sun's path; the sun breathes.
  {
    stars: false,
    lift(card, x, y, t) {
      const [sx, sy] = at(card, 0.76, 0.55)
      const [, horizon] = at(card, 0, 0.685)
      const breath = 0.75 + 0.25 * Math.sin(t * 0.9)
      const sun = Math.exp(-((Math.hypot(x - sx, y - sy) / card.size.h) ** 2) / 0.012) * 0.45 * breath
      if (y < horizon) return sun
      // The water: glints that come and go, brightest in the sun's path.
      const { cell } = card.grid
      const path = Math.exp(-(((x - sx) / card.size.w) ** 2) / 0.01)
      const glint = noise(x / cell * 0.4 - t * 1.6, y / cell * 1.6) * noise(x / cell * 0.9 + t * 0.8, y / cell * 2.2 + 5)
      return Math.max(sun, soft(0.3, 0.6, glint) * (0.2 + 0.45 * path))
    },
    draw(card, light, solid, t) {
      const [sx, sy] = at(card, 0.76, 0.55)
      const [, horizon] = at(card, 0, 0.685)
      const { cell, ox, oy, cols, rows } = card.grid
      const tick = Math.floor(t * 9)
      for (let r = 0; r < rows; r++) {
        const y = oy + (r + 0.5) * cell
        if (y < horizon + cell * 0.5) continue
        const depth = within((y - horizon) / (card.size.h - horizon))
        for (let c = 0; c < cols; c++) {
          const x = ox + (c + 0.5) * cell
          const path = Math.exp(-(((x - sx) / card.size.w) ** 2) / (0.004 + 0.01 * depth))
          const glint = noise(c * 0.4 - t * 1.6, r * 1.6) * noise(c * 0.9 + t * 0.8, r * 2.2 + 5)
          if (glint < 0.36 - path * 0.12 || hash(c + tick, r) > 0.3 + path * 0.6) continue
          const k = soft(0.3, 0.62, glint)
          solid.mark(k > 0.75 ? '×' : k > 0.4 ? '+' : '·', x, y, path > 0.35 ? [255, 230, 170] : [236, 248, 255], k * (0.45 + 0.5 * path))
        }
      }
      light.glow(sx, sy, card.size.h * 0.16, [255, 214, 150], 0.25 * (0.75 + 0.25 * Math.sin(t * 0.9)))
    },
  },
  // 5. River in the woods: fireflies wandering and blinking, lighting the leaves around them.
  {
    stars: false,
    lift(card, x, y) {
      let lift = 0
      const reach = card.grid.cell * 2.2
      for (const f of card.movers) {
        // f.vx holds the firefly's blink, set by draw.
        if (f.vx < 0.05 || Math.abs(x - f.x) > reach || Math.abs(y - f.y) > reach) continue
        const d = Math.hypot(x - f.x, y - f.y) / reach
        if (d < 1) lift = Math.max(lift, (1 - d * d) * 0.35 * f.vx)
      }
      return lift
    },
    draw(card, light, solid, t, dt) {
      const { w, h } = card.size
      const { cell } = card.grid
      while (card.movers.length < 18) {
        const n = card.movers.length + card.index * 31
        card.movers.push({ x: w * hash(n, 1), y: h * (0.15 + 0.82 * hash(n, 2)), vx: 0, vy: 0, born: t - hash(n, 3) * 6, life: 1, seed: hash(n, 4) * 100 })
      }
      for (const f of card.movers) {
        // Each wanders on its own slow current, and blinks: a quick rise, a slower fall, then dark for a while.
        const heading = noise(f.seed + t * 0.15, f.seed * 0.3) * Math.PI * 4
        f.x += Math.cos(heading) * cell * 1.8 * dt
        f.y += (Math.sin(heading) * cell * 1.3 - cell * 0.25) * dt
        if (f.x < -cell * 2) f.x = w + cell
        if (f.x > w + cell * 2) f.x = -cell
        if (f.y < h * 0.1) f.y = h * 0.95
        if (f.y > h + cell) f.y = h * 0.2
        const cycle = ((t - f.born + f.seed) % 3) / 3
        const blink = cycle < 0.08 ? cycle / 0.08 : cycle < 0.45 ? 1 - ((cycle - 0.08) / 0.37) ** 2 : 0
        f.vx = blink
        light.glow(f.x, f.y, cell * 2.2, FIREFLY, 0.85 * blink)
        solid.mark(blink > 0.6 ? '+' : '·', f.x, f.y, [255, 250, 180], 0.2 + 0.8 * blink)
      }
    },
  },
  // 6. Misty mountains: fog drifting through the valleys, and now and then a flock of birds crossing the sky.
  {
    stars: false,
    lift(card, x, y, t) {
      const [lx, ly] = at(card, 0.88, 0.51)
      const dawn = Math.exp(-((Math.hypot(x - lx, y - ly) / card.size.h) ** 2) / 0.03) * 0.35 * (0.75 + 0.25 * Math.sin(t * 0.7))
      const [, top] = at(card, 0, 0.5)
      const [, bottom] = at(card, 0, 0.92)
      if (y < top || y > bottom) return dawn
      // The fog: banks drifting slowly to the left through the valleys.
      const { cell } = card.grid
      const band = Math.sin(((y - top) / (bottom - top)) * Math.PI)
      const fog = noise(x / cell * 0.06 - t * 0.16, y / cell * 0.3) * 0.7 + 0.3 * noise(x / cell * 0.15 - t * 0.26, y / cell * 0.5 + 9)
      return Math.max(dawn, soft(0.5, 0.8, fog) * band * 0.5)
    },
    draw(card, _light, solid, t) {
      const { w, h } = card.size
      const { cell, ox, oy, cols, rows } = card.grid
      const [, top] = at(card, 0, 0.5)
      const [, bottom] = at(card, 0, 0.92)
      for (let r = 0; r < rows; r++) {
        const y = oy + (r + 0.5) * cell
        if (y < top || y > bottom) continue
        const band = Math.sin(((y - top) / (bottom - top)) * Math.PI)
        for (let c = 0; c < cols; c++) {
          const fog = noise(c * 0.06 - t * 0.16, r * 0.3) * 0.7 + 0.3 * noise(c * 0.15 - t * 0.26, r * 0.5 + 9)
          if (fog < 0.55 || hash(c, r) > 0.5) continue
          solid.contrast(fog > 0.7 ? '+' : fog > 0.62 ? ':' : '·', ox + (c + 0.5) * cell, y, [252, 252, 248], [104, 136, 152], soft(0.55, 0.8, fog) * band * 0.85)
        }
      }
      // A flock: a few birds in a loose V, crossing the sky, their wings beating v ^.
      if (t > card.next) {
        card.next = t + 4 + hash(t, card.index) * 3
        const y0 = h * (0.1 + 0.18 * hash(t, 3))
        const size = 3 + Math.floor(hash(t, 5) * 4)
        for (let i = 0; i < size; i++) {
          const rank = Math.ceil(i / 2) * (i % 2 ? 1 : -1)
          card.movers.push({ x: -cell * (2 + Math.abs(rank) * 2.2), y: y0 + rank * cell * 1.3, vx: w * 0.1, vy: -h * 0.006, born: t, life: (w + cell * 14) / (w * 0.1), seed: i })
        }
      }
      card.movers = age(card.movers, t)
      for (const b of card.movers) {
        const s = t - b.born
        solid.mark(Math.sin(s * 9 + b.seed) > 0 ? 'v' : '^', b.x + b.vx * s, b.y + b.vy * s + Math.sin(s * 1.5 + b.seed) * cell * 0.4, [30, 50, 66], 0.85)
      }
    },
  },
]

/** The painting's stars: bright marks on a dark ground, spread apart, as fractions of the image, with their colour. */
function findStars(image: HTMLImageElement): Array<{ u: number; v: number; color: RGB }> {
  const w = 420
  const h = Math.max(1, Math.round((w * image.naturalHeight) / image.naturalWidth))
  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h
  const g = probe.getContext('2d', { willReadFrequently: true })
  if (!g) return []
  g.drawImage(image, 0, 0, w, h)
  const data = g.getImageData(0, 0, w, h).data
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lum[i] = (0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!) / 255
  const found: Array<{ u: number; v: number; score: number; color: RGB }> = []
  const r = 5
  for (let y = r; y < h - r; y += 2) {
    for (let x = r; x < w - r; x += 2) {
      const l = lum[y * w + x]!
      if (l < 0.5) continue
      let sum = 0
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sum += lum[(y + dy) * w + x + dx]!
      const ground = sum / ((2 * r + 1) ** 2)
      if (ground > 0.42 || l - ground < 0.2) continue
      const at = (y * w + x) * 4
      found.push({ u: x / w, v: y / h, score: l - ground, color: [data[at]!, data[at + 1]!, data[at + 2]!] })
    }
  }
  found.sort((a, b) => b.score - a.score)
  const stars: Array<{ u: number; v: number; color: RGB }> = []
  for (const f of found) {
    if (stars.some((s) => Math.hypot((s.u - f.u) * w, (s.v - f.v) * h) < 22)) continue
    stars.push(f)
    if (stars.length >= 24) break
  }
  return stars
}

export function mountCardGlow(section: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const stack = section.querySelector<HTMLElement>('.fx-stack')
  const cards: Card[] = []
  for (const [index, el] of [...section.querySelectorAll<HTMLElement>('.fx-card')].entries()) {
    const canvas = document.createElement('canvas')
    canvas.className = 'fx-glow'
    canvas.setAttribute('aria-hidden', 'true')
    const paint = canvas.getContext('2d')
    const mask = document.createElement('canvas')
    const maskPaint = mask.getContext('2d')
    if (!paint || !maskPaint) return
    el.append(canvas)
    const scene = SCENES[index % SCENES.length]!
    const solidCanvas = document.createElement('canvas')
    solidCanvas.className = 'fx-solid'
    solidCanvas.setAttribute('aria-hidden', 'true')
    const solid = solidCanvas.getContext('2d')
    if (!solid) return
    el.append(solidCanvas)
    cards.push({
      el, index, scene, canvas, paint, solid, solidCanvas, lum: new Float32Array(0), mask, maskPaint, maskData: null, image: null, stars: [],
      fit: { x: 0, y: 0, w: 1, h: 1 }, size: { w: 1, h: 1, ratio: 1 }, grid: { cell: 10, ox: 0, oy: 0, cols: 1, rows: 1 },
      seen: false, front: false, entered: -1e9, movers: [], sparks: [], ripples: [], next: 0, light: { x: 0, y: 0, k: 0 },
    })
  }
  const pointer = { card: null as Card | null, x: 0, y: 0, cx: -1, cy: -1, lastCell: '' }
  const narrow = window.matchMedia('(max-width: 1000px)')
  const clock = performance.now()
  let frame = 0
  let last = 0
  let onScreen = false

  /** The card's painting, read from its own CSS background so it is the versioned file the browser already has. */
  const load = (card: Card): void => {
    if (card.image) return
    const url = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(card.el).backgroundImage)?.[1]
    if (!url) return
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    card.image = image
    image.decode().then(() => {
      if (card.scene.stars) card.stars = findStars(image).map((s, i) => ({ ...s, speed: 0.5 + hash(card.index, i) * 0.9, phase: hash(i, card.index + 9) * Math.PI * 2 }))
      fit(card)
    }).catch(() => { card.image = null })
  }

  /** Size the canvas to the card, place the painting as the CSS does (cover, centred) and lay the grid on its stitches. */
  const fit = (card: Card): void => {
    const w = Math.max(1, card.el.clientWidth)
    const h = Math.max(1, card.el.clientHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    card.size = { w, h, ratio }
    card.canvas.width = Math.round(w * ratio)
    card.canvas.height = Math.round(h * ratio)
    card.solidCanvas.width = card.canvas.width
    card.solidCanvas.height = card.canvas.height
    const image = card.image
    if (!image?.naturalWidth) return
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight)
    card.fit = { x: (w - image.naturalWidth * scale) / 2, y: (h - image.naturalHeight * scale) / 2, w: image.naturalWidth * scale, h: image.naturalHeight * scale }
    const cell = (card.fit.w / SOURCE_WIDTH) * SOURCE_CELL
    const ox = ((card.fit.x % cell) + cell) % cell - cell
    const oy = ((card.fit.y % cell) + cell) % cell - cell
    const cols = Math.ceil((w - ox) / cell) + 1
    const rows = Math.ceil((h - oy) / cell) + 1
    card.grid = { cell, ox, oy, cols, rows }
    card.mask.width = cols
    card.mask.height = rows
    card.maskData = card.maskPaint.createImageData(cols, rows)
    // The painting's brightness per cell: draw it at one pixel a cell and read it back.
    const probe = document.createElement('canvas')
    probe.width = cols
    probe.height = rows
    const pg = probe.getContext('2d', { willReadFrequently: true })
    card.lum = new Float32Array(cols * rows)
    if (pg) {
      pg.drawImage(image, (card.fit.x - ox) / cell, (card.fit.y - oy) / cell, card.fit.w / cell, card.fit.h / cell)
      const px = pg.getImageData(0, 0, cols, rows).data
      for (let i = 0; i < cols * rows; i++) card.lum[i] = (0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!) / 255
    }
    // Movers placed for the old size would sit in the wrong places; the scene places new ones.
    card.movers = []
  }

  /** Whether a card is drawn now: on screen, and on wide screens risen and not yet covered. */
  const live = (card: Card): boolean => {
    if (!card.seen || !card.maskData) return false
    if (card.el.classList.contains('is-waiting')) return false
    return (parseFloat(card.el.style.getPropertyValue('--fx-under')) || 0) < 0.97
  }

  const draw = (card: Card, now: number, dt: number): void => {
    const { w, h, ratio } = card.size
    const { cell, ox, oy, cols, rows } = card.grid
    const g = card.paint
    const t = (now - clock) / 1000
    const since = t - card.entered
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, w, h)

    const here = pointer.card === card
    card.light.k += ((here ? 1 : 0) - card.light.k) * 0.08
    if (here) {
      card.light.x += (pointer.x - card.light.x) * 0.18
      card.light.y += (pointer.y - card.light.y) * 0.18
    }
    while (card.ripples.length && t - card.ripples[0]!.born > RIPPLE_SECONDS) card.ripples.shift()

    // 1. How much light each cell catches: the base drift, the scene's own light, the entrance front, the pointer's
    //    pool, the ripples.
    const data = card.maskData!.data
    const front = since < ENTER_SECONDS ? soft(0, 1, since / ENTER_SECONDS) * 1.3 - 0.15 : 2
    const pool = Math.max(w, h) * 0.3
    for (let r = 0; r < rows; r++) {
      const y = oy + (r + 0.5) * cell
      for (let c = 0; c < cols; c++) {
        const x = ox + (c + 0.5) * cell
        let a = soft(0.5, 0.85, noise(c * 0.07 - t * 0.25, r * 0.1 + t * 0.05)) * BASE_LIFT
        a = Math.max(a, card.scene.lift(card, x, y, t))
        if (front < 2) {
          const d = (x / w) * 0.85 + (y / h) * 0.15 - front
          a = Math.max(a, Math.exp(-(d * d) / 0.004) * 0.6)
        }
        if (card.light.k > 0.01) {
          const d = Math.hypot(x - card.light.x, y - card.light.y) / pool
          a = Math.max(a, card.light.k * 0.45 * Math.exp(-d * d * 2))
        }
        for (const rp of card.ripples) {
          const old = (t - rp.born) / RIPPLE_SECONDS
          const off = (Math.hypot(x - rp.x, y - rp.y) - old * Math.max(w, h) * 0.95) / (cell * 3)
          a = Math.max(a, Math.exp(-off * off) * (1 - old) * 0.6)
        }
        data[(r * cols + c) * 4 + 3] = a * 255
      }
    }
    card.maskPaint.putImageData(card.maskData!, 0, 0)
    g.imageSmoothingEnabled = true
    g.drawImage(card.mask, ox, oy, cols * cell, rows * cell)

    // The stars' own marks, while they twinkle.
    const twinkles = card.stars.map((s) => {
      const [x, y] = at(card, s.u, s.v)
      return { x, y, k: Math.max(0, Math.sin(t * s.speed + s.phase)) ** 3, color: s.color }
    })
    for (const s of twinkles) {
      if (s.k < 0.02) continue
      const spot = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, cell * 1.8)
      spot.addColorStop(0, `rgba(0, 0, 0, ${s.k})`)
      spot.addColorStop(1, 'rgba(0, 0, 0, 0)')
      g.fillStyle = spot
      g.fillRect(s.x - cell * 2, s.y - cell * 2, cell * 4, cell * 4)
    }

    // 2. The painting itself, kept where the light falls: screened onto the card, the marks there brighten.
    g.globalCompositeOperation = 'source-in'
    g.drawImage(card.image!, card.fit.x, card.fit.y, card.fit.w, card.fit.h)

    // 3. Glyphs and glows of our own, added as light: the scene's, the stars', the base's.
    g.globalCompositeOperation = 'lighter'
    const ink = new Ink(card)
    const solid = new Ink(card)
    card.scene.draw(card, ink, solid, t, dt)
    for (const s of twinkles) {
      if (s.k < 0.02) continue
      ink.glow(s.x, s.y, cell * 3, s.color, 0.7 * s.k)
      // At its brightest a star flares into a + across its neighbours.
      if (s.k > 0.6) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) ink.mark('+', s.x + dx * cell, s.y + dy * cell, s.color, 0.6 * (s.k - 0.6) / 0.4)
    }
    // The entrance front decodes the card: marks just ahead of it turn over.
    if (front < 2) {
      const tick = Math.floor(t * 20)
      for (let r = 0; r < rows; r++) {
        const y = oy + (r + 0.5) * cell
        for (let c = 0; c < cols; c++) {
          const x = ox + (c + 0.5) * cell
          const d = (x / w) * 0.85 + (y / h) * 0.15 - front
          if (d < -0.04 || d > 0.1 || hash(c + tick, r) > 0.6) continue
          solid.contrast(MARKS[Math.floor(hash(c, r + tick) * MARKS.length)]!, x, y, d < 0.02 ? GOLD : PALE, d < 0.02 ? [206, 110, 52] : [36, 92, 112], 0.8 * (d < 0 ? 1 + d / 0.04 : 1 - d / 0.1))
        }
      }
    }
    // A click's ring turns marks over as it passes.
    for (const rp of card.ripples) {
      const old = (t - rp.born) / RIPPLE_SECONDS
      const radius = old * Math.max(w, h) * 0.95
      const steps = Math.ceil((radius * Math.PI * 2) / cell)
      for (let i = 0; i < steps; i++) {
        if (hash(i, Math.floor(t * 18)) > 0.6) continue
        const a = (i / steps) * Math.PI * 2
        solid.contrast(MARKS[(i + Math.floor(t * 12)) % MARKS.length]!, rp.x + Math.cos(a) * radius, rp.y + Math.sin(a) * radius, WARM, [226, 104, 52], 0.85 * (1 - old))
      }
    }
    // The pointer's sparks, rising and fading through ×+:·.
    card.sparks = age(card.sparks, t)
    for (const p of card.sparks) {
      const s = t - p.born
      solid.contrast(MARKS[Math.max(0, MARKS.length - 1 - Math.floor((s / p.life) * MARKS.length))]!, p.x + p.vx * s, p.y + p.vy * s, WARM, [226, 104, 52], 0.9 * fade(p, t))
    }
    if (card.light.k > 0.01) ink.glow(card.light.x, card.light.y, pool * 0.6, WARM, 0.12 * card.light.k)
    ink.flush(g)
    const p = card.solid
    p.setTransform(ratio, 0, 0, ratio, 0, 0)
    p.clearRect(0, 0, w, h)
    solid.flush(p, 1.25)
  }

  const loop = (now: number): void => {
    frame = 0
    if (!onScreen || document.hidden) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    for (const card of cards) {
      let isFront = live(card)
      if (isFront && narrow.matches) {
        // Stacked cards: one counts as front once a third of it is in the window, so its sweep is seen.
        const box = card.el.getBoundingClientRect()
        isFront = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0) > box.height / 3
      } else if (isFront) isFront = (parseFloat(card.el.style.getPropertyValue('--fx-under')) || 0) < 0.5
      if (isFront && !card.front) card.entered = (now - clock) / 1000
      card.front = isFront
      // A card no longer drawn lets go of the pointer's light, so an old pool does not come back with it.
      if (!live(card)) card.light.k = 0
    }
    for (const card of cards) if (live(card)) draw(card, now, dt)
    frame = requestAnimationFrame(loop)
  }
  const start = (): void => {
    if (!frame && onScreen && !document.hidden) {
      last = 0
      frame = requestAnimationFrame(loop)
    }
  }
  // A frame already asked for is taken back, so a hidden and shown tab, or the section leaving and coming back, runs
  // one loop.
  const stop = (): void => {
    cancelAnimationFrame(frame)
    frame = 0
  }

  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = cards.find((c) => c.el === entry.target)
      if (!card) continue
      card.seen = entry.isIntersecting
      if (card.seen) load(card)
      else card.front = false
    }
    onScreen = cards.some((c) => c.seen)
    if (onScreen) start()
    else stop()
  }, { rootMargin: '200px 0px' })
  const sized = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const card = cards.find((c) => c.el === entry.target)
      if (card) fit(card)
    }
  })
  for (const card of cards) {
    seen.observe(card.el)
    sized.observe(card.el)
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))

  /** The card under the pointer is the top one there (the glow canvases take no pointer events). */
  const aim = (clientX: number, clientY: number): void => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.fx-card')
    const card = cards.find((c) => c.el === el && live(c)) ?? null
    pointer.card = card
    if (!card) return
    const box = card.el.getBoundingClientRect()
    pointer.x = ((clientX - box.left) / box.width) * card.size.w
    pointer.y = ((clientY - box.top) / box.height) * card.size.h
    if (!card.light.k) {
      card.light.x = pointer.x
      card.light.y = pointer.y
    }
  }
  stack?.addEventListener('pointermove', (event) => {
    pointer.cx = event.clientX
    pointer.cy = event.clientY
    aim(event.clientX, event.clientY)
    const card = pointer.card
    if (!card) return
    // A spark or two in each new cell the pointer crosses.
    const { cell } = card.grid
    const key = `${card.index}:${Math.round(pointer.x / cell)}:${Math.round(pointer.y / cell)}`
    if (key === pointer.lastCell) return
    pointer.lastCell = key
    const t = (performance.now() - clock) / 1000
    for (let i = 0; i < 2; i++) {
      card.sparks.push({ x: pointer.x + (hash(t, i) - 0.5) * cell * 3, y: pointer.y + (hash(i, t) - 0.5) * cell * 3, vx: (hash(t + 1, i) - 0.5) * cell * 2, vy: -cell * (1.5 + hash(i, t + 2) * 3), born: t, life: 0.9 + hash(t, i + 3) * 0.6, seed: 0 })
    }
    if (card.sparks.length > 80) card.sparks.splice(0, card.sparks.length - 80)
  }, { passive: true })
  stack?.addEventListener('pointerleave', () => {
    pointer.card = null
    pointer.cx = -1
  }, { passive: true })
  stack?.addEventListener('pointerdown', (event) => {
    aim(event.clientX, event.clientY)
    const card = pointer.card
    if (!card) return
    card.ripples.push({ x: pointer.x, y: pointer.y, born: (performance.now() - clock) / 1000 })
    if (card.ripples.length > 3) card.ripples.shift()
  }, { passive: true })
  // A wheel scroll moves cards under a still pointer; the pool moves to whichever card is on top there now.
  window.addEventListener('scroll', () => {
    if (pointer.cx >= 0) aim(pointer.cx, pointer.cy)
  }, { passive: true })
}
