import { CLOUD_GLYPHS, cloudCell } from './glyphArt'
import { whenVisible } from './motion'
import { currentAt, glintAt, scanCell, scanSeconds, snowCells, wakeLift, WEATHER, weatherMix } from './seaWeather'

/* The glyph cloud, breathing outward. Every mark stays on its grid cell; the motion is marks changing weight, ink and
 * colour as rings pass through them. Three rings at different speeds give the depth: a slow swell that lights its
 * marks orange and cools back to navy behind it, a quicker ripple, and a fine shimmer. */

/** What a cell shows at one moment: its mark (an index into CLOUD_GLYPHS), its ink alpha, and how far its colour has
 * turned from navy to orange, 0 to 1. */
export interface RippleCell { level: number, alpha: number, warm: number }

const SWELL = { k: 1.15, f: 0.15 }   // rings per unit of distance, rings per second
const RIPPLE = { k: 2.4, f: 0.3 }
const fract = (n: number) => n - Math.floor(n)
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const smooth = (a: number, b: number, n: number) => { const t = clamp01((n - a) / (b - a)); return t * t * (3 - 2 * t) }

/** A ring travelling outward: a soft rise ahead of it, full at the crest, a long tail fading back towards the centre. */
function ring(d: number, t: number, { k, f }: { k: number, f: number }): number {
  const p = fract(t * f - d * k)
  return Math.max(p > 0.9 ? ((p - 0.9) / 0.1) ** 2 : 0, Math.exp(-4.5 * p))
}

/** What the weather (seaWeather.ts) adds to a cell: a lift to its ink and a warmth, 0 to 1 each, and a mark to show
 * instead of its own while a scan re-types it. */
export interface CellExtra { lift: number, warm: number, mark?: number }

/** One cell at time `t` seconds. `d` and `ink` come from cloudCell; `jitter` is a fixed 0–1 value per cell, so the
 * rings' edges are grainy rather than drawn with a compass. `extra` is the weather's, if any. The heading's clear
 * centre stays clear, whatever the weather. */
export function rippleCell(d: number, ink: number, jitter: number, t: number, extra?: CellExtra): RippleCell {
  const reach = smooth(0.3, 0.55, d) * (1 - smooth(1.2, 1.45, d))
  if (reach === 0) return { level: 0, alpha: 0, warm: 0 }
  const swell = ring(d + jitter * 0.05, t, SWELL)
  const ripple = ring(d - jitter * 0.04, t, RIPPLE)
  const shimmer = Math.sin((t * 0.9 + jitter) * Math.PI * 2) * 0.05
  // The cloud's own ink, lifted by the rings; the swell also raises a few marks past the cloud's edge as it spreads.
  const added = extra ? extra.lift * reach : 0
  const lift = ink * (0.7 + 0.55 * swell + 0.25 * ripple) + reach * (0.16 * swell * jitter + shimmer * ink) + 0.32 * added
  let level = Math.floor(clamp01(Math.min(0.999, lift)) * CLOUD_GLYPHS.length)
  if (extra?.mark && added > 0.05) level = Math.max(1, Math.min(CLOUD_GLYPHS.length - 1, extra.mark))
  if (level === 0) return { level: 0, alpha: 0, warm: 0 }
  const warm = clamp01((swell - 0.18) * 1.3) * reach + clamp01(ripple - 0.6) * 0.35 * reach + (extra ? extra.warm * reach : 0)
  return { level, alpha: 0.05 + 0.018 * level + 0.26 * swell * reach + 0.06 * ripple + 0.12 * added, warm: clamp01(warm) }
}

const NAVY = [20, 37, 74], RUST = [184, 70, 29], ORANGE = [243, 104, 61]
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t))
/** Navy to rust to the brand orange, so a mark warms through the page's own accent colours. */
function colour(warm: number, alpha: number, cap = 0.5): string {
  const [r, g, b] = warm < 0.5 ? mix(NAVY, RUST, warm * 2) : mix(RUST, ORANGE, (warm - 0.5) * 2)
  return `rgba(${r},${g},${b},${Math.min(cap, alpha).toFixed(3)})`
}

/** What the octopus (octopusSwim.ts) may be doing that draws the eye: while it does, the weather softens, so the two
 * never compete. */
const LOUD = new Set(['wave', 'bubbles', 'chase', 'meet', 'map', 'render'])

/** Takes over a prerendered glyph cloud (`data-cols`, `data-rows`, `data-seed` name how it was drawn) with a canvas
 * that draws the same grid, moving, while it is on screen. Without motion, the prerendered marks stay. A cloud with
 * `data-weather` also has the sea's weather (seaWeather.ts): it listens on its parent for the octopus's wake
 * (`octopus:wake`, in the parent's css px) and reads what it is doing from the parent's `data-octopus`. */
export function mountGlyphRipple(pre: HTMLElement): void {
  const cols = Number(pre.dataset.cols), rows = Number(pre.dataset.rows), seed = Number(pre.dataset.seed)
  if (!cols || !rows || !Number.isFinite(seed)) return
  const weather = pre.dataset.weather !== undefined
  const host = pre.parentElement ?? pre
  const cells: Array<{ x: number, y: number, d: number, ink: number, jitter: number }> = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const { d, ink } = cloudCell(x, y, cols, rows, seed)
    const jitter = fract(Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453)
    cells.push({ x, y, d, ink, jitter })
  }

  const canvas = document.createElement('canvas')
  canvas.className = `${pre.className} glyph-ripple`
  canvas.setAttribute('aria-hidden', 'true')
  const context = canvas.getContext('2d')
  if (!context) return
  let cellW = 0, cellH = 0, font = ''
  const size = () => {
    const style = getComputedStyle(pre)
    font = `${style.fontSize} ${style.fontFamily}`
    context.font = font
    cellW = context.measureText('M').width
    cellH = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.1
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.style.width = `${cols * cellW}px`
    canvas.style.height = `${rows * cellH}px`
    canvas.width = Math.round(cols * cellW * dpr)
    canvas.height = Math.round(rows * cellH * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // The weather's state: the octopus's recent wake (in cells), how calm it lets the water be (eased, 0 to 1), the
  // scan's row (-1 for none), when it began and when the next may, and per frame the wake and the snow by cell.
  let wakes: Array<{ x: number, y: number, at: number }> = []
  let calm = 1
  let scanRow = -1, scanAt = 0, nextScan = 0
  const wakeField = new Float32Array(weather ? cols * rows : 0)
  const snow = new Set<number>()
  const extra: CellExtra = { lift: 0, warm: 0 }
  if (weather) {
    host.addEventListener('octopus:wake', (event) => {
      if (!canvas.isConnected || !cellW) return
      const { x, y } = (event as CustomEvent<{ x: number, y: number }>).detail
      const a = canvas.getBoundingClientRect(), b = host.getBoundingClientRect()
      wakes.push({ x: (x - (a.left - b.left)) / cellW, y: (y - (a.top - b.top)) / cellH, at: performance.now() })
      if (wakes.length > 16) wakes.shift()
    })
  }

  /** The weather for this frame: how much current and surface light, the scan, the wake and the snow. */
  const brew = (now: number, t: number, dt: number) => {
    const quiet = !LOUD.has(host.dataset.octopus ?? 'rest')
    // Eased, so that the weather has softened (or come back) within about two seconds; softened, not gone.
    calm += ((quiet ? 1 : 0.4) - calm) * Math.min(1, dt / 700)
    const mix = weatherMix(t)
    if (scanRow < 0 && now > nextScan) {
      if (quiet) {
        const band = Math.max(1, Math.round(rows * 0.2))
        const k = Math.floor(Math.random() * band * 2)
        scanRow = k < band ? 1 + k : rows - band - 1 + (k - band)
        scanAt = now
      } else nextScan = now + 2000
    }
    if (scanRow >= 0 && (now - scanAt) / 1000 > scanSeconds(cols)) { scanRow = -1; nextScan = now + 20000 + Math.random() * 15000 }
    wakeField.fill(0)
    wakes = wakes.filter(w => now - w.at < WEATHER.wakeMs)
    for (const w of wakes) {
      const age = now - w.at
      for (let r = Math.floor(w.y - 2); r <= w.y + 2; r++) for (let c = Math.floor(w.x - WEATHER.wakeReach); c <= w.x + WEATHER.wakeReach; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue
        const i = r * cols + c
        // From the cell's middle, where its mark is drawn.
        wakeField[i] = Math.max(wakeField[i]!, wakeLift(c + 0.5 - w.x, r + 0.5 - w.y, age))
      }
    }
    snow.clear()
    for (const [c, r] of snowCells(t, cols, rows, seed)) snow.add(r * cols + c)
    return { current: mix.current * calm, glints: mix.glints * calm, scanAge: (now - scanAt) / 1000 }
  }

  let frame = 0, last = 0, started = 0
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw)
    if (now - last < 1000 / 30) return
    const dt = last ? now - last : 0
    last = now
    const t = (now - started) / 1000 + 2.5  // start part-way through a swell, so the first frame already moves
    const sky = weather ? brew(now, t, dt) : null
    context.clearRect(0, 0, cols * cellW, rows * cellH)
    context.font = font
    context.textBaseline = 'middle'
    for (const cell of cells) {
      let add: CellExtra | undefined
      // The current's own strength here, for its flowing marks.
      let flow = 0
      if (sky) {
        const i = cell.y * cols + cell.x
        let lift = wakeField[i]! * 0.9
        let warm = wakeField[i]! * 0.25
        extra.mark = undefined
        // A current lifts and warms the marks it passes through; surface light lifts and warms them more.
        if (sky.current) { flow = currentAt(cell.x / cols, cell.y / rows, t) * sky.current; lift += 1.8 * flow; warm += 0.55 * flow }
        if (sky.glints) { const g = glintAt(cell.x, cell.y, rows, t) * sky.glints; lift += 1.6 * g; warm += 1 * g }
        if (snow.has(i)) lift = Math.max(lift, 0.6)
        if (cell.y === scanRow) { const s = scanCell(cell.x, sky.scanAge); if (s) { lift += s.lift; warm += s.warm; extra.mark = s.level } }
        if (lift > 0.01 || warm > 0.01) { extra.lift = lift; extra.warm = warm; add = extra }
      }
      const { level, alpha, warm } = rippleCell(cell.d, cell.ink, cell.jitter, t, add)
      if (!level) continue
      // Where the weather is, its marks may stand out more than the cloud's own; in the heart of a current they turn
      // to water running across (~ and -, flowing a cell at a time).
      context.fillStyle = colour(warm, alpha, add ? 0.5 + 0.35 * Math.min(1, add.lift) : 0.5)
      const glyph = flow > 0.45 ? ((cell.x + cell.y - Math.floor(t * 6)) % 3 ? '~' : '-') : CLOUD_GLYPHS[level]!
      context.fillText(glyph, cell.x * cellW, cell.y * cellH + cellH / 2)
    }
  }

  whenVisible(pre.parentElement ?? pre, () => {
    if (!canvas.isConnected) {
      size()
      pre.after(canvas)
    }
    started ||= performance.now()
    // The first scan waits until the cloud has been seen a moment.
    nextScan ||= started + 8000
    pre.classList.add('is-handed-off')
    canvas.classList.add('is-live')
    frame = requestAnimationFrame(draw)
  }, () => {
    cancelAnimationFrame(frame)
    canvas.classList.remove('is-live')
    pre.classList.remove('is-handed-off')
  })
  window.addEventListener('resize', () => { if (canvas.isConnected) size() })
}
