/** A sunrise behind a dark hill, for the banner that opens What you get. Two layers on one canvas:
 *
 * - the sky, painted once per size with canvas gradients: night at the top corners, a pale sun at the top, a peach
 *   band and an orange glow along the hill's crest, and the hill itself cut out with a blurred edge, so the light
 *   fades into the dark rather than stopping at a line;
 * - characters on a grid over it, each cell's weight and colour read from the same light, so the glyphs are densest
 *   where the sky is brightest and thin out softly towards the crest. Each cell breathes on its own slow sine, so the
 *   field shimmers continuously rather than ticking.
 *
 * The pointer carries a warm light that lifts the characters under it, and a click sends a ripple through them, as
 * the home page's hero does. Characters come up brightest first when the banner is first seen; the loop runs every
 * frame only while the banner is on screen and the tab is visible. With reduced motion it paints one still frame. */

export type GlyphLightOptions = {
  /** Where the top of the hill sits, as a share of the height from the top; read again on every resize. */
  crest: () => number
  /** Height of a character cell in CSS pixels. */
  cell?: number
}

type RGB = readonly [number, number, number]

const NIGHT: RGB = [31, 63, 154]
const SKY: RGB = [156, 195, 240]
const PEACH: RGB = [255, 179, 140]
const ORANGE: RGB = [243, 104, 61]
const SUN: RGB = [255, 246, 236]
const WHITE: RGB = [255, 255, 255]
const MARKS = ' ·:+×xX#@'
const BEND = 0.4
const RIPPLE_SECONDS = 1.4
const INTRO_SECONDS = 1.8

const rgba = ([r, g, b]: RGB, a: number): string => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const within = (v: number): number => Math.min(1, Math.max(0, v))
const soft = (from: number, to: number, v: number): number => {
  const k = within((v - from) / (to - from))
  return k * k * (3 - 2 * k)
}

/** The colour of the sky at a height above the crest, as a share of the banner's height: orange at the crest, peach,
 * then the blue of the open sky. */
const skyAt = (above: number): RGB => (above < 0.12 ? mix(ORANGE, PEACH, above / 0.12) : mix(PEACH, SKY, within((above - 0.12) / 0.3)))

export function mountGlyphLight(host: HTMLElement, options: GlyphLightOptions): boolean {
  const canvas = document.createElement('canvas')
  const paint = canvas.getContext('2d')
  const sky = document.createElement('canvas')
  const skyPaint = sky.getContext('2d')
  if (!paint || !skyPaint) return false
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const box = { w: 1, h: 1, ratio: 1, top: 0.45 }
  const grid = { cols: 0, rows: 0, cw: 0, ch: options.cell ?? 16 }
  // Per cell, fixed for its life: a breathing speed, a phase, a nudge to its mark, and how bright the light must be
  // before the cell shows at all, so the field is sparse in the dim sky and fills in where it is bright.
  let speed = new Float32Array(0)
  let phase = new Float32Array(0)
  let nudge = new Float32Array(0)
  let need = new Float32Array(0)
  const warm = { x: 0, y: 0, k: 0, target: 0 }
  const ripples: Array<{ x: number; y: number; born: number }> = []
  let firstSeen = 0
  let running = false
  let queued = 0
  let onScreen = false

  const crestY = (x: number): number => box.h * (box.top + BEND * ((x - box.w / 2) / box.h) ** 2)

  /** The sky layer, at the canvas's resolution; drawn again only when the size changes. */
  const paintSky = (): void => {
    const { w, h, ratio } = box
    sky.width = canvas.width
    sky.height = canvas.height
    const g = skyPaint
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.clearRect(0, 0, w, h)
    const base = h * box.top
    const fall = g.createLinearGradient(0, 0, 0, base + h * 0.06)
    fall.addColorStop(0, rgba(NIGHT, 0.95))
    fall.addColorStop(0.55, rgba(mix(NIGHT, SKY, 0.45), 0.85))
    fall.addColorStop(0.86, rgba(PEACH, 0.7))
    fall.addColorStop(1, rgba(ORANGE, 0.9))
    g.fillStyle = fall
    g.fillRect(0, 0, w, h)
    const sun = g.createRadialGradient(w / 2, h * 0.02, 0, w / 2, h * 0.02, h * 0.62)
    sun.addColorStop(0, rgba(SUN, 0.8))
    sun.addColorStop(0.45, rgba(SKY, 0.3))
    sun.addColorStop(1, rgba(SKY, 0))
    g.fillStyle = sun
    g.fillRect(0, 0, w, h)
    const corners = g.createRadialGradient(w / 2, h * 0.35, h * 0.3, w / 2, h * 0.35, Math.max(w, h) * 0.75)
    corners.addColorStop(0, rgba(NIGHT, 0))
    corners.addColorStop(1, rgba([12, 24, 70], 0.75))
    g.fillStyle = corners
    g.fillRect(0, 0, w, h)
    const hill = (): void => {
      g.beginPath()
      for (let x = -40; x <= w + 40; x += 8) g.lineTo(x, crestY(x))
    }
    // The glow along the crest: a wide soft band, then a narrower brighter one.
    g.filter = `blur(${Math.round(h * 0.05)}px)`
    hill()
    g.lineWidth = h * 0.14
    g.strokeStyle = rgba(ORANGE, 0.85)
    g.stroke()
    g.filter = `blur(${Math.round(h * 0.014)}px)`
    hill()
    g.lineWidth = h * 0.035
    g.strokeStyle = rgba(PEACH, 0.7)
    g.stroke()
    // The hill, cut out of everything above with a blurred edge, so the banner's own dark shows through.
    g.filter = `blur(${Math.round(h * 0.012)}px)`
    g.globalCompositeOperation = 'destination-out'
    hill()
    g.lineTo(w + 40, h + 40)
    g.lineTo(-40, h + 40)
    g.closePath()
    g.fillStyle = '#000'
    g.fill()
    g.globalCompositeOperation = 'source-over'
    g.filter = 'none'
  }

  const fit = (): void => {
    box.w = Math.max(1, host.clientWidth)
    box.h = Math.max(1, host.clientHeight)
    box.ratio = Math.min(window.devicePixelRatio || 1, 2)
    box.top = options.crest()
    canvas.width = Math.round(box.w * box.ratio)
    canvas.height = Math.round(box.h * box.ratio)
    grid.cw = grid.ch * 0.6
    grid.cols = Math.ceil(box.w / grid.cw)
    grid.rows = Math.ceil(box.h / grid.ch)
    const cells = grid.cols * grid.rows
    speed = new Float32Array(cells)
    phase = new Float32Array(cells)
    nudge = new Float32Array(cells)
    need = new Float32Array(cells)
    for (let i = 0; i < cells; i++) {
      need[i] = Math.random()
      speed[i] = 0.5 + Math.random() * 1.3
      phase[i] = Math.random() * Math.PI * 2
      nudge[i] = (Math.random() - 0.5) * 0.14
    }
    paintSky()
    render(performance.now())
  }

  function render(now: number): void {
    const { w, h, ratio } = box
    const seconds = firstSeen ? (now - firstSeen) / 1000 : 0
    const rise = still ? 1 : soft(0, INTRO_SECONDS, seconds)
    const p = paint!
    p.setTransform(1, 0, 0, 1, 0, 0)
    p.clearRect(0, 0, canvas.width, canvas.height)
    p.globalAlpha = still ? 1 : soft(0, 0.7, seconds)
    p.drawImage(sky, 0, 0)
    p.globalAlpha = 1
    p.setTransform(ratio, 0, 0, ratio, 0, 0)
    // The pointer's warm light eases in and out rather than snapping.
    warm.k += (warm.target - warm.k) * 0.12
    if (warm.k > 0.01) {
      const lamp = p.createRadialGradient(warm.x, warm.y, 0, warm.x, warm.y, h * 0.3)
      lamp.addColorStop(0, rgba(PEACH, 0.28 * warm.k))
      lamp.addColorStop(1, rgba(PEACH, 0))
      // Only where there is sky: the hill stays dark under it.
      p.globalCompositeOperation = 'source-atop'
      p.fillStyle = lamp
      p.fillRect(0, 0, w, h)
      p.globalCompositeOperation = 'source-over'
    }
    while (ripples.length && now - ripples[0]!.born > RIPPLE_SECONDS * 1000) ripples.shift()

    const sunX = w / 2 + h * 0.05 * Math.sin(seconds * 0.17)
    const groups = new Map<string, number[]>()
    for (let row = 0; row < grid.rows; row++) {
      const y = (row + 0.5) * grid.ch
      for (let col = 0; col < grid.cols; col++) {
        const x = (col + 0.5) * grid.cw
        const above = (crestY(x) - y) / h
        const edge = soft(0, 0.07, above)
        if (edge <= 0) continue
        const i = row * grid.cols + col
        const sunny = Math.exp(-(((x - sunX) / h) ** 2 / 0.35 + (y / h - 0.02) ** 2 / 0.14))
        const glow = Math.exp(-above / 0.14)
        const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(seconds * speed[i]! + phase[i]!)
        let lift = 0
        if (warm.k > 0.01) lift += 0.45 * warm.k * Math.max(0, 1 - Math.hypot(x - warm.x, y - warm.y) / (h * 0.22))
        for (const r of ripples) {
          const age = (now - r.born) / 1000 / RIPPLE_SECONDS
          const off = Math.abs(Math.hypot(x - r.x, y - r.y) - age * h * 0.95) / (h * 0.06)
          if (off < 1) lift += (1 - off) ** 2 * (1 - age) * 0.7
        }
        const bright = within(0.16 + 0.56 * Math.max(glow, sunny) + 0.22 * breath + lift) * edge
        // Brightest cells come up first while the banner is first seen.
        const shown = still ? 1 : soft(1 - bright, 1.2 - bright, rise * 1.25)
        const alpha = bright * shown
        if (alpha < 0.08 || need[i]! > bright * 1.15 - 0.05) continue
        const mark = Math.round(within(bright + nudge[i]!) * (MARKS.length - 1))
        if (mark === 0) continue
        const ink = mix(mix(skyAt(above), SUN, sunny * 0.55), WHITE, 0.25 + 0.35 * within(lift))
        const key = `${MARKS[mark]}|${Math.round(ink[0] / 12)}|${Math.round(ink[1] / 12)}|${Math.round(ink[2] / 12)}|${Math.round(alpha * 8)}`
        const cells = groups.get(key)
        if (cells) cells.push(i)
        else groups.set(key, [i])
      }
    }
    p.font = `${Math.round(grid.ch * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    p.textAlign = 'center'
    p.textBaseline = 'middle'
    for (const [key, cells] of groups) {
      const [mark, r, g, b, a] = key.split('|') as [string, string, string, string, string]
      p.fillStyle = `rgba(${+r * 12}, ${+g * 12}, ${+b * 12}, ${Math.min(1, (+a / 8) * 0.95)})`
      for (const i of cells) p.fillText(mark, ((i % grid.cols) + 0.5) * grid.cw, (Math.floor(i / grid.cols) + 0.5) * grid.ch)
    }
  }

  const loop = (now: number): void => {
    queued = 0
    if (!running) return
    render(now)
    queued = requestAnimationFrame(loop)
  }
  const start = (): void => {
    if (running || still || !onScreen || document.hidden) return
    running = true
    if (!firstSeen) firstSeen = performance.now()
    queued = requestAnimationFrame(loop)
  }
  // A frame already asked for is taken back, so stopping and starting again (a tab hidden and shown) runs one loop.
  const stop = (): void => {
    running = false
    cancelAnimationFrame(queued)
    queued = 0
  }

  const surface = host.parentElement ?? host
  const local = (event: PointerEvent): { x: number; y: number } => {
    const rect = host.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  if (!still) {
    surface.addEventListener('pointermove', (event) => {
      const { x, y } = local(event)
      warm.x = x
      warm.y = y
      warm.target = 1
    }, { passive: true })
    surface.addEventListener('pointerleave', () => { warm.target = 0 }, { passive: true })
    surface.addEventListener('pointerdown', (event) => {
      ripples.push({ ...local(event), born: performance.now() })
      if (ripples.length > 3) ripples.shift()
    }, { passive: true })
  }
  new ResizeObserver(fit).observe(host)
  new IntersectionObserver(([entry]) => {
    onScreen = Boolean(entry?.isIntersecting)
    if (onScreen) start()
    else stop()
  }).observe(host)
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  fit()
  return true
}
