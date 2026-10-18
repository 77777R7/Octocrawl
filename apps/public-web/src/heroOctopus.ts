/** The hero's octopus, typed in the artwork's own marks on a 2D canvas behind the headline (docs/public-preview.md).
 * Its source image is analysed once per page into a silhouette, tones, colours and eyes; every glyph cell then takes a
 * band of marks from that analysis and re-rolls it on its own period. Over that run the startup (a warm decode from
 * the centre, then the octopus lights up from its body out), its answer to the summit's light (w2l:summit), the take
 * while a preview is extracted (w2l:take), the rest while the visitor works with the form (w2l:rest) and the pointer's
 * push. Veils soften the artwork under the silhouette and, while it takes the link, under the ground its arms reach
 * into. It tells the hero when it first draws, when it wakes and when it stops for good (w2l:octopus), and it keeps
 * still while it rests, off screen and in a hidden tab. */
import './heroOctopus.css'

// The artwork's contours set the octopus's glyph scale and colours.
const ARTWORK_SRC = '/assets/mountain-hero.webp'
const OCTOPUS_SRC = '/assets/octopus-original.webp'
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value))
const smoothstep = (value: number): number => value * value * (3 - 2 * value)
const mix = (from: number, to: number, amount: number): number => from + (to - from) * amount
const cellNoise = (x: number, y: number, seed: number): number => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return value - Math.floor(value)
}
const easeOut = (value: number): number => 1 - (1 - clamp(value, 0, 1)) ** 3
const easeInOut = (value: number): number => {
  const v = clamp(value, 0, 1)
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2
}
// Seeds the per-cell timing, dither and arm stagger, so the octopus types the same way on every visit.
const VARIANT = 5

// Glyph row height of the Hero artwork, in natural pixels of mountain-hero.webp. The artwork is hand-drawn,
// so its spacing drifts between ~12 and ~13 px; the octopus's rows follow it at MOTIF_ROW_SCALE.
const ARTWORK_CELL_Y = 12.9
// The Hero shade darkens the artwork by roughly this much where the octopus sits.
const ARTWORK_SHADE = 0.8
// Rows follow the artwork's glyph rows (0.78×, clamped) so the arms keep their curls; columns are a monospace advance.
const MOTIF_ROW_SCALE = 0.78
const MOTIF_ROW_MIN = 8
const MOTIF_ROW_MAX = 11
const MOTIF_ASPECT = 0.6
const MOTIF_FIT = 0.94
const MOTIF_FONT = "Menlo, 'SF Mono', SFMono-Regular, Consolas, 'DejaVu Sans Mono', monospace"
// Tone bands, light to heavy ink, in the artwork's own marks (drawn, not typed) and a few plain ASCII characters:
// dots and colons at the edge, where the silhouette dissolves into the mountain's glyphs, then crosses, then x and X
// in the body, like the crosses the artwork's light draws.
const ART_MARKS: Record<string, number> = { dot: 1, colon: 2, four: 3, cross: 4 }
const MOTIF_EDGES = [0.10, 0.26, 0.40, 0.55, 0.70, 0.85]
const MOTIF_BANDS: string[][] = [
  [],
  ['dot', 'dot', '.'],
  ['colon', 'four', ':'],
  ['+', 'cross', '+'],
  ['x', 'cross', 'x'],
  ['X', 'x', 'X'],
  ['X'],
]
// What the arrival and the octopus's answer to the summit's light are written in.
const WAVE_GLYPHS = [...'+xX*']
type Rgb = readonly [number, number, number]
const WARM_GLOW: Rgb = [255, 214, 188]
// The octopus's own light, when it lights up: its blue lifts to ice white, its warm rim to cream, in LIT_LEVELS
// steps. Warm light is kept for light it receives: the ripple, the summit's answer, the link.
const ICE_LIGHT: Rgb = [232, 241, 255]
const CREAM_LIGHT: Rgb = [255, 244, 222]
const LIT_LEVELS = 5
const EYE_COLOR = '#fff3d6'
// The warm light the eyes catch from the summit, and for how long.
const EYE_GLINT = '255,208,140'
const GLINT_MS = 800
// The octopus decodes out of noise from its centre; the front starts a little way out and eases, so the
// head and inner arms are there within ~150 ms and the arm tips within ~0.8 s.
const ARRIVAL_MS = 1400
const WAVE_MS = 900
// Starting up, once per page view: while the ripple spreads the octopus is typed dormant, at DORMANT_INK of its ink
// and a band lighter, eyes shut. At IGNITE_AT the ripple's warm edge has left the arm tips (arrive - 0.14 = 1 at
// 1080 ms) and the octopus lights up all but at once, from its middle out: each glyph starts IGNITE_SPREAD_MS later
// the further out it sits, grows a band heavier in its own light over IGNITE_RISE_MS, and lets the glow die away over
// IGNITE_FALL_MS at the middle and up to IGNITE_TIP_FALL times that at the arm tips, which let go last. The eyes open
// and catch the light as it begins. Under the page's text the glow keeps to LETTER_GLOW of its strength, below one
// of its LIT_LEVELS, so the glyphs there take the first level of light at most. An octopus that comes back later
// arrives awake.
const DORMANT_INK = 0.5
const DORMANT_TONE = 0.8
const IGNITE_AT = 1130
const IGNITE_SPREAD_MS = 33
const IGNITE_RISE_MS = 66
const IGNITE_FALL_MS = 570
const IGNITE_TIP_FALL = 5 / 3
const IGNITE_DECAY = 3.2
const LETTER_GLOW = 0.19
const IGNITE_MS = IGNITE_SPREAD_MS + IGNITE_RISE_MS + IGNITE_FALL_MS * IGNITE_TIP_FALL
const STARTUP_MS = IGNITE_AT + IGNITE_MS
// An octopus that arrives awake lets the hero know this long after its first frame.
const REWAKE_MS = 400
// The startup has played on this page.
let ignited = false
// Taking: while a preview is extracted the octopus takes the link from the URL card, which its two lowest arms
// already reach behind (the page names the card in data-reach). The arms lift a little, plunge TAKE_REACH_ROWS rows
// behind the card's edge, grip (the glyphs at the edge turn hot), and draw back while a warm packet climbs each arm
// along its own curl to the eyes, which catch its light: TAKE_OPEN_MS in all. While the request runs the arms haul
// hand over hand, one and then the other, HAUL_MS a round, quieter. The page scrolls to the result as soon as it
// comes, so the ending starts at once and is over within TAKE_END_MS: when the page has been read the octopus lights
// up (TAKE_FLASH of its startup's light) and its eyes catch the light, a glint that fades with it; either way its arms
// let go over TAKE_LET_GO_MS, and when the page could not be read it blinks. A result that comes before the take has
// begun (while it waits for the startup or for TAKE_DELAY_MS) ends it unseen: the arms never lifted.
// The opening waits TAKE_DELAY_MS for the octopus to come back to full ink from its dimmer, yielding self.
const TAKE_DELAY_MS = 150
const TAKE_LIFT_MS = 140
const TAKE_LIFT_ROWS = 0.6
const TAKE_PLUNGE_MS = 280
const TAKE_REACH_ROWS = 2.6
const TAKE_GRIP_MS = 200
const TAKE_PULL_MS = 700
const TAKE_CLIMB_MS = 800
const TAKE_OPEN_MS = 1500
const TAKE_GRIP_AT = TAKE_LIFT_MS + TAKE_PLUNGE_MS
const TAKE_PULL_AT = TAKE_GRIP_AT + TAKE_GRIP_MS
// A round of the haul: HAUL_MS and HAUL_ROWS, each a little different every time (HAUL_VARY), and slower once the
// wait has lasted HAUL_LONG_MS.
const HAUL_MS = 1700
const HAUL_DIP_MS = 300
const HAUL_DRAW_MS = 700
const HAUL_ROWS = 1.3
const HAUL_HEAT = 0.55
const HAUL_VARY = 0.15
const HAUL_LONG_MS = 12000
const HAUL_SLOW = 1.5
// At the grip the arms' tips curl this many columns inwards.
const GRIP_CURL = 1.8
// The length of arm a packet covers (css px), and how far from the card's edge the grip shows (rows).
const PACKET = 52
const GRIP_ROWS = 3
const TAKE_FLASH = 0.45
const TAKE_FLASH_RISE_MS = 60
const TAKE_LET_GO_MS = 200
const TAKE_END_MS = 300
// One whole veil (heroOctopus.css: .46 navy over brightness(.68)) takes this share of the ground's light.
const VEIL_DIM = 1 - (1 - 0.46) * 0.68
// The arms' reach fades out over ARM_RAMP rows, ARM_SPAN rows above the card's edge, and ARM_WIDTH columns to
// either side of each arm.
const ARM_SPAN = 12
const ARM_RAMP = 10
const ARM_WIDTH = 7
// How far the pointer (and its fading trail) pushes glyphs aside, how far a pushed glyph is borrowed from (css px),
// and how long the trail lasts.
const PUSH_REACH = 152
const PUSH_SHIFT = 18
const TRAIL_MS = 1050
// The ground under the glyphs is worked out again this often on the octopus's clock (see paintGround).
const GROUND_MS = 150
const GROUND_SEED = 113
// The frame loop runs at about 30 fps. A frame later than SLOW_MS counts as slow (layout work aside): a device too
// slow from the start stops at once, and later only a sustained slowdown (90 net slow frames, 7 s or more) stops it,
// so a passing burst of jank never ends the looping hero for the visit.
const FRAME_MS = 33
const SLOW_MS = 80
const SLOW_START = 8
const SLOW_LATER = 90
const SLOW_START_MS = 6000
// Layout changes are coalesced: the glyph grid is rebuilt once the layer has kept its size this long.
const RESIZE_MS = 140

/** The artwork's own marks: dot, colon, four-dot cross and cross. */
const drawArtworkGlyph = (ctx: CanvasRenderingContext2D, level: number, cx: number, cy: number, size: number): void => {
  const d = Math.max(1, size * 0.14)
  const dot = (x: number, y: number): void => ctx.fillRect(x - d / 2, y - d / 2, d, d)
  const r = size * 0.2
  if (level === 1) { dot(cx, cy); return }
  if (level === 2) { dot(cx, cy - r); dot(cx, cy + r); return }
  if (level === 3) { dot(cx - r, cy - r); dot(cx + r, cy - r); dot(cx - r, cy + r); dot(cx + r, cy + r); return }
  const a = size * 0.25
  ctx.lineWidth = d
  ctx.beginPath()
  ctx.moveTo(cx - a, cy - a)
  ctx.lineTo(cx + a, cy + a)
  ctx.moveTo(cx + a, cy - a)
  ctx.lineTo(cx - a, cy + a)
  ctx.stroke()
}

/** The ground the octopus is typed on: one value of light per glyph cell, between about 0.2 and 0.8 around 0.4, made
 * of a few broad folds and ripples and a fixed grain. It shades each glyph's tone by up to a seventh (drawMotif), so
 * the body never reads as one flat ink. It spans a little more than the layer, so its folds keep their size at every
 * width, and it sways a little as the octopus's clock runs; it holds still while the octopus rests. */
function paintGround(ground: Float32Array, cols: number, rows: number, clock: number): void {
  const sway = clock * 0.001
  for (let y = 0; y < rows; y++) {
    const v0 = 0.11 + 0.78 * (y + 0.5) / rows
    for (let x = 0; x < cols; x++) {
      const u0 = 0.11 + 0.78 * (x + 0.5) / cols
      const u = u0 + 0.012 * Math.sin(sway + v0 * 6.3)
      const v = v0 + 0.006 * Math.cos(sway * 0.8 + u0 * 4.1)
      const broad = 0.13 * Math.sin(u * 10.2 + v * 5.4 + GROUND_SEED)
      const folds = 0.1 * Math.sin(v * 18.5 - u * 7.1 + VARIANT * 1.7)
      const ripples = 0.06 * Math.cos(u * 27.3 + 2.1 * Math.sin(v * 9.8))
      const grain = 0.18 * (cellNoise(x, y, GROUND_SEED) - 0.5)
      ground[x + y * cols] = clamp(0.4 + broad + folds + ripples + grain, 0.19, 0.82)
    }
  }
}

interface Eye { x: number; y: number; ring: number; left: number; right: number; top: number; bottom: number }
interface Analysis {
  size: number
  ink: Float32Array
  lum: Float32Array
  rgb: Uint8ClampedArray
  body: Float32Array
  crop: { x: number; y: number; w: number; h: number }
  lumGround: number
  lumHigh: number
  eyes: Eye[]
  eyePixels: Uint8Array
  socket: number
}

// The source is analysed once at this size: large enough that the gaps between the arms stay open after
// blurring, small enough to sample every glyph cell cheaply on resize.
const ANALYSIS_SIZE = 384
let octopusAnalysis: Analysis | null = null
let analysisRequest: Promise<Analysis | null> | null = null

/** Separable box blur of a square field. */
const boxBlur = (source: Float32Array, size: number, radius: number): Float32Array => {
  const pass = new Float32Array(size * size)
  const out = new Float32Array(size * size)
  const span = radius * 2 + 1
  for (let y = 0; y < size; y++) {
    let sum = 0
    for (let x = -radius; x <= radius; x++) sum += source[y * size + clamp(x, 0, size - 1)]
    for (let x = 0; x < size; x++) {
      pass[y * size + x] = sum / span
      sum += source[y * size + clamp(x + radius + 1, 0, size - 1)] - source[y * size + clamp(x - radius, 0, size - 1)]
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) sum += pass[clamp(y, 0, size - 1) * size + x]
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / span
      sum += pass[clamp(y + radius + 1, 0, size - 1) * size + x] - pass[clamp(y - radius, 0, size - 1) * size + x]
    }
  }
  return out
}

/** The two cream eye squares: small bright blobs with a dark ring around them (measured on the asset:
 * 14 px squares at 560.5,560.5 and 687.5,560.5 of 1254; ring mean luma about 0.10). */
const findEyes = (lum: Float32Array, size: number, crop: Analysis['crop']): Eye[] => {
  const seen = new Uint8Array(size * size)
  const found: Eye[] = []
  for (let y = crop.y + 1; y < crop.y + crop.h - 1; y++) {
    for (let x = crop.x + 1; x < crop.x + crop.w - 1; x++) {
      const start = y * size + x
      if (seen[start] || lum[start] < 0.7) continue
      const stack = [start]
      seen[start] = 1
      let count = 0, sumX = 0, sumY = 0, left = x, right = x, top = y, bottom = y
      while (stack.length) {
        const i = stack.pop()!
        const px = i % size
        const py = (i - px) / size
        count++; sumX += px; sumY += py
        left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py)
        for (const next of [i - 1, i + 1, i - size, i + size]) {
          if (next >= 0 && next < size * size && !seen[next] && lum[next] >= 0.7) { seen[next] = 1; stack.push(next) }
        }
      }
      if (count < 8 || count > 64 || right - left > 9 || bottom - top > 9) continue
      let ring = 0, ringCount = 0
      for (let ry = top - 4; ry <= bottom + 4; ry++) {
        for (let rx = left - 4; rx <= right + 4; rx++) {
          if (rx < 0 || ry < 0 || rx >= size || ry >= size) continue
          if (rx >= left - 1 && rx <= right + 1 && ry >= top - 1 && ry <= bottom + 1) continue
          ring += lum[ry * size + rx]
          ringCount++
        }
      }
      if (ringCount && ring / ringCount < 0.2) found.push({ x: sumX / count + 0.5, y: sumY / count + 0.5, ring: ring / ringCount, left, right, top, bottom })
    }
  }
  return found.sort((a, b) => a.ring - b.ring).slice(0, 2)
}

const analyseOctopus = (source: CanvasImageSource): Analysis | null => {
  const size = ANALYSIS_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, size, size)
  const pixels = context.getImageData(0, 0, size, size).data
  // Ground colour: median of the one-pixel border ring, robust to an odd bright border pixel.
  const ring: number[][] = [[], [], []]
  for (let i = 0; i < size; i++) {
    for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]] as const) {
      const p = (y * size + x) * 4
      for (let c = 0; c < 3; c++) ring[c].push(pixels[p + c])
    }
  }
  const ground = ring.map((values) => values.sort((a, b) => a - b)[values.length >> 1])
  const count = size * size
  const ink = new Float32Array(count)
  const lum = new Float32Array(count)
  const rgb = new Uint8ClampedArray(count * 3)
  for (let i = 0; i < count; i++) {
    const p = i * 4
    ink[i] = Math.hypot(pixels[p] - ground[0], pixels[p + 1] - ground[1], pixels[p + 2] - ground[2]) / 441.67
    lum[i] = (pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722) / 255
    rgb[i * 3] = pixels[p]; rgb[i * 3 + 1] = pixels[p + 1]; rgb[i * 3 + 2] = pixels[p + 2]
  }
  // Two blurs fuse the source's own dot texture into a solid body while the gaps between the arms stay open.
  const body = boxBlur(boxBlur(ink, size, 3), size, 3)
  let left = size, top = size, right = 0, bottom = 0, lumHigh = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (body[i] > 0.06) lumHigh = Math.max(lumHigh, lum[i])
      if (body[i] < 0.05) continue
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  if (left > right) return null
  const cropX = Math.max(0, left - 3)
  const cropY = Math.max(0, top - 3)
  const crop = { x: cropX, y: cropY, w: Math.min(size, right + 4) - cropX, h: Math.min(size, bottom + 4) - cropY }
  const lumGround = (ground[0] * 0.2126 + ground[1] * 0.7152 + ground[2] * 0.0722) / 255
  const eyes = findEyes(lum, size, crop)
  // The eyes are drawn as their own squares, so their light (and antialiased edge) must not brighten the
  // glyphs beside them: those cells see the dark socket around each eye instead, as in the source.
  const eyePixels = new Uint8Array(count)
  let socket = 0
  for (const eye of eyes) {
    socket += eye.ring / eyes.length
    for (let y = Math.max(0, eye.top - 1); y <= Math.min(size - 1, eye.bottom + 1); y++) {
      for (let x = Math.max(0, eye.left - 1); x <= Math.min(size - 1, eye.right + 1); x++) eyePixels[y * size + x] = 1
    }
  }
  return { size, ink, lum, rgb, body, crop, lumGround, lumHigh, eyes, eyePixels, socket }
}

/** Analyse the source once per page. A Blob's bitmap is decoded and scaled off the main thread; drawing
 * the 1254 px image element instead blocks it for ~12 ms (~45 ms on a slow CPU), so that is the fallback. */
const requestOctopusAnalysis = (): Promise<Analysis | null> => {
  analysisRequest ??= (async () => {
    let source: ImageBitmap | HTMLImageElement | null = null
    try {
      const blob = await (await fetch(OCTOPUS_SRC)).blob()
      source = await createImageBitmap(blob, { resizeWidth: ANALYSIS_SIZE, resizeHeight: ANALYSIS_SIZE, resizeQuality: 'high' })
    } catch {
      const image = new Image()
      image.src = OCTOPUS_SRC
      source = await image.decode().then(() => image, () => null)
    }
    octopusAnalysis = source ? analyseOctopus(source) : null
    if (source && 'close' in source) source.close()
    // A failure is not cached here, but the hero treats an octopus that never drew as final for the page view.
    if (!octopusAnalysis) analysisRequest = null
    return octopusAnalysis
  })()
  return analysisRequest
}

// The artwork itself, for its natural size and as a fallback source. It is loaded once per page, by the first octopus.
let artworkImage: HTMLImageElement | null = null
const artwork = (): HTMLImageElement => {
  if (!artworkImage) {
    artworkImage = new Image()
    artworkImage.src = ARTWORK_SRC
  }
  return artworkImage
}
// The scene colours under the octopus come from a small copy of the artwork, decoded and scaled off the main
// thread once per page; sampling the full image on the main thread cost ~12 ms per resize (~50 ms on a slow CPU).
const ARTWORK_THUMB_WIDTH = 420
let artworkThumb: ImageBitmap | HTMLCanvasElement | null = null
let artworkRequest: Promise<unknown> | null = null
let artworkFailed = false

const requestArtworkThumb = (): Promise<unknown> => {
  artworkRequest ??= (async () => {
    try {
      const blob = await (await fetch(ARTWORK_SRC)).blob()
      artworkThumb = await createImageBitmap(blob, { resizeWidth: ARTWORK_THUMB_WIDTH, resizeQuality: 'high' })
    } catch {
      try {
        // Without off-thread scaling, scale the loaded image once here.
        const image = artwork()
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = ARTWORK_THUMB_WIDTH
        canvas.height = Math.round(ARTWORK_THUMB_WIDTH * image.naturalHeight / image.naturalWidth)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('no 2D context')
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        artworkThumb = canvas
      } catch {
        artworkFailed = true
      }
    }
  })()
  return artworkRequest
}

/** The octopus sampled once per glyph cell for the current grid. */
interface Sample {
  // Shape and tone (0 outside the silhouette), the blurred body the veil follows, colour bucket and eye cells.
  tones: Float32Array
  fill: Float32Array
  bucket: Uint8Array
  eye: Uint8Array
  eyes: number[]
  // When each cell re-rolls, the turns it has gained under the pointer, its dither, its distance from the centre (1 at
  // the farthest inked cell) and the least opacity it keeps over a bright ground.
  phase: Float32Array
  period: Float32Array
  boost: Float32Array
  dither: Float32Array
  radius: Float32Array
  floor: Float32Array
  // How quiet its ink is behind the page's text, and how much warm light it takes there.
  calm: Float32Array
  warmth: Float32Array
  // The take: how far along the ink each cell lies from where its arm meets the card, which arm it is on, how much of
  // each arm's reach each column and row takes, which way is inwards, and each column's stagger.
  path: Float32Array
  arm: Uint8Array
  armColumns: [Float32Array, Float32Array]
  armInward: number[]
  armRows: Float32Array
  armStagger: Float32Array
  pathEye: number
  pathCore: number
  // Extents of the silhouette in layer px.
  minX: number
  maxX: number
  minY: number
  maxY: number
  // Fill styles per colour bucket: plain, three steps of warm light and LIT_LEVELS steps of its own light.
  colors: string[]
  hot: string[]
  lit: string[]
}

type Phase = 'start' | 'success' | 'failure'
interface Round { at: number; ms: number; rows: number }
interface Take {
  at: number | null
  skip: number
  endAt: number | null
  outcome: Phase | null
  ending: boolean
  from: [number, number, number]
  rounds: [Round | null, Round | null]
  glinted: boolean
}
interface Stamp { x: number; y: number; at: number; fade: number }
interface Hooks { arrived(): void; awoke(): void; relaid(): void; failed(): void }

/** The octopus on its layer: the glyph grid, what it samples into it, and every frame's glyphs. Its motion runs on
 * a virtual clock that advances only while it is live, so resting freezes every glyph where it is and waking carries
 * on from there. */
class Octopus {
  width = 0
  height = 0
  private cols = 0
  private rows = 0
  private cellW = 0
  private cellH = 0
  private offsetX = 0
  private offsetY = 0
  private fontPx = 7
  private pixelRatio = 1
  private fit = MOTIF_FIT
  private ink = 1
  private scene: Uint8ClampedArray | null = null
  private scenePending = true
  private awaitingArtwork = false
  private awaitingAnalysis = false
  private analysisFailed = false
  private sample: Sample | null = null
  private ground = new Float32Array(0)
  private groundAt: number | null = null
  pointer = { x: -1000, y: -1000, active: false }
  private lastPointer = { x: -1000, y: -1000 }
  private repel = 0
  private trail: Stamp[] = []
  private lastTrailAt = 0
  private pushX = 0
  private pushY = 0
  private clock = 0
  private lastTick = 0
  private restRequested = false
  private resting = false
  private pointerMoved = false
  // Answers to the summit's light (one running, at most one queued) and the glyphs rewritten by past answers.
  private waves: Array<{ at: number; blinked: boolean }> = []
  private rewrites = 0
  // The arrival start (null before the first frame), whether this octopus starts up with the ceremony, and whether it
  // has woken (the flash has begun).
  arrivalAt: number | null = null
  private ceremony = false
  private awake = false
  // The take in progress (see setTake), how far each arm reaches this frame (rows) and how far its tip curls in.
  private take: Take | null = null
  private takeReach = [0, 0]
  private takeCurl = 0
  // The next eye blink, when the eyes last caught the light, and whether the canvas must be redrawn.
  private nextBlink = 4200
  private glintAt: number | null = null
  private dirty = true
  private disposed = false
  private readonly onArtwork = (): void => this.relayout()

  constructor(
    private readonly layer: HTMLElement,
    private readonly veil: HTMLElement,
    private readonly reachVeil: HTMLElement,
    private readonly output: HTMLCanvasElement,
    private readonly out: CanvasRenderingContext2D,
    private readonly hooks: Hooks,
  ) {
    // The artwork sets the glyph scale and colours, so its arrival (or failure) lays the grid out again.
    artwork().addEventListener('load', this.onArtwork)
    artwork().addEventListener('error', this.onArtwork)
  }

  /** Lay the glyph grid out for the layer's size, and sample the artwork and the octopus into it. */
  layout(width: number, height: number): void {
    this.width = width
    this.height = height
    this.grid()
    this.ground = new Float32Array(this.cols * this.rows)
    this.groundAt = null
    this.dirty = true
    this.sampleOctopus()
  }

  /** Lay the grid out again for the current size (the artwork or its colours arrived), and let the owner redraw. */
  private relayout(): void {
    if (!this.width || this.disposed) return
    this.layout(this.width, this.height)
    this.hooks.relaid()
  }

  /** Where the Hero artwork is drawn relative to this layer (CSS `cover` + background-position). */
  private placement(): { scale: number; imageX: number; imageY: number; layerX: number; layerY: number } | null {
    const hero = this.layer.closest('.hero')
    const backdrop = hero?.querySelector('.hero-backdrop')
    const image = artwork()
    if (!hero || !backdrop || !image.naturalWidth) return null
    const heroRect = hero.getBoundingClientRect()
    const layerRect = this.layer.getBoundingClientRect()
    if (!heroRect.width || !heroRect.height || !layerRect.width || !layerRect.height) return null
    const [rawX = '50%', rawY = '50%'] = getComputedStyle(backdrop).backgroundPosition.split(' ')
    const position = (raw: string): number => raw === 'center' ? 0.5 : clamp(parseFloat(raw) / 100 || 0, 0, 1)
    const scale = Math.max(heroRect.width / image.naturalWidth, heroRect.height / image.naturalHeight)
    return {
      scale,
      imageX: (heroRect.width - image.naturalWidth * scale) * position(rawX),
      imageY: (heroRect.height - image.naturalHeight * scale) * position(rawY),
      layerX: layerRect.left - heroRect.left,
      layerY: layerRect.top - heroRect.top,
    }
  }

  /** The glyph grid follows the artwork's glyph rows, and each cell takes the artwork's averaged colour under it. */
  private grid(): void {
    const art = this.placement()
    const scale = art?.scale ?? 0.8
    // The page sets how much of its layer the octopus fills (--octopus-fit) and how strongly its glyphs are inked
    // (--octopus-ink), so it keeps the left window's weight at every width; the static octopus follows both.
    const style = getComputedStyle(this.layer)
    this.fit = parseFloat(style.getPropertyValue('--octopus-fit')) || MOTIF_FIT
    this.ink = parseFloat(style.getPropertyValue('--octopus-ink')) || 1
    this.cellH = clamp(ARTWORK_CELL_Y * scale * MOTIF_ROW_SCALE, MOTIF_ROW_MIN, MOTIF_ROW_MAX)
    this.cellW = this.cellH * MOTIF_ASPECT
    this.fontPx = Math.max(7, Math.round(Math.min(this.cellH * 0.96, this.cellW / 0.6) * 2) / 2)
    this.cols = Math.max(1, Math.floor(this.width / this.cellW))
    this.rows = Math.max(1, Math.floor(this.height / this.cellH))
    this.offsetX = (this.width - this.cols * this.cellW) / 2
    this.offsetY = (this.height - this.rows * this.cellH) / 2
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1)
    this.output.width = Math.max(1, Math.round(this.width * this.pixelRatio))
    this.output.height = Math.max(1, Math.round(this.height * this.pixelRatio))
    for (const veil of [this.veil, this.reachVeil]) {
      Object.assign(veil.style, {
        left: `${this.offsetX}px`,
        top: `${this.offsetY}px`,
        width: `${this.cols * this.cellW}px`,
        height: `${this.rows * this.cellH}px`,
      })
    }
    this.scene = null
    // The first frame waits while the artwork or its thumbnail is on its way (see drawMotif); without them the
    // octopus goes ahead untinted.
    this.scenePending = art ? !artworkThumb && !artworkFailed : !artwork().complete
    if (!art) return
    if (!artworkThumb) {
      // The shared thumbnail scales off the main thread; sample (once) when it lands, or go on without it.
      if (!this.awaitingArtwork && !artworkFailed) {
        this.awaitingArtwork = true
        void requestArtworkThumb().then(() => {
          this.awaitingArtwork = false
          this.relayout()
        })
      }
      return
    }
    // One averaged artwork colour per glyph cell, used to tint the octopus glyph drawn there.
    const sample = document.createElement('canvas')
    sample.width = this.cols
    sample.height = this.rows
    const context = sample.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.imageSmoothingQuality = 'high'
    const thumb = artworkThumb.width / artwork().naturalWidth
    context.drawImage(
      artworkThumb,
      (art.layerX + this.offsetX - art.imageX) / art.scale * thumb,
      (art.layerY + this.offsetY - art.imageY) / art.scale * thumb,
      this.cols * this.cellW / art.scale * thumb,
      this.rows * this.cellH / art.scale * thumb,
      0, 0, this.cols, this.rows,
    )
    this.scene = context.getImageData(0, 0, this.cols, this.rows).data
  }

  /** Sample the analysed octopus once per glyph cell: its shape, tone, colour bucket and eyes, plus the
   * per-cell timing that keeps the glyphs changing at different moments. */
  private sampleOctopus(): void {
    const analysis = octopusAnalysis
    if (!analysis) {
      // The shared analysis decodes off the main thread; sample (once) when it lands.
      if (!this.awaitingAnalysis && !this.analysisFailed) {
        this.awaitingAnalysis = true
        void requestOctopusAnalysis().then((result) => {
          this.awaitingAnalysis = false
          if (this.disposed) return
          if (result) this.sampleOctopus()
          else {
            // Without the source's shape there is nothing to type: the owner stops and reports a stall.
            this.analysisFailed = true
            this.hooks.failed()
          }
        })
      }
      return
    }
    // The artwork's colours lay the grid out again when they land; a sample taken before them would be thrown away.
    if (this.scenePending) return
    const { size, ink, lum, rgb, body, crop, lumGround, lumHigh, eyePixels, socket } = analysis
    const { cols, rows, cellW, cellH } = this
    const count = cols * rows
    // Contain the silhouette in the grid, centred, in layer px per analysis px.
    const scale = Math.min(cols * cellW / crop.w, rows * cellH / crop.h) * this.fit
    const drawX = (cols * cellW - crop.w * scale) / 2
    const drawY = (rows * cellH - crop.h * scale) / 2
    const litRange = Math.max(0.05, lumHigh - lumGround)
    const tones = new Float32Array(count)
    const fill = new Float32Array(count)
    const bucketOf = new Uint8Array(count)
    const eye = new Uint8Array(count)
    const phase = new Float32Array(count)
    const period = new Float32Array(count)
    const dither = new Float32Array(count)
    const radius = new Float32Array(count)
    const floor = new Float32Array(count)
    const buckets = new Map<string, { index: number; r: number; g: number; b: number; n: number }>()
    const scene = this.scene
    for (let cy = 0; cy < rows; cy++) {
      const y0 = Math.floor(crop.y + (cy * cellH - drawY) / scale)
      const y1 = Math.max(y0 + 1, Math.ceil(crop.y + ((cy + 1) * cellH - drawY) / scale))
      for (let cx = 0; cx < cols; cx++) {
        const i = cx + cy * cols
        const x0 = Math.floor(crop.x + (cx * cellW - drawX) / scale)
        const x1 = Math.max(x0 + 1, Math.ceil(crop.x + ((cx + 1) * cellW - drawX) / scale))
        let n = 0, b = 0, k = 0, l = 0, lMax = 0, best = -1, weight = 0, wr = 0, wg = 0, wb = 0
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            n++
            if (x < 0 || y < 0 || x >= size || y >= size) continue
            const p = y * size + x
            b += body[p]
            k += ink[p]
            if (eyePixels[p]) {
              l += socket
              continue
            }
            l += lum[p]
            if (lum[p] > lMax) { lMax = lum[p]; best = p }
            const w = ink[p] + 0.001
            weight += w
            wr += rgb[p * 3] * w; wg += rgb[p * 3 + 1] * w; wb += rgb[p * 3 + 2] * w
          }
        }
        b /= n
        k /= n
        l /= n
        // The blurred body also closes the two- and three-cell gaps between the arms. Typing needs the source's
        // own ink in the cell as well, so those gaps stay open and the arms keep their curled tips; the veil
        // still follows the blurred body.
        const inside = clamp((b - 0.035) / 0.05, 0, 1) * smoothstep(clamp((k - 0.05) / 0.07, 0, 1))
        const lit = clamp((0.6 * lMax + 0.4 * l - lumGround) / litRange, 0, 1)
        const tone = inside * (0.28 + 0.72 * lit ** 0.85)
        tones[i] = tone
        fill[i] = b
        phase[i] = cellNoise(i, 5, VARIANT) * 3000
        period[i] = 1000 + 2000 * cellNoise(i, 3, VARIANT)
        dither[i] = (cellNoise(cx, cy, VARIANT) - 0.5) * 0.144
        // Over the bright sunset the veil leaves a mid-grey bed rather than navy, so glyphs there gain opacity
        // (and lift toward their highlight below) to keep the lower arms readable.
        const at = i * 4
        const bright = scene ? smoothstep(clamp(((scene[at] * 0.2126 + scene[at + 1] * 0.7152 + scene[at + 2] * 0.0722) / 255 - 0.3) / 0.35, 0, 1)) : 0
        floor[i] = 0.3 + 0.22 * bright
        // Only cells that can ever be drawn get a colour, so empty sky never skews a bucket's mean.
        if (tone < 0.06 || !weight) continue
        // The brightest pixel keeps a dot's own colour; plain averaging turns the cream and blue dots grey.
        let r: number, g: number, bl: number
        if (best >= 0 && ink[best] > 0.12) { r = rgb[best * 3]; g = rgb[best * 3 + 1]; bl = rgb[best * 3 + 2] }
        else { r = wr / weight; g = wg / weight; bl = wb / weight }
        let cr: number, cg: number, cb: number
        const warm = clamp((r - bl) / 90, 0, 1) >= 0.35
        if (!warm) {
          // Blue body, brightened to read over the navy sky; brighter cells lift toward ice blue.
          cr = mix(mix(r, 92, 0.55), 190, tone * 0.45); cg = mix(mix(g, 138, 0.55), 212, tone * 0.45); cb = mix(mix(bl, 255, 0.55), 255, tone * 0.45)
        } else {
          // The warm rim keeps its orange; highlights lift toward cream.
          cr = mix(r, 255, tone * 0.25); cg = mix(g, 232, tone * 0.25); cb = mix(bl, 200, tone * 0.25)
        }
        if (bright) {
          const lift = bright * 0.4
          cr = mix(cr, warm ? 255 : 214, lift); cg = mix(cg, warm ? 238 : 228, lift); cb = mix(cb, warm ? 220 : 255, lift)
        }
        if (scene) {
          cr = mix(cr, scene[at] * ARTWORK_SHADE, 0.1); cg = mix(cg, scene[at + 1] * ARTWORK_SHADE, 0.1); cb = mix(cb, scene[at + 2] * ARTWORK_SHADE, 0.1)
        }
        // A handful of colour buckets keeps fillStyle changes rare while drawing.
        const key = `${Math.round(clamp((cr - cb) / 180 + 0.5, 0, 1) * 4)}:${Math.round((cr + cg + cb) / 765 * 5)}`
        let entry = buckets.get(key)
        if (!entry) {
          entry = { index: buckets.size, r: 0, g: 0, b: 0, n: 0 }
          buckets.set(key, entry)
        }
        entry.r += cr; entry.g += cg; entry.b += cb; entry.n++
        bucketOf[i] = entry.index
      }
    }
    const colors: string[] = []
    const hot: string[] = []
    const lit: string[] = []
    const css = (rgbValues: number[]): string => `rgb(${rgbValues.map(Math.round).join(',')})`
    for (const { r, g, b, n } of buckets.values()) {
      const mean = [r / n, g / n, b / n]
      colors.push(css(mean))
      for (let level = 1; level <= 3; level++) {
        const amount = 0.18 + 0.5 * level / 3
        hot.push(css(mean.map((value, c) => mix(value, WARM_GLOW[c], amount))))
      }
      const light = mean[0] - mean[2] > 30 ? CREAM_LIGHT : ICE_LIGHT
      for (let level = 1; level <= LIT_LEVELS; level++) {
        const amount = 0.16 + 0.62 * level / LIT_LEVELS
        lit.push(css(mean.map((value, c) => mix(value, light[c], amount))))
      }
    }
    // The eyes stay fixed, cream squares in the cells that hold the source's eyes.
    const eyes: number[] = []
    for (const spot of analysis.eyes) {
      const ex = Math.floor((drawX + (spot.x - crop.x) * scale) / cellW)
      const ey = Math.floor((drawY + (spot.y - crop.y) * scale) / cellH)
      if (ex < 0 || ey < 0 || ex >= cols || ey >= rows || eye[ex + ey * cols]) continue
      eye[ex + ey * cols] = 1
      eyes.push(ex + ey * cols)
    }
    const centreOf = (i: number): [number, number] => [this.offsetX + (i % cols + 0.5) * cellW, this.offsetY + (Math.floor(i / cols) + 0.5) * cellH]
    // Extents and centroid of the silhouette in layer px: the answer crosses them, the arrival grows from the centre.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, sumX = 0, sumY = 0, members = 0
    for (let i = 0; i < count; i++) {
      if (tones[i] < 0.1) continue
      const [x, y] = centreOf(i)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      sumX += x
      sumY += y
      members++
    }
    if (!members) return
    const centreX = sumX / members
    const centreY = sumY / members
    let far = 1
    for (let i = 0; i < count; i++) {
      const [x, y] = centreOf(i)
      const distance = Math.hypot(x - centreX, y - centreY)
      radius[i] = distance
      if (tones[i] >= 0.1) far = Math.max(far, distance)
    }
    // Every cell gets a radius: pointer displacement can make any cell draw.
    for (let i = 0; i < count; i++) radius[i] = Math.min(1.2, radius[i] / far)
    // The page's text keeps quieter ink behind it (the page names it in a data-calm attribute): the octopus still
    // shows through the headline, but never at a glyph's full weight under a letter.
    const calm = new Float32Array(count).fill(1)
    const selectors = this.layer.closest('[data-calm]')?.getAttribute('data-calm')
    const layer = this.layer.getBoundingClientRect()
    if (selectors) {
      for (const element of document.querySelectorAll(selectors)) {
        const r = element.getBoundingClientRect()
        const l = r.left - layer.left - 16
        const t = r.top - layer.top - 10
        const rr = r.right - layer.left + 16
        const b = r.bottom - layer.top + 10
        for (let cy = 0; cy < rows; cy++) {
          const y = this.offsetY + (cy + 0.5) * cellH
          for (let cx = 0; cx < cols; cx++) {
            const x = this.offsetX + (cx + 0.5) * cellW
            const outside = Math.hypot(Math.max(l - x, 0, x - rr), Math.max(t - y, 0, y - b))
            const i = cx + cy * cols
            calm[i] = Math.min(calm[i], 1 - 0.62 * (1 - smoothstep(Math.min(1, outside / 28))))
          }
        }
      }
    }
    // Warm light keeps off the page's text: none right under the letters, all of it beyond their feather.
    const warmth = new Float32Array(count)
    for (let i = 0; i < count; i++) warmth[i] = ((calm[i] - 0.38) / 0.62) ** 2
    // For the take: the two arms that reach the card's edge, how much of their reach each column and row takes, and
    // how far along the ink every cell lies from where its arm meets the card (css px), so a packet follows each
    // arm's own curl.
    let lowest = 0
    for (let i = 0; i < count; i++) if (tones[i] >= 0.1) lowest = Math.max(lowest, Math.floor(i / cols))
    const reachFor = this.layer.closest('[data-reach]')?.getAttribute('data-reach')
    const target = reachFor ? document.querySelector(reachFor)?.getBoundingClientRect() : null
    let edgeRow = target ? Math.floor((target.top - layer.top - this.offsetY) / cellH) : lowest + 1
    if (edgeRow < 1 || edgeRow > lowest + 1) edgeRow = lowest + 1
    edgeRow = Math.min(rows - 1, edgeRow)
    // Runs of inked columns at the edge, joined across gaps of up to three columns; the two widest are the arms.
    const runs: Array<{ from: number; to: number; cells: number }> = []
    let run: { from: number; to: number; cells: number } | null = null
    for (let cx = 0; cx < cols; cx++) {
      const inked = tones[cx + (edgeRow - 1) * cols] >= 0.1 || tones[cx + edgeRow * cols] >= 0.1
      if (!inked) continue
      if (run && cx - run.to <= 4) {
        run.to = cx
        run.cells++
      } else {
        run = { from: cx, to: cx, cells: 1 }
        runs.push(run)
      }
    }
    runs.sort((a, b) => b.cells - a.cells)
    const arms = runs.slice(0, 2).sort((a, b) => a.from - b.from)
    if (!arms.length) arms.push({ from: Math.floor(cols * 0.4), to: Math.ceil(cols * 0.6), cells: 0 })
    if (arms.length < 2) arms.push(arms[0])
    const pathTo = (arm: { from: number; to: number; cells: number }): Float32Array => {
      const path = new Float32Array(count).fill(-1)
      const queue: number[] = []
      for (let cy = edgeRow - 1; cy <= edgeRow; cy++) {
        for (let cx = arm.from; cx <= arm.to; cx++) {
          const i = cx + cy * cols
          if (tones[i] >= 0.1 || !arm.cells) {
            path[i] = 0
            queue.push(i)
          }
        }
      }
      // Dijkstra over the cells that can be drawn, eight neighbours; with a few thousand cells a scanned list will do.
      const diagonal = Math.hypot(cellW, cellH)
      while (queue.length) {
        let best = 0
        for (let q = 1; q < queue.length; q++) if (path[queue[q]] < path[queue[best]]) best = q
        const i = queue[best]
        queue[best] = queue[queue.length - 1]
        queue.pop()
        const cx = i % cols
        const cy = Math.floor(i / cols)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const n = nx + ny * cols
            if (tones[n] < 0.06 && !eye[n]) continue
            const cost = path[i] + (dx && dy ? diagonal : dx ? cellW : cellH)
            if (path[n] < 0) {
              path[n] = cost
              queue.push(n)
            } else if (cost < path[n]) path[n] = cost
          }
        }
      }
      return path
    }
    const paths = [pathTo(arms[0]), arms[1] === arms[0] ? null : pathTo(arms[1])] as const
    const path = new Float32Array(count).fill(-1)
    const armOf = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
      const left = paths[0][i]
      const right = paths[1] ? paths[1][i] : -1
      if (right >= 0 && (left < 0 || right < left)) {
        path[i] = right
        armOf[i] = 1
      } else path[i] = left
    }
    // Cells beside the ink take their nearest neighbour's place (a reach shows them the ink's glyphs); cells the ink
    // never reaches are far from everything.
    for (let pass = 0; pass < 2; pass++) {
      const before = path.slice()
      for (let i = 0; i < count; i++) {
        if (before[i] >= 0) continue
        const cx = i % cols
        const cy = Math.floor(i / cols)
        let nearest = -1
        let arm = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const value = before[nx + ny * cols]
            if (value >= 0 && (nearest < 0 || value < nearest)) {
              nearest = value
              arm = armOf[nx + ny * cols]
            }
          }
        }
        if (nearest >= 0) {
          path[i] = nearest
          armOf[i] = arm
        }
      }
    }
    for (let i = 0; i < count; i++) if (path[i] < 0) path[i] = 1e6
    // The way from the card to the eyes, and to the middle of the body. The eyes are islands in the ink: the way to
    // them is the way to the nearest inked cell, and the gap from there.
    let pathEye = Infinity
    for (const e of eyes) {
      const [ex, ey] = centreOf(e)
      for (let i = 0; i < count; i++) {
        if (tones[i] < 0.1 || path[i] >= 1e6) continue
        const [x, y] = centreOf(i)
        const way = path[i] + Math.hypot(x - ex, y - ey)
        if (way < pathEye) pathEye = way
      }
    }
    let pathCore = 0
    let nearest = Infinity
    for (let i = 0; i < count; i++) {
      if (tones[i] < 0.1 || path[i] >= 1e6) continue
      const [x, y] = centreOf(i)
      const distance = Math.hypot(x - centreX, y - centreY)
      if (distance < nearest) {
        nearest = distance
        pathCore = path[i]
      }
    }
    if (!Number.isFinite(pathEye)) pathEye = pathCore
    const armColumns: [Float32Array, Float32Array] = [new Float32Array(cols), new Float32Array(cols)]
    const bodyColumn = (centreX - this.offsetX) / cellW
    // Which way is inwards for each arm: towards the middle of the body.
    const armInward = arms.map((arm) => Math.sign(bodyColumn - (arm.from + arm.to + 1) / 2))
    arms.forEach((arm, k) => {
      const middle = (arm.from + arm.to + 1) / 2
      for (let cx = 0; cx < cols; cx++) armColumns[k][cx] = Math.exp(-(((cx + 0.5 - middle) / ARM_WIDTH) ** 2))
    })
    // Where both arms are one, each takes half.
    if (arms[1] === arms[0]) for (let cx = 0; cx < cols; cx++) armColumns[0][cx] = armColumns[1][cx] = armColumns[0][cx] / 2
    const armRows = new Float32Array(rows)
    for (let cy = 0; cy < rows; cy++) armRows[cy] = smoothstep(clamp((cy - (edgeRow - ARM_SPAN)) / ARM_RAMP, 0, 1))
    const armStagger = new Float32Array(cols)
    for (let cx = 0; cx < cols; cx++) armStagger[cx] = (cellNoise(cx, 9, VARIANT) - 0.5) * 0.36
    this.sample = {
      tones, fill, bucket: bucketOf, eye, eyes, phase, period, boost: new Float32Array(count), dither, radius, floor, calm, warmth,
      path, arm: armOf, armColumns, armInward, armRows, armStagger, pathEye, pathCore, minX, maxX, minY, maxY, colors, hot, lit,
    }
    this.dirty = true
    this.paintVeils()
  }

  /** Soften the artwork's glyphs under the octopus silhouette only (feathered, never a box), and under the ground its
   * arms can reach into when they take the link: the silhouette stretched as far as the arms move (down by a reach
   * and a lift, and across by a curl, fading with the arms), less the silhouette itself, which its own veil covers.
   * The second veil darkens what the first leaves, so over the silhouette's feathered edge it is a little stronger and
   * the two together match one veil over the stretched silhouette. */
  private paintVeils(): void {
    const s = this.sample
    if (!s) return
    const { cols, rows } = this
    const { fill, armColumns, armRows } = s
    const shade = (value: number): number => smoothstep(clamp((value - 0.03) / 0.08, 0, 1)) * 235
    const paint = (veil: HTMLElement, alpha: (i: number) => number): void => {
      const mask = document.createElement('canvas')
      mask.width = cols
      mask.height = rows
      const context = mask.getContext('2d')
      if (!context) return
      const image = context.createImageData(cols, rows)
      for (let i = 0; i < fill.length; i++) image.data[i * 4 + 3] = Math.round(alpha(i))
      context.putImageData(image, 0, 0)
      const url = `url(${mask.toDataURL()})`
      veil.style.maskImage = url
      veil.style.webkitMaskImage = url
      // They fade in with the arrival (drawMotif), together with the glyphs.
      veil.hidden = this.arrivalAt === null
    }
    paint(this.veil, (i) => shade(fill[i]))
    paint(this.reachVeil, (i) => {
      const x = i % cols
      const y = Math.floor(i / cols)
      const arm = Math.min(1, armColumns[0][x] + armColumns[1][x]) * armRows[y]
      if (arm < 0.05) return 0
      // The furthest a glyph can come from: a full reach with its column's stagger, and a haul's dip is less.
      const down = Math.ceil((TAKE_REACH_ROWS + TAKE_LIFT_ROWS) * 1.2 * arm)
      const across = Math.ceil(GRIP_CURL * arm)
      let most = 0
      for (let k = -1; k <= down; k++) {
        const sy = y - k
        if (sy < 0 || sy >= rows) continue
        for (let dx = -across; dx <= across; dx++) {
          const sx = x + dx
          if (sx >= 0 && sx < cols) most = Math.max(most, fill[sx + sy * cols])
        }
      }
      const own = shade(fill[i])
      return Math.max(0, shade(most) - own) / (1 - VEIL_DIM * own / 255)
    })
  }

  /** Whether a pointer at this layer position is within reach of the octopus's glyphs: the push reaches PUSH_REACH
   * and borrows glyphs from up to PUSH_SHIFT px (and a cell) further in. */
  within(x: number, y: number): boolean {
    const s = this.sample
    const drawn = s && s.maxX >= s.minX
    const dx = drawn ? Math.max(0, s.minX - x, x - s.maxX) : Math.max(0, -x, x - this.width)
    const dy = drawn ? Math.max(0, s.minY - y, y - s.maxY) : Math.max(0, -y, y - this.height)
    const reach = PUSH_REACH + PUSH_SHIFT + this.cellH
    return dx * dx + dy * dy < reach * reach
  }

  /** How strongly the pointer and its fading trail push a cell aside; the push's origin lands in pushX/pushY. */
  private pushAt(cellX: number, cellY: number): number {
    let influence = 0
    let sourceX = this.pointer.x
    let sourceY = this.pointer.y
    for (const stamp of this.trail) {
      const dx = cellX - stamp.x
      const dy = cellY - stamp.y
      const squared = dx * dx + dy * dy
      if (squared >= PUSH_REACH * PUSH_REACH) continue
      const strength = smoothstep(1 - Math.sqrt(squared) / PUSH_REACH) * stamp.fade
      if (strength > influence) {
        influence = strength
        sourceX = stamp.x
        sourceY = stamp.y
      }
    }
    if (this.pointer.active) {
      const distance = Math.hypot(cellX - this.pointer.x, cellY - this.pointer.y)
      const strength = distance < PUSH_REACH ? smoothstep(1 - distance / PUSH_REACH) * this.repel : 0
      if (strength > influence) {
        influence = strength
        sourceX = this.pointer.x
        sourceY = this.pointer.y
      }
    }
    this.pushX = sourceX
    this.pushY = sourceY
    return influence
  }

  /** One frame: the pointer's push eases in and out and its trail fades, the canvas thins around the pointer, and the
   * octopus is typed. */
  draw(): void {
    const now = performance.now()
    this.repel += ((this.pointer.active ? 1 : 0) - this.repel) * 0.16
    this.trail = this.trail.filter((stamp) => now - stamp.at < TRAIL_MS)
    for (const stamp of this.trail) stamp.fade = (1 - (now - stamp.at) / TRAIL_MS) ** 2
    const lastStamp = this.trail.at(-1)
    const thinning = this.pointer.active ? this.repel : lastStamp ? (1 - (now - lastStamp.at) / TRAIL_MS) ** 2 : 0
    const style = this.output.style
    if (thinning > 0.01) {
      const centre = (1 - 0.45 * thinning).toFixed(3)
      const middle = (1 - 0.2 * thinning).toFixed(3)
      const mask = `radial-gradient(circle 155px at ${this.lastPointer.x}px ${this.lastPointer.y}px, rgba(0,0,0,${centre}) 0%, rgba(0,0,0,${middle}) 45%, #000 100%)`
      style.maskImage = mask
      style.webkitMaskImage = mask
    } else if (style.maskImage) {
      style.maskImage = ''
      style.webkitMaskImage = ''
    }
    this.drawMotif(now)
  }

  /** Type the octopus: tone bands of the artwork's marks and plain ASCII, re-rolled per cell over time and faster
   * under the pointer, a one-time decode from the centre, a warm answer that spreads from the side facing the
   * summit when the mountain's light reaches it (the eyes blink, then catch the light), blinking eyes, and quieter
   * ink behind the page's text. All of it runs on the virtual clock; at rest only the pointer's push changes glyphs,
   * and they return. */
  private drawMotif(now: number): void {
    const out = this.out
    // Real time only feeds the virtual clock, capped so a slow frame or a hidden tab never jumps it.
    const dt = this.lastTick ? Math.min(50, now - this.lastTick) : 0
    this.lastTick = now
    out.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    out.clearRect(0, 0, this.width, this.height)
    const s = this.sample
    const { cols, rows } = this
    if (!s || s.tones.length !== cols * rows) return
    if (this.arrivalAt === null) {
      // Held until the artwork has set the glyph grid and colours, so the octopus never re-grids mid-arrival.
      if (this.scenePending) return
      this.arrivalAt = this.clock
      this.ceremony = !ignited
      // A take asked for before the first frame begins once the octopus is awake.
      if (this.take && this.take.at === null) this.take.at = this.clock + STARTUP_MS
      this.veil.hidden = false
      this.reachVeil.hidden = false
      this.hooks.arrived()
    }
    const arrivalAt = this.arrivalAt
    // A requested rest begins once the startup, any wave and any glint have finished, so nothing freezes half-drawn.
    this.resting = this.restRequested && !this.take && this.clock - arrivalAt >= STARTUP_MS && !this.waves.length
      && (this.glintAt === null || this.clock - this.glintAt >= GLINT_MS)
    const step = this.resting ? 0 : dt
    this.clock += step
    const clock = this.clock
    if (this.groundAt === null || clock - this.groundAt >= GROUND_MS) {
      paintGround(this.ground, cols, rows, clock)
      this.groundAt = clock
    }
    const ground = this.ground
    out.font = `600 ${this.fontPx}px ${MOTIF_FONT}`
    out.textAlign = 'center'
    out.textBaseline = 'middle'
    out.lineCap = 'round'
    const { cellW, cellH, offsetX, offsetY, ink } = this
    const { tones, radius, eye, bucket, phase, period, boost, dither, floor, calm, warmth, path, arm: armOf, armColumns, armInward, armRows, armStagger } = s
    const { colors: bucketColors, hot: bucketHot, lit: bucketLit } = s
    const t = (clock - arrivalAt) / ARRIVAL_MS
    const arriving = t < 1
    const arrive = 0.12 + 1.08 * (1 - (1 - Math.min(1, t)) ** 2)
    // The startup: how long the octopus has been lit (each glyph works out its own light from it, in the loop), and
    // whether it still is. From its first lit frame the startup counts as played on this page, so an octopus that
    // comes back meanwhile arrives awake rather than playing it again.
    const lit = clock - arrivalAt - IGNITE_AT
    const igniting = this.ceremony && lit < IGNITE_MS
    if (this.ceremony && lit >= 0) ignited = true
    // The take: how far each arm reaches (rows; a lift is negative) and how far its tip curls in, its packets of warm
    // light (where along the arms, which arm, how warm, and whether they garble the glyphs they pass), the grip at the
    // card's edge, how far the eyes look down (css px), and the light when it ends well.
    let reach0 = 0
    let reach1 = 0
    let curl = 0
    let grip = 0
    let gaze = 0
    let landed = 0
    const packets: Array<{ centre: number; arm: number; gain: number; garble: boolean }> = []
    const take = this.take
    if (take && take.at !== null && clock >= take.at) {
      const since = clock - take.at + take.skip
      if (take.endAt !== null && clock >= take.endAt) {
        if (!take.ending) {
          take.ending = true
          take.from = [this.takeReach[0], this.takeReach[1], this.takeCurl]
          // Read: the eyes catch the light at once, bright, with the last TAKE_END_MS of a glint, which has gone when
          // the ending is over. Not read: a blink.
          if (take.outcome === 'success') this.glintAt = take.endAt + TAKE_END_MS - GLINT_MS
          else this.nextBlink = clock + 100
        }
        const r = clock - take.endAt
        const held = 1 - easeOut(r / TAKE_LET_GO_MS)
        reach0 = take.from[0] * held
        reach1 = take.from[1] * held
        curl = take.from[2] * held
        if (take.outcome === 'success') landed = TAKE_FLASH * (r < TAKE_FLASH_RISE_MS ? easeOut(r / TAKE_FLASH_RISE_MS) : (1 - clamp((r - TAKE_FLASH_RISE_MS) / (TAKE_END_MS - TAKE_FLASH_RISE_MS), 0, 1)) ** 2)
        if (r >= TAKE_END_MS) {
          // A read page leaves the glyphs rewritten, as an answer does.
          if (take.outcome === 'success') this.rewrites += 1
          this.take = null
        }
      } else if (since < TAKE_OPEN_MS) {
        const both = since < TAKE_LIFT_MS ? -TAKE_LIFT_ROWS * easeOut(since / TAKE_LIFT_MS)
          : since < TAKE_GRIP_AT ? mix(-TAKE_LIFT_ROWS, TAKE_REACH_ROWS, easeInOut((since - TAKE_LIFT_MS) / TAKE_PLUNGE_MS))
            : since < TAKE_PULL_AT ? TAKE_REACH_ROWS
              : TAKE_REACH_ROWS * (1 - easeInOut((since - TAKE_PULL_AT) / TAKE_PULL_MS))
        reach0 = reach1 = both
        if (since >= TAKE_GRIP_AT && since < TAKE_PULL_AT) grip = Math.sin(Math.PI * (since - TAKE_GRIP_AT) / TAKE_GRIP_MS) ** 0.5
        // The tips curl inwards as they close on the link, and open again as the arms draw back.
        curl = since < TAKE_GRIP_AT ? 0
          : since < TAKE_PULL_AT ? GRIP_CURL * easeOut((since - TAKE_GRIP_AT) / TAKE_GRIP_MS)
            : GRIP_CURL * (1 - easeInOut((since - TAKE_PULL_AT) / (TAKE_PULL_MS / 2)))
        if (since >= TAKE_PULL_AT && since < TAKE_PULL_AT + TAKE_CLIMB_MS) {
          const climbed = ((since - TAKE_PULL_AT) / TAKE_CLIMB_MS) ** 2
          packets.push({ centre: (s.pathEye + PACKET) * climbed - PACKET / 2, arm: -1, gain: 1, garble: true })
          if (!take.glinted && (s.pathEye + PACKET) * climbed >= s.pathEye) {
            take.glinted = true
            this.glintAt = clock
          }
        } else if (since >= TAKE_PULL_AT + TAKE_CLIMB_MS) take.glinted = false
        gaze = since < TAKE_PULL_AT ? 2 * easeOut(since / 160) : 2 * (1 - easeInOut((since - TAKE_PULL_AT) / 200))
      } else {
        // Hand over hand: each arm dips and draws a fainter packet up to the body, the right one half a round after
        // the left; no two rounds are quite alike, and a long wait slows them.
        for (let k = 0; k < 2; k++) {
          let round = take.rounds[k]
          if (!round || clock >= round.at + round.ms) {
            const at = round ? round.at + round.ms : take.at - take.skip + TAKE_OPEN_MS + k * HAUL_MS / 2
            const slow = at - take.at > HAUL_LONG_MS ? HAUL_SLOW : 1
            round = take.rounds[k] = { at, ms: HAUL_MS * slow * (1 + HAUL_VARY * (2 * Math.random() - 1)), rows: HAUL_ROWS * (1 + HAUL_VARY * (2 * Math.random() - 1)) }
          }
          const c = (clock - round.at) / (round.ms / HAUL_MS)
          if (c < 0) continue
          const dip = c < HAUL_DIP_MS ? round.rows * easeOut(c / HAUL_DIP_MS) : c < HAUL_DIP_MS + HAUL_DRAW_MS ? round.rows * (1 - easeInOut((c - HAUL_DIP_MS) / HAUL_DRAW_MS)) : 0
          if (k) reach1 = dip
          else reach0 = dip
          if (c >= HAUL_DIP_MS && c < HAUL_DIP_MS + HAUL_DRAW_MS) {
            const front = s.pathCore * easeInOut((c - HAUL_DIP_MS) / HAUL_DRAW_MS)
            const fade = front / Math.max(1, s.pathCore)
            packets.push({ centre: front - PACKET / 2, arm: k, gain: HAUL_HEAT * (1 - smoothstep(clamp((fade - 0.7) / 0.3, 0, 1))), garble: false })
          }
        }
      }
    }
    this.takeReach[0] = reach0
    this.takeReach[1] = reach1
    this.takeCurl = curl
    const reaching = reach0 !== 0 || reach1 !== 0
    const gripReach = GRIP_ROWS * cellH
    if (!this.awake && clock - arrivalAt >= (this.ceremony ? IGNITE_AT : REWAKE_MS)) {
      // Awake: the eyes open and catch the light, and the hero hears of it.
      this.awake = true
      this.nextBlink = clock + 4200
      if (this.ceremony) this.glintAt = clock
      this.hooks.awoke()
    }
    const wave = this.waves[0]
    // The answer's radius, spreading from the octopus's side that faces the summit, below its eyes.
    let front: number | null = null
    const originX = s.maxX
    const originY = mix(s.minY, s.maxY, 0.7)
    if (wave) {
      const k = (clock - wave.at) / WAVE_MS
      if (k >= 1) {
        // The finished answer leaves its rewritten glyphs behind; a queued one starts now.
        this.waves.shift()
        this.rewrites += 1
        if (this.waves[0]) this.waves[0].at = clock
      } else {
        front = Math.max(0, k) * (Math.hypot(s.maxX - s.minX, s.maxY - s.minY) + 48)
        // The light makes it blink as it arrives, and its eyes catch the light as they open.
        if (!wave.blinked) {
          wave.blinked = true
          this.nextBlink = clock
          this.glintAt = clock + 150
        }
      }
    }
    if (clock >= this.nextBlink + 150) this.nextBlink = clock + 5200 + Math.random() * 2600
    const blinking = !this.resting && clock >= this.nextBlink
    const tick = Math.floor(clock / 60)
    const markSize = Math.min(cellW, cellH) * 1.25
    const answerReach = 4 * cellW
    const pushing = this.pointer.active || this.trail.length > 0
    let current = ''
    for (let y = 0; y < rows; y++) {
      const cellY = offsetY + (y + 0.5) * cellH
      for (let x = 0; x < cols; x++) {
        const dst = x + y * cols
        if (arriving && radius[dst] > arrive) continue
        // Eyes are drawn last, at fixed cells.
        if (eye[dst]) continue
        const cellX = offsetX + (x + 0.5) * cellW
        const influence = pushing ? this.pushAt(cellX, cellY) : 0
        // The pointer speeds up a cell's re-rolls (up to 6x) by adding turns as the virtual clock runs, never by
        // scaling the clock itself, so a glyph changes only when its own count does: at rest it keeps still.
        if (influence > 0.01) boost[dst] += step * 5 * influence / period[dst]
        let src = dst
        const pull = reaching ? (reach0 * armColumns[0][x] + reach1 * armColumns[1][x]) * armRows[y] : 0
        if (influence > 0.01 || pull) {
          // Soft inverse sampling: a cell shows the glyph from where the push or the reach took it, so glyphs move
          // aside, or an arm lengthens, without cutting a hole.
          let fx = x
          let fy = y
          if (influence > 0.01) {
            const dx = cellX - this.pushX
            const dy = cellY - this.pushY
            const distance = Math.hypot(dx, dy)
            if (distance > 0) {
              fx -= (dx / distance) * PUSH_SHIFT * influence / cellW
              fy -= (dy / distance) * PUSH_SHIFT * influence / cellH
            }
          }
          // Each column steps at a slightly different moment, whole, so an arm slides, never jumps a row at once and
          // keeps its outline.
          if (pull) {
            fy -= pull * (1 + armStagger[x])
            if (curl > 0) fx -= curl * (armInward[0] * armColumns[0][x] + armInward[1] * armColumns[1][x]) * armRows[y]
          }
          src = clamp(Math.round(fx), 0, cols - 1) + clamp(Math.round(fy), 0, rows - 1) * cols
        }
        const shape = tones[src]
        if (shape < 0.06) continue
        // The startup reaches this glyph IGNITE_SPREAD_MS later the further out it sits: dormant until then, it
        // rises into the light and lets it go, the arm tips last.
        let level = 1
        let weight = 1
        let glow = landed
        if (igniting) {
          const outward = clamp(radius[dst], 0, 1)
          const since = lit - IGNITE_SPREAD_MS * outward
          if (since < 0) {
            level = DORMANT_INK
            weight = DORMANT_TONE
          } else if (since < IGNITE_RISE_MS) {
            const rise = easeOut(since / IGNITE_RISE_MS)
            level = mix(DORMANT_INK, 1, rise)
            weight = mix(DORMANT_TONE, 1, rise)
            glow = Math.max(glow, rise)
          } else {
            const fall = (since - IGNITE_RISE_MS) / (IGNITE_FALL_MS * mix(1, IGNITE_TIP_FALL, outward))
            if (fall < 1) glow = Math.max(glow, (Math.exp(-IGNITE_DECAY * fall) - Math.exp(-IGNITE_DECAY)) / (1 - Math.exp(-IGNITE_DECAY)))
          }
        }
        const tone = clamp(shape * (0.86 + 0.14 * ground[src]) + 0.08 * Math.sin(clock * 0.0008 + cellX * 0.011 - cellY * 0.0072) + dither[dst] - 0.29 * influence, 0, 1) * weight
        if (tone < 0.1 * weight) continue
        // The ripple's front is hottest at its edge and cools behind it.
        const behind = arrive - radius[dst]
        const arrivalHeat = arriving && behind < 0.14 ? 1 - 0.6 * behind / 0.14 : 0
        const along = front === null ? 0 : Math.hypot(cellX - originX, cellY - originY)
        const waveHeat = front === null ? 0 : clamp(1 - Math.abs(along - front) / answerReach, 0, 1)
        // The take's light: the grip, in the rows on screen just above the card's edge, and the packets that garble;
        // a haul's packet only warms the glyphs it passes.
        let takeHeat = grip && path[dst] < gripReach ? grip * (0.7 + 0.3 * cellNoise(dst, tick, 5)) : 0
        let haulHeat = 0
        for (const packet of packets) {
          if (packet.arm >= 0 && armOf[src] !== packet.arm) continue
          const warm = clamp(1 - Math.abs(path[src] - packet.centre) / (PACKET / 2), 0, 1) * packet.gain
          if (packet.garble) takeHeat = Math.max(takeHeat, warm)
          else haulHeat = Math.max(haulHeat, warm)
        }
        // The ripple shows wherever the octopus does; the answer and the take keep off the letters.
        const heat = Math.max(arrivalHeat, Math.max(waveHeat, takeHeat) * warmth[dst])
        if (heat > 0.02) {
          // Arrival garble and the answer's front: warm glyphs from the same plain marks.
          const style = bucketHot[bucket[src] * 3 + (heat > 0.66 ? 2 : heat > 0.33 ? 1 : 0)]
          if (style !== current) {
            out.fillStyle = style
            out.strokeStyle = style
            current = style
          }
          out.globalAlpha = Math.min(1, (floor[dst] + 0.62 * Math.max(tone + 0.25 * heat, 0.45) + 0.2 * heat) * ink * calm[dst] * (arrivalHeat > 0 ? 1 : level))
          out.fillText(WAVE_GLYPHS[Math.floor(cellNoise(dst, tick, 17) * WAVE_GLYPHS.length)], cellX, cellY)
          continue
        }
        // Each cell re-rolls on its own period, faster under the pointer; waves move every glyph they pass on.
        const slot = Math.floor((clock + phase[dst]) / period[dst] + boost[dst]) + this.rewrites + (front !== null && along < front ? 1 : 0)
        // The glow lights the body first and its edges after, and keeps most of itself off the page's text. Each
        // glyph stays itself, a band heavier and in the octopus's own light: that is what tells the glow from the
        // ripple's warm garble.
        const lift = glow > 0 ? glow * mix(LETTER_GLOW, 1, warmth[dst]) * (0.55 + 0.45 * shape) : 0
        const inked = Math.min(1, tone + 0.18 * lift)
        let band = 1
        while (band < 6 && inked >= MOTIF_EDGES[band]) band++
        const set = MOTIF_BANDS[band]
        const glyph = set[Math.floor(cellNoise(dst, slot, band) * set.length)]
        const warm = haulHeat * warmth[dst]
        const style = lift > 0.08 ? bucketLit[bucket[src] * LIT_LEVELS + Math.min(LIT_LEVELS - 1, Math.floor(lift * LIT_LEVELS))]
          : warm > 0.1 ? bucketHot[bucket[src] * 3 + (warm > 0.66 ? 2 : warm > 0.33 ? 1 : 0)]
            : bucketColors[bucket[src]]
        if (style !== current) {
          out.fillStyle = style
          out.strokeStyle = style
          current = style
        }
        out.globalAlpha = Math.min(1, (floor[dst] + 0.62 * tone) * ink * calm[dst] * level + 0.22 * lift)
        const mark = ART_MARKS[glyph]
        if (mark) drawArtworkGlyph(out, mark, cellX, cellY, markSize)
        else out.fillText(glyph, cellX, cellY)
      }
    }
    if (s.eyes.length) {
      const side = Math.max(2, Math.round(Math.min(cellW, cellH) * 0.85))
      const bar = Math.max(1, Math.round(cellH * 0.14))
      // Shut until the octopus is awake.
      const tall = blinking || !this.awake ? bar : side
      // The glint swells and fades over 0.8 s.
      const since = this.glintAt === null ? -1 : clock - this.glintAt
      const glint = since < 0 || since > GLINT_MS ? 0 : Math.sin((since / GLINT_MS) * Math.PI) ** 2
      for (const e of s.eyes) {
        if (arriving && radius[e] > arrive) continue
        const ex = offsetX + (e % cols + 0.5) * cellW
        // Looking down at the card while the arms reach for it.
        const ey = offsetY + (Math.floor(e / cols) + 0.5) * cellH + gaze
        if (glint > 0.02) {
          const haloSize = side * 3.2
          const halo = out.createRadialGradient(ex, ey, 0, ex, ey, haloSize)
          halo.addColorStop(0, `rgba(${EYE_GLINT},${(0.8 * glint).toFixed(3)})`)
          halo.addColorStop(1, `rgba(${EYE_GLINT},0)`)
          out.globalAlpha = 1
          out.fillStyle = halo
          out.fillRect(ex - haloSize, ey - haloSize, haloSize * 2, haloSize * 2)
        }
        // The eyes sit in the gap between the headline and the description, so they keep their light there.
        out.globalAlpha = this.awake ? Math.max(0.9, calm[e]) : 0.5
        out.fillStyle = EYE_COLOR
        out.fillRect(Math.round(ex - side / 2), Math.round(ey - tall / 2), side, tall)
      }
    }
    out.globalAlpha = 1
    this.dirty = false
    this.pointerMoved = false
  }

  /** The octopus's answer to the summit's light: one spreads at a time and at most one more waits. */
  addWave(): void {
    if (!this.waves.length) this.waves.push({ at: this.clock, blinked: false })
    else this.waves[1] = { at: 0, blinked: false }
  }

  /** A preview's extraction starts ('start') or ends ('success' or 'failure'). A take asked for during the startup
   * waits for it; an octopus that arrives while a request is already under way (late) goes straight to the haul. It
   * ends as soon as the result comes, wherever it is, since the page scrolls to the result at once; one that has not
   * begun yet is dropped, its arms never having lifted. */
  setTake(phase: Phase, late: boolean): void {
    if (phase === 'start') {
      // It begins at `at`, never before the octopus is awake; a late one begins `skip` ms into itself, at the haul.
      const at = this.arrivalAt === null ? null : Math.max(this.clock + (late ? 0 : TAKE_DELAY_MS), this.arrivalAt + STARTUP_MS)
      this.take = { at, skip: late ? TAKE_OPEN_MS : 0, endAt: null, outcome: null, ending: false, from: [0, 0, 0], rounds: [null, null], glinted: false }
    } else if (this.take && this.take.endAt === null) {
      if (this.take.at === null || this.clock < this.take.at) {
        this.take = null
        return
      }
      this.take.outcome = phase
      this.take.endAt = this.clock
    }
  }

  /** The hero asks the octopus to rest while the visitor works with the form, and to wake after. */
  setRest(rest: boolean): void {
    this.restRequested = rest
  }

  /** Nothing on screen would change: resting, drawn, and the pointer still with its trail faded. */
  idle(): boolean {
    return this.resting && !this.dirty && !this.pointerMoved && !this.trail.length && Math.abs((this.pointer.active ? 1 : 0) - this.repel) < 0.01
  }

  /** Finish the startup and any wave and come to rest awake, with the eyes open, so a stop never keeps a
   * half-drawn octopus. False before the first frame, when there is nothing to finish. */
  settle(): boolean {
    if (this.arrivalAt === null) return false
    this.arrivalAt = Math.min(this.arrivalAt, this.clock - STARTUP_MS)
    this.awake = true
    ignited = true
    this.take = null
    this.takeReach = [0, 0]
    this.takeCurl = 0
    // A stopped octopus takes no link: the page may still mark a preview in flight (.is-taking), but the ground its
    // arms would reach into never darkens.
    this.reachVeil.remove()
    this.waves = []
    this.nextBlink = Infinity
    this.glintAt = null
    this.restRequested = true
    // The kept frame never shows the pointer's push, which could no longer follow the pointer away.
    this.pointer = { x: -1000, y: -1000, active: false }
    this.trail = []
    this.repel = 0
    return true
  }

  setPointer(x: number, y: number, active: boolean): void {
    const now = performance.now()
    if (active) this.lastPointer = { x, y }
    if (active && (!this.pointer.active || now - this.lastTrailAt > 55 || Math.hypot(x - this.pointer.x, y - this.pointer.y) > 22)) {
      this.trail.push({ x, y, at: now, fade: 1 })
      if (this.trail.length > 12) this.trail.shift()
      this.lastTrailAt = now
    }
    this.pointerMoved = true
    this.pointer = { x, y, active }
  }

  dispose(): void {
    this.disposed = true
    artwork().removeEventListener('load', this.onArtwork)
    artwork().removeEventListener('error', this.onArtwork)
  }
}

type OctopusState = 'running' | 'awake' | 'stalled'

/** Put the octopus in the hero's octopus cell (the page's #hero-ascii) and run it; the returned function takes it away
 * again. The hero hears when it first draws ('running'), when it wakes ('awake') and when it stops for good
 * ('stalled': no canvas, no source, or too slow), on w2l:octopus. */
export function mountHeroOctopus(cell: HTMLElement): () => void {
  const hero = cell.closest<HTMLElement>('.hero') ?? cell
  const report = (state: OctopusState): void => { hero.dispatchEvent(new CustomEvent('w2l:octopus', { detail: { state } })) }
  const layer = document.createElement('div')
  layer.className = 'hero-ascii-layer'
  layer.setAttribute('aria-hidden', 'true')
  // A veil softens the artwork's own glyphs under the silhouette so the two textures never clash; it stays hidden
  // until it has that shape. A second veil darkens the ground the arms reach into when they take the link: the page
  // shows it only then (.is-taking), so at rest the silhouette's own veil is all there is.
  const veil = document.createElement('div')
  veil.className = 'w2l-ascii-veil'
  veil.hidden = true
  const reachVeil = document.createElement('div')
  reachVeil.className = 'w2l-ascii-veil w2l-ascii-reach'
  reachVeil.hidden = true
  const canvas = document.createElement('canvas')
  canvas.className = 'w2l-ascii-motif'
  layer.append(veil, reachVeil, canvas)
  cell.append(layer)
  const context = canvas.getContext('2d')
  if (!context) {
    layer.remove()
    report('stalled')
    return () => {}
  }

  let live = true
  let stalled = false
  let visible = false
  let running = false
  let frameId = 0
  let lastFrame = 0
  let firstFrame = 0
  let slowFrames = 0
  // Layout work never counts as a slow frame.
  let layoutChanged = false
  let resizeTimer = 0
  // The layer's page-space box, taken when layout changes: pointer moves only read it.
  let box = { x: 0, y: 0, width: 0, height: 0 }

  const octopus = new Octopus(layer, veil, reachVeil, canvas, context, {
    arrived: () => report('running'),
    awoke: () => report('awake'),
    // A late artwork lays the grid out again, which clears the canvas: a resting loop must wake to redraw it.
    relaid: () => redraw(),
    failed: () => halt(),
  })

  /** Start (or wake) the frame loop. At rest it sleeps once nothing would change; the pointer, an answer, a take or
   * the end of the rest wakes it. */
  const wake = (): void => {
    if (!live || running || stalled || document.hidden || !visible) return
    running = true
    lastFrame = 0
    slowFrames = 0
    frameId = requestAnimationFrame(frame)
  }
  const sleep = (): void => {
    running = false
    cancelAnimationFrame(frameId)
  }
  const frame = (now: number): void => {
    if (!running) return
    frameId = requestAnimationFrame(frame)
    if (now - lastFrame < FRAME_MS) return
    if (lastFrame && now - lastFrame > SLOW_MS && !layoutChanged) slowFrames += 1
    else slowFrames = Math.max(0, slowFrames - 1)
    layoutChanged = false
    firstFrame ||= now
    if (slowFrames >= (now - firstFrame < SLOW_START_MS ? SLOW_START : SLOW_LATER)) {
      halt()
      return
    }
    lastFrame = now
    octopus.draw()
    if (octopus.idle()) sleep()
  }
  /** Stop for good: too slow to animate, or no octopus to draw. The hero's glyphs stop with it, and the octopus keeps
   * one finished frame (arrival and answers complete), never a half-drawn one. */
  const halt = (): void => {
    if (stalled || !live) return
    sleep()
    stalled = true
    if (octopus.settle()) octopus.draw()
    report('stalled')
  }
  /** A new grid clears the canvas. A resting octopus wakes for a frame to redraw it; a stopped one draws its finished
   * frame again, once, so a resize never leaves an empty veil where the octopus was. */
  const redraw = (): void => {
    if (!stalled) wake()
    else if (octopus.arrivalAt !== null) octopus.draw()
  }
  const measure = (): void => {
    const rect = layer.getBoundingClientRect()
    box = { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height }
  }
  const layOut = (width: number, height: number): void => {
    octopus.layout(width, height)
    measure()
    layoutChanged = true
    redraw()
  }
  /** Layout changed. The canvas stretches with its layer meanwhile; the glyph grid is laid out again once the layer
   * has kept its new size for a moment (the first size at once). */
  const resized = (width?: number, height?: number): void => {
    layoutChanged = true
    measure()
    if (!width || !height) return
    window.clearTimeout(resizeTimer)
    if (width === octopus.width && height === octopus.height) return
    if (!octopus.width) layOut(width, height)
    else resizeTimer = window.setTimeout(() => layOut(width, height), RESIZE_MS)
  }

  // The first size lays the grid out at once (a layer not laid out yet waits for its first size below). The octopus
  // is decorative: if that fails, the hero keeps its static octopus and nothing is left listening.
  try {
    const start = layer.getBoundingClientRect()
    if (start.width > 0 && start.height > 0) layOut(start.width, start.height)
    else measure()
  } catch {
    live = false
    octopus.dispose()
    layer.remove()
    report('stalled')
    return () => {}
  }

  const onPointerMove = (event: PointerEvent): void => {
    // A stopped octopus keeps its finished frame; a later redraw (a resize) must not show a push.
    if (stalled || !box.width || !box.height) return
    const x = event.pageX - box.x
    const y = event.pageY - box.y
    // Only a pointer within reach of the octopus's glyphs pushes them, or wakes a resting octopus.
    if (octopus.within(x, y)) {
      octopus.setPointer(x, y, true)
      wake()
    } else if (octopus.pointer.active) {
      octopus.setPointer(-1000, -1000, false)
      wake()
    }
  }
  const onPointerLeave = (): void => {
    octopus.setPointer(-1000, -1000, false)
    wake()
  }
  const onVisibility = (): void => {
    if (document.hidden) sleep()
    else wake()
  }
  // The hero's glyphs start once the octopus really draws; the octopus answers when their light reaches the summit,
  // takes the link while a preview is extracted, and rests while the hero yields to the form.
  const onSummit = (): void => {
    if (stalled) return
    octopus.addWave()
    wake()
  }
  const onTake = (event: Event): void => {
    const detail = (event as CustomEvent<{ phase?: Phase; late?: boolean } | null>).detail
    if (stalled || !detail?.phase) return
    octopus.setTake(detail.phase, Boolean(detail.late))
    wake()
  }
  const onRest = (event: Event): void => {
    octopus.setRest(Boolean((event as CustomEvent<{ rest?: boolean } | null>).detail?.rest))
    wake()
  }
  hero.addEventListener('pointermove', onPointerMove, { passive: true })
  hero.addEventListener('pointerleave', onPointerLeave)
  hero.addEventListener('w2l:summit', onSummit)
  hero.addEventListener('w2l:take', onTake)
  hero.addEventListener('w2l:rest', onRest)
  document.addEventListener('visibilitychange', onVisibility)
  const onScreen = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    if (visible) wake()
    else sleep()
  }, { threshold: 0.05 })
  onScreen.observe(layer)
  // The hero too: it can move the layer without resizing it, and the pointer mapping needs the layer's box.
  const sizes = new ResizeObserver((entries) => {
    const size = entries.find((entry) => entry.target === layer)?.contentRect
    resized(size?.width, size?.height)
  })
  sizes.observe(layer)
  sizes.observe(hero)

  return () => {
    if (!live) return
    sleep()
    live = false
    window.clearTimeout(resizeTimer)
    onScreen.disconnect()
    sizes.disconnect()
    hero.removeEventListener('pointermove', onPointerMove)
    hero.removeEventListener('pointerleave', onPointerLeave)
    hero.removeEventListener('w2l:summit', onSummit)
    hero.removeEventListener('w2l:take', onTake)
    hero.removeEventListener('w2l:rest', onRest)
    document.removeEventListener('visibilitychange', onVisibility)
    octopus.dispose()
    layer.remove()
  }
}
