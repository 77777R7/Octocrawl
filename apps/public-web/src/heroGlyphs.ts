/** Brings the hero artwork to life in its own glyphs: light drifts through the sunset clouds, a sea of clouds lies in
 * the valleys of the blue ranges (heroFog.ts), and on the mountain in the lower right embers twinkle, now and then
 * let a spark rise (heroEmbers.ts), and a band of alpenglow rises. Every so often light climbs the mountain to its
 * summit and the octopus answers it (w2l:summit). Above them runs the night sky of heroSky.ts: stars, flares and
 * meteors. Only glyphs that light up are drawn, over their painted twins, so at rest
 * the artwork shows exactly as painted; the page's text and the octopus keep calm ground behind them. */
import { ART, BASE, CLOUD, COOL, EMBER, FACE, RIDGE, SUMMIT, between, hash, position, smooth } from './heroArtwork'
import { createEmbers, type Embers } from './heroEmbers'
import { createFog, type Fog, type FogPrep } from './heroFog'
import type { Analysis } from './heroGlyphsWorker'
import { createSky } from './heroSky'

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
const RAMPS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[226, 84, 50], [247, 120, 68], [255, 170, 110]],
  [[255, 214, 150], [255, 236, 196], [255, 250, 236]],
  [[176, 44, 70], [220, 70, 84], [255, 125, 112]],
  [[120, 160, 255], [175, 202, 255], [228, 238, 255]],
  [[214, 96, 150], [243, 140, 180], [255, 196, 218]],
  [[255, 166, 118], [255, 196, 156], [255, 230, 208]],
]
const STEPS = 6
const STYLES = RAMPS.flatMap((stops) => Array.from({ length: STEPS }, (_, step) => {
  const t = (step / (STEPS - 1)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(t))
  const mix = (c: number): number => Math.round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * (t - i))
  return `rgba(${mix(0)},${mix(1)},${mix(2)},${(0.35 + (0.65 * step) / (STEPS - 1)).toFixed(2)})`
}))

// The alpenglow band rises through the mountain and light drifts through the clouds from right to left. Each takes its travel time, then rests for a while that is never quite the
// same twice. Now and then light climbs the mountain to its summit in CLIMB_MS; the octopus answers it there.
const BAND_TRAVEL = 8000
const BAND_REST = [2500, 7000] as const
const BAND_WIDTH = 0.11
const CLOUD_TRAVEL = 8500
const CLOUD_REST = [2000, 6500] as const
const CLOUD_WIDTH = 0.09
const CLIMB_MS = 1500
const CLIMB_REST = [9000, 15000] as const
const CLIMB_WIDTH = 0.05
const FADE_MS = 700
// The entrance: when the octopus wakes (its startup's flash, about 1.1 s after it starts) its light carries on into
// the landscape. The glyphs and the sky light up inside a circle that spreads from the octopus to the hero's corners
// in REVEAL_MS (less for a hero that comes back), its edge feathered over FEATHER px inside and RING px outside:
// everything is alive about 4 s after the octopus starts.
const REVEAL_MS = 2700
const REVEAL_AGAIN_MS = 1400
const RING = 46
const FEATHER = 150
// The starry sky covers the upper part of the hero, down to a little above the summit.
const STAR_SKY = 0.44
// The sunset clouds are mapped in cells of this size (css px) to keep the sky's stars and meteors off them.
const CLOUD_CELL = 24
// A device too slow to add the glyphs gives them up for the visit, at once while the octopus is still deciding
// whether this device can animate at all: the octopus matters more.
const SLOW_MS = 80
const EARLY_MS = 5000
const EARLY_LIMIT = 6
const SLOW_LIMIT = 12
// How strongly the alpenglow lights each of the mountain's kinds: the sunlit faces most, its blue dots barely.
const BAND_GAIN = [0.95, 0.75, 0.3]
// The share of each kind that twinkles on its own clock, how brightly, and in which colours. The painted sky
// twinkles least: the stars are its light.
const BLINK_SHARE = [0.22, 0.7, 0.1, 0.18, 0.1]
const BLINK_GAIN = [0.65, 0.9, 0.5, 0.65, 0.6]
const BLINK_RAMP = [GOLD, ORANGE, ICE, GOLD, ICE]
const POINTER_RAMP = [GOLD, ORANGE, ORANGE, GOLD, ICE]
// A click sends a ring of cool light through the artwork's glyphs (gold through the clouds): it spreads RIPPLE_SPEED
// px a ms for RIPPLE_MS, fading as it goes.
const RIPPLE_MS = 900
const RIPPLE_SPEED = 0.42
const RIPPLE_WIDTH = 28
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
  // 1).
  along: number
  lead: number
  rise: number
  across: number
  peak: number
  blink: number
  phase: number
  period: number
}
// The sea of clouds' pixel work and the embers that may let sparks go come from the same worker.
type Artwork = { width: number; height: number; glyphs: Glyph[]; fog: FogPrep; sparks: Int32Array }
type Box = { l: number; t: number; r: number; b: number }
type Zone = Box & { strength: number; header: boolean }
/** start() prepares the layer when the octopus first draws; enter() lights it up when the octopus wakes. */
export type HeroGlyphs = { start(): void; enter(): void; dispose(): void }

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
      peak: Math.hypot(x - SUMMIT[0], y - SUMMIT[1]),
      // Whether a glyph twinkles and when are separate draws, so the twinkles never start in step.
      blink: hash(x, y) < BLINK_SHARE[kind] ? BLINK_GAIN[kind] : 0,
      phase: hash(y + 31, x + 17),
      period: 3200 + hash(y, x) * 5600,
    })
  }
  return glyphs
}

// The glyphs have made their first entrance on this page.
let introduced = false

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
        const { found, fog, sparks } = await new Promise<Analysis>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<Analysis>) => resolve(event.data)
          worker.onerror = () => reject(new Error('Glyph analysis failed'))
          worker.postMessage(bitmap, [bitmap])
        })
        return { width, height, glyphs: glyphsFrom(found, width), fog, sparks }
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
  const sky = createSky()
  // The sea of clouds and the rising sparks, once the artwork's analysis is in.
  let fog: Fog | undefined
  let embers: Embers | undefined
  let sparkSources: number[] = []
  let artwork: { width: number; height: number } | undefined
  let glyphs: Glyph[] = []
  // Each glyph's centre on the canvas (css px), how much of its light the page lets through there, and the shape
  // it is drawn in this frame.
  let xs = new Float32Array(0)
  let ys = new Float32Array(0)
  let calm = new Float32Array(0)
  let shapes = new Uint8Array(0)
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
  // The entrance's ring: when it set off on the glyphs' clock, how long it takes, where it spreads from (css px),
  // and how far it must go.
  let revealAt = 0
  let revealMs = REVEAL_MS
  let source = { x: 0, y: 0 }
  let ringSpan = 1
  let disposed = false
  let slow = 0
  let firstFrame = 0
  // When each passing light's current pass began (or will begin), on the glyphs' clock: all soon after the start,
  // so the hero comes alive at once.
  let bandAt = between([0, 800])
  let cloudAt = between([300, 1500])
  let climbAt = between([900, 1500])
  let summitSent = false
  const pointer = { x: 0, y: 0, active: false }
  // Recent clicks (canvas css px), when each was on the glyphs' clock.
  const clicks: Array<{ x: number; y: number; at: number }> = []
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
    // The entrance spreads from the octopus's middle to the farthest corner of the hero.
    const octopus = (hero.querySelector('.hero-ascii-layer') ?? hero.querySelector('#hero-ascii'))?.getBoundingClientRect()
    source = octopus?.width ? { x: octopus.left - box.left + octopus.width / 2, y: octopus.top - box.top + octopus.height / 2 } : { x: width / 2, y: height / 2 }
    ringSpan = Math.hypot(Math.max(source.x, width - source.x), Math.max(source.y, height - source.y)) + FEATHER
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
    // The night sky ends a little above the summit; the sunset clouds cover part of it.
    skyline = Math.max(0, Math.min(height * STAR_SKY, high - 24))
    clouds = new Set()
    glyphs.forEach((g, i) => {
      if (g.kind === CLOUD && ys[i] < skyline + CLOUD_CELL) clouds.add(Math.floor(xs[i] / CLOUD_CELL) * 4096 + Math.floor(ys[i] / CLOUD_CELL))
    })
    sky.layout({ width, height, skyline, cell: size, calmAt, cloudAt: (x, y) => Math.min(1, clouded(x, y) / 3) })
    fog?.layout({ width, height, ix, iy, scale, cell: size, calmAt })
    // Sparks leave twinkling embers in the mountain's dark flank, clear of the page and above its darkened foot.
    embers?.layout({
      size,
      xs,
      ys,
      sources: sparkSources.flatMap((i) => (calm[i] > 0.9 && xs[i] > 0 && xs[i] < width && ys[i] > 0 && ys[i] < height * 0.8 ? [{ i, period: glyphs[i].period, phase: glyphs[i].phase }] : [])),
      calmAt,
    })
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

  function draw(): void {
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    for (const list of lists) list.length = 0
    const band = ((clock - bandAt) / BAND_TRAVEL) * 1.7 - 0.35
    const cloud = 1.25 - ((clock - cloudAt) / CLOUD_TRAVEL) * 1.6
    const since = clock - climbAt
    const reach = since >= 0 && since < CLIMB_MS * 2 ? (since / CLIMB_MS) * 1.3 - 0.15 : -9
    // The entrance's ring: how far it has spread, easing out, or -1 once it has passed the hero's corners.
    const spread = (clock - revealAt) / revealMs
    const ring = spread < 1 ? (1 - (1 - Math.max(0, spread)) ** 2) * ringSpan : -1
    context.lineCap = 'round'
    wash(context, band, reach)
    sky.draw(context, clock, gain)
    for (let i = 0; i < glyphs.length; i++) {
      const open = calm[i]
      if (!open) continue
      const g = glyphs[i]
      const kind = g.kind
      let light = 0
      let ramp = ORANGE
      if (g.blink) {
        const phase = (clock / g.period + g.phase) % 1
        // Embers near a rising spark hold still, so the spark reads.
        const still = kind === EMBER && embers ? embers.hush(xs[i], ys[i]) : 0
        const twinkle = phase < 0.14 ? Math.sin((phase / 0.14) * Math.PI) ** 1.5 * g.blink * (kind <= COOL ? 0.55 + 0.45 * g.rise : 1) * (1 - still) : 0
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
      }
      if (pointer.active) {
        const near = smooth(0, 1, 1 - Math.hypot(xs[i] - pointer.x, ys[i] - pointer.y) / 120) * 0.7
        if (near > light) {
          light = near
          ramp = POINTER_RAMP[kind]
        }
      }
      for (const click of clicks) {
        const age = clock - click.at
        const off = Math.hypot(xs[i] - click.x, ys[i] - click.y) - age * RIPPLE_SPEED
        if (off < -RIPPLE_WIDTH * 3 || off > RIPPLE_WIDTH * 3) continue
        const wave = Math.exp(-((off / RIPPLE_WIDTH) ** 2)) * (1 - age / RIPPLE_MS) ** 1.3
        if (wave > light) {
          light = wave
          ramp = kind === CLOUD ? GOLD : ICE
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
    // The sea of clouds lies in front of the ranges' lit glyphs; the sparks rise over everything.
    fog?.draw(context, clock, gain)
    embers?.draw(context, clock, gain)
    if (ring >= 0) {
      // Nothing is lit beyond the ring yet.
      const inside = context.createRadialGradient(source.x, source.y, Math.max(0, ring - FEATHER), source.x, source.y, Math.max(1, ring + RING))
      inside.addColorStop(0, '#000')
      inside.addColorStop(1, 'rgba(0,0,0,0)')
      context.globalCompositeOperation = 'destination-in'
      context.fillStyle = inside
      context.fillRect(0, 0, width, height)
      context.globalCompositeOperation = 'source-over'
    }
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    // About 30 fps is plenty for twinkles and slow light.
    if (now - last < 32) return
    firstFrame ||= now
    slow = now - last > SLOW_MS ? slow + 1 : Math.max(0, slow - 1)
    if (slow >= (now - firstFrame < EARLY_MS ? EARLY_LIMIT : SLOW_LIMIT)) {
      close()
      return
    }
    const dt = Math.min(50, now - last)
    last = now
    clock += dt
    gain = target ? Math.min(1, gain + dt / FADE_MS) : Math.max(0, gain - dt / FADE_MS)
    if (clock - bandAt > BAND_TRAVEL) bandAt = clock + between(BAND_REST)
    if (clock - cloudAt > CLOUD_TRAVEL) cloudAt = clock + between(CLOUD_REST)
    if (clock - climbAt > CLIMB_MS * 2) {
      climbAt = clock + between(CLIMB_REST)
      summitSent = false
    }
    // The climbing light reaches the summit: the octopus answers, unless the hero is coming to rest.
    if (!summitSent && target && clock - climbAt >= (CLIMB_MS * 1.15) / 1.3) {
      summitSent = true
      hero.dispatchEvent(new CustomEvent('w2l:summit'))
    }
    while (clicks.length && clock - clicks[0]!.at > RIPPLE_MS) clicks.shift()
    sky.step(clock)
    fog?.step(clock)
    if (embers) {
      // No spark leaves an ember the alpenglow is passing over, nor while light climbs to the summit.
      const band = ((clock - bandAt) / BAND_TRAVEL) * 1.7 - 0.35
      const climbing = clock - climbAt > -300 && clock - climbAt < CLIMB_MS * 2
      embers.step(clock, (i) => climbing || Math.exp(-(((glyphs[i].along - band) / BAND_WIDTH) ** 2)) * glyphs[i].rise > 0.15)
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
  const onClick = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    clicks.push({ x: event.pageX - origin.x, y: event.pageY - origin.y, at: clock })
    if (clicks.length > 3) clicks.shift()
    run()
  }
  const onVisibility = (): void => {
    if (document.hidden) stop()
    else run()
  }

  function close(): void {
    if (disposed) return
    disposed = true
    stop()
    resize.disconnect()
    resolution?.removeEventListener('change', layout)
    hero.removeEventListener('w2l:rest', onRest)
    hero.removeEventListener('pointermove', onPointer)
    hero.removeEventListener('pointerleave', onLeave)
    hero.removeEventListener('pointerdown', onClick)
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.remove()
  }

  return {
    start() {
      if (started || disposed || !context) return
      started = true
      // Listening before the artwork is analysed: a rest asked for meanwhile still holds once it is.
      hero.addEventListener('w2l:rest', onRest)
      hero.addEventListener('pointermove', onPointer, { passive: true })
      hero.addEventListener('pointerleave', onLeave)
      hero.addEventListener('pointerdown', onClick, { passive: true })
      document.addEventListener('visibilitychange', onVisibility)
      void ready.then((result) => {
        if (disposed) return
        artwork = { width: result.width, height: result.height }
        glyphs = result.glyphs
        fog = createFog(result.fog)
        embers = createEmbers()
        // Only embers that twinkle let sparks go, at the height of a twinkle.
        sparkSources = Array.from(result.sparks).filter((i) => glyphs[i].blink > 0)
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
    enter() {
      if (!started || disposed || warm) return
      warm = true
      revealAt = clock
      revealMs = introduced ? REVEAL_AGAIN_MS : REVEAL_MS
      introduced = true
      run()
    },
    dispose: close,
  }
}
