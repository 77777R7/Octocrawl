/** Brings the hero artwork to life in its own glyphs: stars twinkle across the night sky and a meteor crosses it
 * now and then, light drifts through the sunset clouds, mist crosses the blue ranges, and on the mountain in the
 * lower right embers twinkle and a band of alpenglow rises. Every so often light climbs the mountain to its summit
 * and the octopus answers it (w2l:summit). Only glyphs that light up are drawn, over their painted twins, so at rest
 * the artwork shows exactly as painted; the page's text and the octopus keep calm ground behind them. */
import { ART, BASE, CLOUD, COOL, EMBER, FACE, RIDGE, SUMMIT, position, smooth } from './heroArtwork'

// The artwork's glyph cell (natural px); its hand-drawn spacing drifts between about 12 and 13 px.
const CELL = 12.5
// Shapes from the artwork's own glyph family.
const DOT = 1
const FOUR = 2
const CROSS = 3
const STAR = 4
// Each ramp runs from a glyph's first glow to full light, in the artwork's own colours.
const ORANGE = 0
const GOLD = 1
const CRIMSON = 2
const ICE = 3
const ROSE = 4
const PEACH = 5
const LAVENDER = 6
const RAMPS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[226, 84, 50], [247, 120, 68], [255, 170, 110]],
  [[255, 214, 150], [255, 236, 196], [255, 250, 236]],
  [[176, 44, 70], [220, 70, 84], [255, 125, 112]],
  [[120, 160, 255], [175, 202, 255], [228, 238, 255]],
  [[214, 96, 150], [243, 140, 180], [255, 196, 218]],
  [[255, 166, 118], [255, 196, 156], [255, 230, 208]],
  [[134, 124, 236], [178, 168, 252], [226, 222, 255]],
]
const STEPS = 6
const STYLES = RAMPS.flatMap((stops) => Array.from({ length: STEPS }, (_, step) => {
  const t = (step / (STEPS - 1)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(t))
  const mix = (c: number): number => Math.round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * (t - i))
  return `rgba(${mix(0)},${mix(1)},${mix(2)},${(0.35 + (0.65 * step) / (STEPS - 1)).toFixed(2)})`
}))

// The alpenglow band rises through the mountain, light drifts through the clouds from right to left and mist
// crosses the ranges from left to right. Each takes its travel time, then rests for a while that is never quite the
// same twice. Now and then light climbs the mountain to its summit in CLIMB_MS; the octopus answers it there.
const BAND_TRAVEL = 8000
const BAND_REST = [2500, 7000] as const
const BAND_WIDTH = 0.11
const CLOUD_TRAVEL = 8500
const CLOUD_REST = [2000, 6500] as const
const CLOUD_WIDTH = 0.09
const MIST_TRAVEL = 12000
const MIST_REST = [3000, 9000] as const
const MIST_WIDTH = 0.09
const CLIMB_MS = 1500
const CLIMB_REST = [9000, 15000] as const
const CLIMB_WIDTH = 0.05
const FADE_MS = 700
// Stars over the upper sky, about one per STAR_AREA square px and fainter towards the horizon: most are small points,
// some carry a soft glow, and the brightest sparkle at the top of their twinkle, in cool white, ice and warm white.
// None shine through the sunset clouds or the mountain. A meteor crosses now and then.
const STAR_SKY = 0.44
const STAR_AREA = 9000
const STAR_COLORS = ['244,247,255', '207,224,255', '255,234,204']
const STAR_GLOW = [0, 13, 18]
const METEOR_REST = [14000, 30000] as const
// Star sprites are drawn once at this size and scaled down onto the canvas.
const SPRITE = 64
// The sunset clouds are mapped in cells of this size (css px) to keep stars and meteors off them.
const CLOUD_CELL = 24
// The glyphs wait out the octopus's first seconds, when it decides whether this device can animate at all, and a
// device too slow to add them gives them up for the visit: the octopus matters more.
const WARMUP_MS = 6500
const SLOW_MS = 80
const SLOW_LIMIT = 12
// How strongly the alpenglow lights each of the mountain's kinds: the sunlit faces most, its blue dots barely.
const BAND_GAIN = [0.95, 0.75, 0.3]
// The share of each kind that twinkles on its own clock, how brightly, and in which colours. The painted sky
// twinkles least: the stars are its light.
const BLINK_SHARE = [0.22, 0.7, 0.1, 0.18, 0.1]
const BLINK_GAIN = [0.65, 0.9, 0.5, 0.65, 0.6]
const BLINK_RAMP = [GOLD, ORANGE, ICE, GOLD, ICE]
const POINTER_RAMP = [GOLD, ORANGE, ORANGE, GOLD, ICE]
// The wash's mask is a blurred shape, so a quarter of the canvas's resolution is plenty.
const MASK_SCALE = 4

type Glyph = {
  x: number
  y: number
  kind: number
  // The share of its kind's light it takes, fading at the mountain's edges.
  weight: number
  // On the mountain, its height from the artwork's foot (0) to the summit (1), how far ahead of or behind a
  // climbing light it lights, so the light's edge follows no ruler, and how far it has risen out of the dark
  // foreground (0 to 1), where passing light would only speckle the ground; elsewhere its x across the artwork (0 to
  // 1) and how far down into the ranges it sits (0 to 1).
  along: number
  lead: number
  rise: number
  across: number
  low: number
  peak: number
  blink: number
  phase: number
  period: number
}
type Star = { x: number; y: number; size: number; base: number; color: number; period: number; phase: number; calm: number }
type Meteor = { at: number; x: number; y: number; dx: number; dy: number; speed: number; life: number; length: number }
type Artwork = { width: number; height: number; glyphs: Glyph[] }
type Box = { l: number; t: number; r: number; b: number }
type Zone = Box & { strength: number; header: boolean }
export type HeroGlyphs = { start(): void; dispose(): void }

const hash = (x: number, y: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return v - Math.floor(v)
}
const between = ([low, high]: readonly [number, number]): number => low + Math.random() * (high - low)
/** A small seeded generator, so the stars keep their places for a given hero size. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A star's soft glow, or the four rays of its sparkle, in one colour, brightest at the centre. */
function sprite(color: string, sparkle: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE
  canvas.height = SPRITE
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const mid = SPRITE / 2
  if (sparkle) {
    for (const across of [true, false]) {
      const ray = across ? context.createLinearGradient(0, 0, SPRITE, 0) : context.createLinearGradient(0, 0, 0, SPRITE)
      ray.addColorStop(0, `rgba(${color},0)`)
      ray.addColorStop(0.5, `rgba(${color},1)`)
      ray.addColorStop(1, `rgba(${color},0)`)
      context.fillStyle = ray
      if (across) context.fillRect(0, mid - 1.5, SPRITE, 3)
      else context.fillRect(mid - 1.5, 0, 3, SPRITE)
    }
  } else {
    const glow = context.createRadialGradient(mid, mid, 0, mid, mid, mid)
    glow.addColorStop(0, `rgba(${color},1)`)
    glow.addColorStop(0.12, `rgba(${color},0.85)`)
    glow.addColorStop(0.3, `rgba(${color},0.2)`)
    glow.addColorStop(0.6, `rgba(${color},0.04)`)
    glow.addColorStop(1, `rgba(${color},0)`)
    context.fillStyle = glow
    context.fillRect(0, 0, SPRITE, SPRITE)
  }
  return canvas
}

function glyphsFrom(found: Float32Array, width: number): Glyph[] {
  const glyphs: Glyph[] = []
  for (let i = 0; i < found.length; i += 4) {
    const x = found[i]
    const y = found[i + 1]
    const kind = found[i + 2]
    const along = (BASE - y) / (BASE - SUMMIT[1])
    glyphs.push({
      x,
      y,
      kind,
      weight: found[i + 3],
      along,
      lead: (hash(x + 7, y + 3) - 0.5) * 0.04,
      rise: smooth(0.16, 0.4, along),
      across: x / width,
      low: smooth(520, 720, y),
      peak: Math.hypot(x - SUMMIT[0], y - SUMMIT[1]),
      // Whether a glyph twinkles and when are separate draws, so the twinkles never start in step.
      blink: hash(x, y) < BLINK_SHARE[kind] ? BLINK_GAIN[kind] : 0,
      phase: hash(y + 31, x + 17),
      period: 3200 + hash(y, x) * 5600,
    })
  }
  return glyphs
}

let analysis: Promise<Artwork> | undefined
/** Decodes the artwork off the main thread and finds its glyphs in a worker, once per page, so the page never
 * pays a frame for it. A failure is not kept: a later mount tries again. Without workers, OffscreenCanvas or
 * createImageBitmap the painted artwork simply stays as it is. */
function load(): Promise<Artwork> {
  if (!analysis) {
    analysis = (async () => {
      const bitmap = await createImageBitmap(await (await fetch(ART)).blob())
      const { width, height } = bitmap
      const worker = new Worker(new URL('./heroGlyphsWorker.ts', import.meta.url), { type: 'module' })
      try {
        const found = await new Promise<Float32Array>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<Float32Array>) => resolve(event.data)
          worker.onerror = () => reject(new Error('Glyph analysis failed'))
          worker.postMessage(bitmap, [bitmap])
        })
        return { width, height, glyphs: glyphsFrom(found, width) }
      } finally {
        worker.terminate()
      }
    })()
    analysis.catch(() => { analysis = undefined })
  }
  return analysis
}

/** Draws nothing until start(). The artwork's analysis starts at once, off the main thread, and is shared by
 * later mounts. */
export function playHeroGlyphs(layer: HTMLElement, hero: HTMLElement): HeroGlyphs {
  const ready = load()
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-glyphs-canvas'
  const context = canvas.getContext('2d')
  const backdrop = hero.querySelector<HTMLElement>('.hero-backdrop')
  const mask = document.createElement('canvas')
  const glows = STAR_COLORS.map((color) => sprite(color, false))
  const sparkles = STAR_COLORS.map((color) => sprite(color, true))
  let artwork: { width: number; height: number } | undefined
  let glyphs: Glyph[] = []
  // Each glyph's centre on the canvas (css px), how much of its light the page lets through there, and the shape
  // it is drawn in this frame.
  let xs = new Float32Array(0)
  let ys = new Float32Array(0)
  let calm = new Float32Array(0)
  let shapes = new Uint8Array(0)
  let stars: Star[] = []
  let zones: Zone[] = []
  // Where the starry sky ends (css px, above the summit) and the cells the sunset clouds cover.
  let skyline = 0
  let clouds = new Set<number>()
  // Where the mountain's light is at height 0 (the artwork's foot) and 1 (the summit), on the canvas, and the
  // mountain's box there: its light is never drawn outside it.
  let low = 0
  let high = 0
  let mountain: Box = { l: 0, t: 0, r: 0, b: 0 }
  // The canvas's top left on the page, for pointer positions.
  let origin = { x: 0, y: 0 }
  let size = CELL
  let width = 0
  let height = 0
  let ratio = 1
  let resolution: MediaQueryList | undefined
  const lists: number[][] = STYLES.map(() => [])
  let raf = 0
  let last = 0
  let clock = 0
  let gain = 0
  let target = 1
  let started = false
  let warm = false
  let disposed = false
  let slow = 0
  let warmup = 0
  // When each passing light's current pass began (or will begin), on the glyphs' clock.
  let bandAt = between([0, 2000])
  let cloudAt = between([1500, 4000])
  let mistAt = between([2000, 6000])
  let climbAt = between([3500, 6000])
  let summitSent = false
  let meteor: Meteor | null = null
  let meteorAt = between([8000, 15000])
  const pointer = { x: 0, y: 0, active: false }
  // The hero's size and the form's messages decide the layout; the first report of each is the layout just made.
  let settled = false
  const resize = new ResizeObserver(() => {
    if (settled) layout()
    settled = true
  })

  /** How many of the cells around a point (of nine) the sunset clouds cover. */
  function clouded(x: number, y: number): number {
    let near = 0
    const cx = Math.floor(x / CLOUD_CELL)
    const cy = Math.floor(y / CLOUD_CELL)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (clouds.has((cx + dx) * 4096 + cy + dy)) near++
    return near
  }

  /** How much light the page lets through at a point: none under its text, a little less over the octopus.
   * Stars are tiny, so they may come nearer the header's links than the glyphs do. */
  function calmAt(x: number, y: number, star = false): number {
    let open = 1
    for (const z of zones) {
      const outside = Math.hypot(Math.max(z.l - x, 0, x - z.r), Math.max(z.t - y, 0, y - z.b))
      open *= 1 - (star && z.header ? z.strength / 2 : z.strength) * (1 - smooth(0, 48, outside))
    }
    return open
  }

  function layout(): void {
    if (!artwork) return
    const w = hero.clientWidth
    const h = hero.clientHeight
    const scale = Math.max(w / artwork.width, h / artwork.height)
    const style = backdrop ? getComputedStyle(backdrop) : null
    const ix = position(style?.backgroundPositionX, w - artwork.width * scale)
    const iy = position(style?.backgroundPositionY, h - artwork.height * scale)
    const sx = (x: number): number => ix + x * scale
    const sy = (y: number): number => iy + y * scale
    width = w
    height = h
    // Sharp on retina screens, but never more than about 3 million pixels to clear and composite each frame.
    ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(3e6 / Math.max(1, width * height)))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    size = CELL * scale
    low = sy(BASE)
    high = sy(SUMMIT[1])
    mountain = { l: Math.max(0, sx(RIDGE[0][0]) - 40), t: Math.max(0, Math.min(...RIDGE.map(([, y]) => sy(y)))), r: width, b: height }
    const box = hero.getBoundingClientRect()
    origin = { x: box.left + window.scrollX, y: box.top + window.scrollY }
    // The page's own content keeps calm ground: text stays legible and the octopus keeps its silhouette.
    zones = []
    const zone = (selector: string, pad: number, strength: number): void => {
      const rect = hero.querySelector(selector)?.getBoundingClientRect()
      if (!rect?.width || !rect.height) return
      zones.push({ l: rect.left - box.left - pad, t: rect.top - box.top - pad, r: rect.right - box.left + pad, b: rect.bottom - box.top + pad, strength, header: selector === '.site-header' })
    }
    zone('.site-header', 8, 0.95)
    zone('#hero-title', 28, 0.95)
    zone('.hero-description', 28, 0.95)
    zone('#form-message', 12, 0.95)
    zone('#capability-message', 12, 0.95)
    zone(hero.querySelector('.hero-ascii-layer') ? '.hero-ascii-layer' : '#hero-ascii', 0, 0.3)
    zone('.hero-scroll', 12, 0.8)
    zone('#hero-motion', 8, 0.8)
    xs = new Float32Array(glyphs.length)
    ys = new Float32Array(glyphs.length)
    calm = new Float32Array(glyphs.length)
    shapes = new Uint8Array(glyphs.length)
    glyphs.forEach((g, i) => {
      const x = sx(g.x)
      const y = sy(g.y)
      xs[i] = x
      ys[i] = y
      calm[i] = x > -size && x < width + size && y > -size && y < height + size ? calmAt(x, y) : 0
    })
    // The stars keep their places for a given size, denser and brighter towards the top of the sky, which ends
    // above the summit. The sunset clouds hide those behind them.
    skyline = Math.max(0, Math.min(height * STAR_SKY, high - 24))
    clouds = new Set()
    glyphs.forEach((g, i) => {
      if (g.kind === CLOUD && ys[i] < skyline + CLOUD_CELL) clouds.add(Math.floor(xs[i] / CLOUD_CELL) * 4096 + Math.floor(ys[i] / CLOUD_CELL))
    })
    const random = seeded(Math.round(width) * 7919 + Math.round(height))
    stars = []
    for (let n = Math.round((width * skyline) / STAR_AREA); n > 0; n--) {
      const x = random() * width
      const y = 6 + random() ** 1.3 * Math.max(0, skyline - 6)
      const roll = random()
      const magnitude = roll < 0.07 ? 3 : roll < 0.3 ? 2 : 1
      const tint = random()
      const base = (magnitude === 3 ? 0.8 : magnitude === 2 ? 0.5 : 0.32) + random() * 0.25
      const period = 2600 + random() * 5200
      const phase = random()
      const open = calmAt(x, y, true) * (1 - (0.55 * y) / Math.max(1, skyline)) * Math.max(0, 1 - clouded(x, y) / 3)
      if (open > 0.05) stars.push({ x, y, size: magnitude, base: Math.min(1, base), color: tint < 0.6 ? 0 : tint < 0.85 ? 1 : 2, period, phase, calm: open })
    }
    // The mountain's glow washes over the mountain only: below the ridge, fading in from the left, and clear of
    // the calm zones.
    mask.width = Math.max(1, Math.ceil(width / MASK_SCALE))
    mask.height = Math.max(1, Math.ceil(height / MASK_SCALE))
    const m = mask.getContext('2d')
    if (m) {
      m.setTransform(1 / MASK_SCALE, 0, 0, 1 / MASK_SCALE, 0, 0)
      m.filter = `blur(${Math.max(1, Math.round((10 * scale) / MASK_SCALE))}px)`
      m.fillStyle = '#fff'
      m.beginPath()
      for (const [x, y] of RIDGE) m.lineTo(sx(x), sy(y + 10))
      m.lineTo(width + 40, height + 40)
      m.lineTo(sx(RIDGE[0][0]) - 40, height + 40)
      m.closePath()
      m.fill()
      m.filter = 'none'
      m.globalCompositeOperation = 'destination-in'
      const fade = m.createLinearGradient(sx(600), 0, sx(820), 0)
      fade.addColorStop(0, 'rgba(255,255,255,0)')
      fade.addColorStop(1, '#fff')
      m.fillStyle = fade
      m.fillRect(0, 0, width, height)
      m.globalCompositeOperation = 'destination-out'
      m.filter = `blur(${Math.round(24 / MASK_SCALE)}px)`
      for (const z of zones) {
        m.fillStyle = `rgba(0,0,0,${z.strength})`
        m.fillRect(z.l, z.t, z.r - z.l, z.b - z.t)
      }
      m.filter = 'none'
      m.globalCompositeOperation = 'source-over'
    }
    // Follow the window to a screen with another pixel ratio.
    resolution?.removeEventListener('change', layout)
    resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    resolution.addEventListener('change', layout)
    // Resizing the canvas cleared it.
    if (gain > 0) draw()
  }

  function dots(shape: number, x: number, y: number): void {
    if (!context) return
    const d = Math.max(1, size * 0.14)
    if (shape === DOT) {
      context.rect(x - d / 2, y - d / 2, d, d)
      return
    }
    const r = size * 0.2
    context.rect(x - r - d / 2, y - r - d / 2, d, d)
    context.rect(x + r - d / 2, y - r - d / 2, d, d)
    context.rect(x - r - d / 2, y + r - d / 2, d, d)
    context.rect(x + r - d / 2, y + r - d / 2, d, d)
  }

  function cross(shape: number, x: number, y: number): void {
    if (!context) return
    const a = size * 0.25
    context.moveTo(x - a, y - a)
    context.lineTo(x + a, y + a)
    context.moveTo(x + a, y - a)
    context.lineTo(x - a, y + a)
    if (shape === STAR) {
      context.moveTo(x, y - a * 1.1)
      context.lineTo(x, y + a * 1.1)
    }
  }

  /** A meteor's path: high in the sky, falling gently left or right, clear of the page's text, the octopus and the
   * sunset clouds, and ending above the mountain. */
  function spawnMeteor(): Meteor | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = ((16 + Math.random() * 18) * Math.PI) / 180
      const dx = Math.cos(angle) * (Math.random() < 0.7 ? -1 : 1)
      const dy = Math.sin(angle)
      const x = width * (0.1 + Math.random() * 0.8)
      const y = skyline * (0.08 + Math.random() * 0.4)
      // It burns out before it could reach the sky's lower edge.
      const travel = Math.min(240 + Math.random() * 200, (skyline - y) / dy)
      if (travel < 140) continue
      let clear = true
      for (let step = 0; step <= 8 && clear; step++) {
        const px = x + (dx * travel * step) / 8
        const py = y + (dy * travel * step) / 8
        if (px < 0 || px > width || clouded(px, py) || calmAt(px, py) < 0.9) clear = false
      }
      const speed = 0.55 + Math.random() * 0.3
      if (clear) return { at: clock, x, y, dx, dy, speed, life: travel / speed, length: travel * (0.35 + Math.random() * 0.2) }
    }
    return null
  }

  /** The canvas height of the mountain's light: 0 at the artwork's foot, 1 at the summit. */
  const at = (t: number): number => low + (high - low) * t

  /** The mountain's light itself, under the glyphs: the band's gradient, the climbing light's brighter sheet and
   * the pointer's warmth, each filled only where it can show and clipped to the mountain. Like the glyphs, the
   * passing light rises out of the dark foreground rather than washing over it. */
  function wash(context: CanvasRenderingContext2D, band: number, reach: number): void {
    let drawn: Box | undefined
    const fill = (style: CanvasGradient, l: number, t: number, r: number, b: number): void => {
      const box = { l: Math.max(l, mountain.l), t: Math.max(t, mountain.t), r: Math.min(r, mountain.r), b: Math.min(b, mountain.b) }
      if (box.r <= box.l || box.b <= box.t) return
      context.fillStyle = style
      context.fillRect(box.l, box.t, box.r - box.l, box.b - box.t)
      drawn = drawn ? { l: Math.min(drawn.l, box.l), t: Math.min(drawn.t, box.t), r: Math.max(drawn.r, box.r), b: Math.max(drawn.b, box.b) } : box
    }
    if (band > -0.3 && band < 1.3) {
      context.globalAlpha = gain * smooth(0.1, 0.35, band)
      const top = at(band + BAND_WIDTH * 2.4)
      const bottom = at(band - BAND_WIDTH * 2.4)
      const glow = context.createLinearGradient(0, bottom, 0, top)
      glow.addColorStop(0, 'rgba(247,120,68,0)')
      glow.addColorStop(0.32, 'rgba(247,120,68,0.12)')
      glow.addColorStop(0.5, 'rgba(255,158,96,0.18)')
      glow.addColorStop(0.68, 'rgba(220,70,84,0.12)')
      glow.addColorStop(1, 'rgba(220,70,84,0)')
      fill(glow, 0, top, width, bottom)
    }
    if (reach > -1 && reach < 1.3) {
      context.globalAlpha = gain * (0.3 + 0.7 * smooth(0.1, 0.35, reach))
      const top = at(reach + CLIMB_WIDTH * 1.5)
      const bottom = at(reach - CLIMB_WIDTH * 4)
      const sheet = context.createLinearGradient(0, bottom, 0, top)
      sheet.addColorStop(0, 'rgba(247,120,68,0)')
      sheet.addColorStop(0.75, 'rgba(255,170,110,0.14)')
      sheet.addColorStop(1, 'rgba(255,170,110,0)')
      fill(sheet, 0, top, width, bottom)
    }
    if (pointer.active) {
      context.globalAlpha = gain
      const warm = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 140)
      warm.addColorStop(0, 'rgba(247,120,68,0.16)')
      warm.addColorStop(1, 'rgba(247,120,68,0)')
      fill(warm, pointer.x - 140, pointer.y - 140, pointer.x + 140, pointer.y + 140)
    }
    context.globalAlpha = 1
    if (!drawn) return
    const l = Math.floor(drawn.l)
    const t = Math.floor(drawn.t)
    const w = Math.ceil(drawn.r) - l
    const h = Math.ceil(drawn.b) - t
    context.globalCompositeOperation = 'destination-in'
    context.drawImage(mask, l / MASK_SCALE, t / MASK_SCALE, w / MASK_SCALE, h / MASK_SCALE, l, t, w, h)
    context.globalCompositeOperation = 'source-over'
  }

  /** The stars twinkle slowly, each on its own clock; the brightest sparkle at the top of their twinkle. */
  function sky(context: CanvasRenderingContext2D): void {
    for (const star of stars) {
      const wave = 0.5 + 0.5 * Math.sin(((clock / star.period + star.phase) % 1) * Math.PI * 2)
      const light = star.base * (0.5 + 0.5 * wave) * gain * star.calm
      if (light < 0.04) continue
      if (star.size === 1) {
        context.fillStyle = `rgba(${STAR_COLORS[star.color]},${light.toFixed(2)})`
        context.fillRect(star.x - 0.6, star.y - 0.6, 1.2, 1.2)
        continue
      }
      const glow = STAR_GLOW[star.size]
      context.globalAlpha = light
      context.drawImage(glows[star.color], star.x - glow / 2, star.y - glow / 2, glow, glow)
      if (star.size === 3 && wave > 0.7) {
        const spark = 8 + 10 * ((wave - 0.7) / 0.3)
        context.globalAlpha = light * ((wave - 0.7) / 0.3)
        context.drawImage(sparkles[star.color], star.x - spark / 2, star.y - spark / 2, spark, spark)
      }
      context.globalAlpha = 1
    }
    if (!meteor) return
    // A meteor: a bright head with a tail that grows as it sets off, fading in, then out before it ends.
    const age = clock - meteor.at
    const t = age / meteor.life
    const hx = meteor.x + meteor.dx * meteor.speed * age
    const hy = meteor.y + meteor.dy * meteor.speed * age
    const tail = meteor.length * Math.min(1, t * 3)
    const alpha = gain * Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.35)
    if (alpha <= 0) return
    const streak = context.createLinearGradient(hx - meteor.dx * tail, hy - meteor.dy * tail, hx, hy)
    streak.addColorStop(0, 'rgba(255,240,220,0)')
    streak.addColorStop(1, `rgba(255,246,232,${(0.85 * alpha).toFixed(2)})`)
    context.strokeStyle = streak
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(hx - meteor.dx * tail, hy - meteor.dy * tail)
    context.lineTo(hx, hy)
    context.stroke()
    context.fillStyle = `rgba(255,250,240,${alpha.toFixed(2)})`
    context.fillRect(hx - 1.2, hy - 1.2, 2.4, 2.4)
  }

  function draw(): void {
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    for (const list of lists) list.length = 0
    const band = ((clock - bandAt) / BAND_TRAVEL) * 1.7 - 0.35
    const cloud = 1.25 - ((clock - cloudAt) / CLOUD_TRAVEL) * 1.6
    const mist = ((clock - mistAt) / MIST_TRAVEL) * 1.4 - 0.2
    const since = clock - climbAt
    const reach = since >= 0 && since < CLIMB_MS * 2 ? (since / CLIMB_MS) * 1.3 - 0.15 : -9
    context.lineCap = 'round'
    wash(context, band, reach)
    sky(context)
    for (let i = 0; i < glyphs.length; i++) {
      const open = calm[i]
      if (!open) continue
      const g = glyphs[i]
      const kind = g.kind
      let light = 0
      let ramp = ORANGE
      if (g.blink) {
        const phase = (clock / g.period + g.phase) % 1
        const twinkle = phase < 0.14 ? Math.sin((phase / 0.14) * Math.PI) ** 1.5 * g.blink * (kind <= COOL ? 0.55 + 0.45 * g.rise : 1) : 0
        if (twinkle > light) {
          light = twinkle
          ramp = BLINK_RAMP[kind]
        }
      }
      if (kind === FACE || kind === EMBER || kind === COOL) {
        // The band's leading edge is crimson, its core gold on the sunlit faces, its tail orange.
        const off = g.along - band
        const glow = Math.exp(-((off / BAND_WIDTH) ** 2)) * BAND_GAIN[kind] * g.rise
        if (glow > light) {
          light = glow
          ramp = off > 0.035 ? CRIMSON : off < -0.035 || kind !== FACE ? ORANGE : GOLD
        }
        if (reach > -1) {
          const lead = g.along + g.lead - reach
          const edge = Math.exp(-((lead / CLIMB_WIDTH) ** 2))
          // Reaching the summit, the light flares there for a moment.
          const flare = g.peak < 80 ? Math.exp(-(((since - CLIMB_MS * 0.95) / 380) ** 2)) * (1 - g.peak / 80) : 0
          const lit = Math.min(1, (edge + (lead < 0 ? Math.exp(lead * 7) * 0.4 : 0)) * (0.3 + 0.7 * g.rise) + flare)
          if (lit > light) {
            light = lit
            ramp = GOLD
          }
        }
      } else if (kind === CLOUD) {
        // Light drifts through the clouds from right to left: rose ahead, gold at its heart, peach behind.
        const off = g.across - cloud
        const glow = Math.exp(-((off / CLOUD_WIDTH) ** 2)) * 0.85
        if (glow > light) {
          light = glow
          ramp = off < -0.02 ? ROSE : off > 0.02 ? PEACH : GOLD
        }
      } else if (g.low) {
        // Mist crosses the ranges from left to right, lavender ahead of its icy body.
        const off = g.across - mist
        const glow = Math.exp(-((off / MIST_WIDTH) ** 2)) * 0.6 * g.low
        if (glow > light) {
          light = glow
          ramp = off > 0.03 ? LAVENDER : ICE
        }
      }
      if (pointer.active) {
        const near = smooth(0, 1, 1 - Math.hypot(xs[i] - pointer.x, ys[i] - pointer.y) / 120) * 0.7
        if (near > light) {
          light = near
          ramp = POINTER_RAMP[kind]
        }
      }
      light *= g.weight * gain * open
      if (light < 0.08) continue
      const step = Math.min(STEPS - 1, Math.floor(light * STEPS))
      shapes[i] = kind === FACE || kind === CLOUD
        ? (step < 3 ? CROSS : STAR)
        : kind === EMBER ? (step < 2 ? FOUR : step < 5 ? CROSS : STAR)
        : kind === COOL ? (step < 3 ? FOUR : CROSS)
        : step < 2 ? DOT : step < 4 ? FOUR : STAR
      lists[ramp * STEPS + step].push(i)
    }
    context.lineWidth = Math.max(1, size * 0.15)
    lists.forEach((list, bucket) => {
      if (!list.length) return
      context.fillStyle = STYLES[bucket]
      context.strokeStyle = STYLES[bucket]
      context.beginPath()
      for (const i of list) if (shapes[i] < CROSS) dots(shapes[i], xs[i], ys[i])
      context.fill()
      context.beginPath()
      for (const i of list) if (shapes[i] >= CROSS) cross(shapes[i], xs[i], ys[i])
      context.stroke()
    })
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    // About 30 fps is plenty for twinkles and slow light.
    if (now - last < 32) return
    slow = now - last > SLOW_MS ? slow + 1 : Math.max(0, slow - 1)
    if (slow >= SLOW_LIMIT) {
      close()
      return
    }
    const dt = Math.min(50, now - last)
    last = now
    clock += dt
    gain = target ? Math.min(1, gain + dt / FADE_MS) : Math.max(0, gain - dt / FADE_MS)
    if (clock - bandAt > BAND_TRAVEL) bandAt = clock + between(BAND_REST)
    if (clock - cloudAt > CLOUD_TRAVEL) cloudAt = clock + between(CLOUD_REST)
    if (clock - mistAt > MIST_TRAVEL) mistAt = clock + between(MIST_REST)
    if (clock - climbAt > CLIMB_MS * 2) {
      climbAt = clock + between(CLIMB_REST)
      summitSent = false
    }
    // The climbing light reaches the summit: the octopus answers, unless the hero is coming to rest.
    if (!summitSent && target && clock - climbAt >= (CLIMB_MS * 1.15) / 1.3) {
      summitSent = true
      hero.dispatchEvent(new CustomEvent('w2l:summit'))
    }
    if (meteor && clock - meteor.at > meteor.life) meteor = null
    if (!meteor && clock >= meteorAt) {
      meteor = spawnMeteor()
      meteorAt = clock + between(METEOR_REST)
    }
    draw()
    // Resting and faded out: the painted artwork is all that shows, so nothing needs to run.
    if (!target && gain === 0) stop()
  }
  function run(): void {
    if (raf || disposed || !warm || !artwork || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    cancelAnimationFrame(raf)
    raf = 0
  }

  const onRest = (event: Event): void => {
    target = (event as CustomEvent<{ rest?: boolean } | null>).detail?.rest ? 0 : 1
    run()
  }
  const onPointer = (event: PointerEvent): void => {
    pointer.x = event.pageX - origin.x
    pointer.y = event.pageY - origin.y
    pointer.active = event.pointerType === 'mouse'
  }
  const onLeave = (): void => { pointer.active = false }
  const onVisibility = (): void => {
    if (document.hidden) stop()
    else run()
  }

  function close(): void {
    if (disposed) return
    disposed = true
    stop()
    window.clearTimeout(warmup)
    resize.disconnect()
    resolution?.removeEventListener('change', layout)
    hero.removeEventListener('w2l:rest', onRest)
    hero.removeEventListener('pointermove', onPointer)
    hero.removeEventListener('pointerleave', onLeave)
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.remove()
  }

  return {
    start() {
      if (started || disposed || !context) return
      started = true
      warmup = window.setTimeout(() => {
        warm = true
        run()
      }, WARMUP_MS)
      // Listening before the artwork is analysed: a rest asked for meanwhile still holds once it is.
      hero.addEventListener('w2l:rest', onRest)
      hero.addEventListener('pointermove', onPointer, { passive: true })
      hero.addEventListener('pointerleave', onLeave)
      document.addEventListener('visibilitychange', onVisibility)
      void ready.then((result) => {
        if (disposed) return
        artwork = { width: result.width, height: result.height }
        glyphs = result.glyphs
        layer.append(canvas)
        layout()
        resize.observe(hero)
        for (const selector of ['#form-message', '#capability-message']) {
          const element = hero.querySelector(selector)
          if (element) resize.observe(element)
        }
        run()
      }).catch(() => { /* The painted artwork stays as it is. */ })
    },
    dispose: close,
  }
}
