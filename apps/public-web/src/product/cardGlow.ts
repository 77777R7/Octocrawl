/** Life in the format cards' paintings. The paintings are cross-stitch, every mark on a grid about 14.5 px apart in
 * the source, so nothing here moves or bends the picture: a canvas over each card, screened onto it (product.css),
 * lights the painting's own marks in place and draws glyphs of its own on the same grid.
 *
 * - Light drifts across the card the way the clouds lean, in soft patches that form and dissolve: the painting is
 *   drawn again through a mask of flowing noise, one value per grid cell, so whole stitches brighten and dim.
 * - When a card comes to the front, a front sweeps across it and decodes it: marks just ahead of it turn over
 *   through ·:+×, the front itself is lit, and it settles behind.
 * - The painting's own stars (bright marks on a dark ground) twinkle with a halo and a brief + flare.
 * - Skies send a shooting star now and then, a trail of lit marks hopping cell to cell; landscapes have fireflies,
 *   glyphs that drift up and sway, lighting the marks around them.
 * - The pointer carries a warm pool of light and leaves sparks in the cells it crosses; a click sends a ring of
 *   turned-over marks outwards.
 *
 * Only the cards on screen, and on wide screens only those not covered, are drawn; the loop stops off screen and
 * while the tab is hidden. With reduced motion nothing is mounted and the paintings stay still. */

type RGB = readonly [number, number, number]
type Star = { u: number; v: number; color: RGB; speed: number; phase: number }
type Glyph = { x: number; y: number; vx: number; vy: number; born: number; life: number; kind: 'spark' | 'firefly'; seed: number }
type Card = {
  el: HTMLElement
  index: number
  sky: boolean
  canvas: HTMLCanvasElement
  paint: CanvasRenderingContext2D
  mask: HTMLCanvasElement
  maskPaint: CanvasRenderingContext2D
  maskData: ImageData | null
  /** Each cell's flowing light this frame, 0 to 1, for the glyph field. */
  flow: Float32Array
  image: HTMLImageElement | null
  stars: Star[]
  fit: { x: number; y: number; w: number; h: number }
  size: { w: number; h: number; ratio: number }
  grid: { cell: number; ox: number; oy: number; cols: number; rows: number }
  seen: boolean
  front: boolean
  entered: number
  glyphs: Glyph[]
  ripples: Array<{ x: number; y: number; born: number }>
  meteor: { x: number; y: number; vx: number; vy: number; born: number } | null
  /** When the next shooting star (skies) or firefly (landscapes) may come, in seconds on the card's clock. */
  nextMeteor: number
  light: { x: number; y: number; k: number }
}

const SOURCE_WIDTH = 1672
const SOURCE_CELL = 14.5
const MARKS = '·:+×'
const WARM: RGB = [255, 196, 140]
const ICE: RGB = [214, 240, 255]
const GOLD: RGB = [255, 226, 160]
const ENTER_SECONDS = 1.3
const RIPPLE_SECONDS = 1.4

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
    cards.push({
      el, index, sky: index < 3, canvas, paint, mask, maskPaint, maskData: null, flow: new Float32Array(0), image: null, stars: [],
      fit: { x: 0, y: 0, w: 1, h: 1 }, size: { w: 1, h: 1, ratio: 1 }, grid: { cell: 10, ox: 0, oy: 0, cols: 1, rows: 1 },
      seen: false, front: false, entered: -1e9, glyphs: [], ripples: [], meteor: null, nextMeteor: 2 + index, light: { x: 0, y: 0, k: 0 },
    })
  }
  const pointer = { card: null as Card | null, x: 0, y: 0, cx: -1, cy: -1, lastCell: '' }
  const narrow = window.matchMedia('(max-width: 1000px)')
  const clock = performance.now()
  let frame = 0
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
      card.stars = findStars(image).map((s, i) => ({ ...s, speed: 0.5 + hash(card.index, i) * 0.9, phase: hash(i, card.index + 9) * Math.PI * 2 }))
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
    card.flow = new Float32Array(cols * rows)
  }

  /** Whether a card is drawn now: on screen, and on wide screens risen and not yet covered. */
  const live = (card: Card): boolean => {
    if (!card.seen || !card.maskData) return false
    if (card.el.classList.contains('is-waiting')) return false
    return (parseFloat(card.el.style.getPropertyValue('--fx-under')) || 0) < 0.97
  }

  /** The cell centre nearest a point. */
  const snap = (card: Card, x: number, y: number): [number, number] => {
    const { cell, ox, oy } = card.grid
    return [ox + (Math.round((x - ox) / cell - 0.5) + 0.5) * cell, oy + (Math.round((y - oy) / cell - 0.5) + 0.5) * cell]
  }

  const glyph = (g: CanvasRenderingContext2D, card: Card, mark: string, x: number, y: number, color: RGB, alpha: number): void => {
    if (alpha < 0.03) return
    const [sx, sy] = snap(card, x, y)
    g.fillStyle = rgba(color, alpha)
    g.fillText(mark, sx, sy)
  }

  const draw = (card: Card, now: number): void => {
    const { w, h, ratio } = card.size
    const { cell, ox, oy, cols, rows } = card.grid
    const g = card.paint
    const t = (now - clock) / 1000
    const since = t - card.entered
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, w, h)

    // The pointer's pool eases in and out and follows the pointer softly.
    const here = pointer.card === card
    card.light.k += ((here ? 1 : 0) - card.light.k) * 0.08
    if (here) {
      card.light.x += (pointer.x - card.light.x) * 0.18
      card.light.y += (pointer.y - card.light.y) * 0.18
    }
    while (card.ripples.length && t - card.ripples[0]!.born > RIPPLE_SECONDS) card.ripples.shift()

    // 1. How much light each cell catches: flowing patches, the entrance front, the pointer's pool, the ripples.
    const data = card.maskData!.data
    const front = since < ENTER_SECONDS ? soft(0, 1, since / ENTER_SECONDS) * 1.3 - 0.15 : 2
    const pool = Math.max(w, h) * 0.38
    for (let r = 0; r < rows; r++) {
      const y = oy + (r + 0.5) * cell
      for (let c = 0; c < cols; c++) {
        const x = ox + (c + 0.5) * cell
        const flow = 0.62 * noise(c * 0.075 - t * 0.32, r * 0.11 + t * 0.06) + 0.38 * noise(c * 0.19 + 17 - t * 0.55, r * 0.23 - t * 0.12)
        card.flow[r * cols + c] = flow
        let a = soft(0.42, 0.78, flow) * 0.7
        if (front < 2) {
          const d = (x / w) * 0.85 + (y / h) * 0.15 - front
          a = Math.max(a, Math.exp(-(d * d) / 0.006), d < 0 ? 0.45 * soft(-0.6, 0, d) : 0)
        }
        if (card.light.k > 0.01) {
          const d = Math.hypot(x - card.light.x, y - card.light.y) / pool
          a = Math.max(a, card.light.k * 0.85 * Math.exp(-d * d * 1.6))
        }
        for (const rp of card.ripples) {
          const age = (t - rp.born) / RIPPLE_SECONDS
          const off = (Math.hypot(x - rp.x, y - rp.y) - age * Math.max(w, h) * 0.95) / (cell * 3.2)
          a = Math.max(a, Math.exp(-off * off) * (1 - age) * 0.95)
        }
        // The light's own colour: ice where it is faint, gold where it gathers.
        const at = (r * cols + c) * 4
        const warm = soft(0.45, 0.95, a)
        data[at] = ICE[0] + (GOLD[0] - ICE[0]) * warm
        data[at + 1] = ICE[1] + (GOLD[1] - ICE[1]) * warm
        data[at + 2] = ICE[2] + (GOLD[2] - ICE[2]) * warm
        data[at + 3] = a * 255
      }
    }
    card.maskPaint.putImageData(card.maskData!, 0, 0)
    g.imageSmoothingEnabled = true
    g.drawImage(card.mask, ox, oy, cols * cell, rows * cell)

    // 2. The stars' own marks, while they twinkle.
    const twinkles = card.stars.map((s) => ({
      x: card.fit.x + s.u * card.fit.w,
      y: card.fit.y + s.v * card.fit.h,
      k: Math.max(0, Math.sin(t * s.speed + s.phase)) ** 3,
      color: s.color,
    }))
    for (const s of twinkles) {
      if (s.k < 0.02) continue
      const spot = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, cell * 1.8)
      spot.addColorStop(0, `rgba(0, 0, 0, ${s.k})`)
      spot.addColorStop(1, 'rgba(0, 0, 0, 0)')
      g.fillStyle = spot
      g.fillRect(s.x - cell * 2, s.y - cell * 2, cell * 4, cell * 4)
    }

    // 3. The painting itself, kept where the light falls: screened onto the card, the marks there brighten.
    g.globalCompositeOperation = 'source-in'
    g.drawImage(card.image!, card.fit.x, card.fit.y, card.fit.w, card.fit.h)

    // 4. The light's colour over it, and glyphs of our own on the same grid, both added as light.
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = 0.3
    g.drawImage(card.mask, ox, oy, cols * cell, rows * cell)
    g.globalAlpha = 1
    g.font = `600 ${Math.round(cell * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'

    // The wind: where the light gathers, the stitches show as glyphs of our own, weighted by the light and turning over
    // as it passes, so the field visibly streams the way the clouds lean.
    const batches = new Map<string, number[]>()
    const turn = Math.floor(t * 6)
    for (let i = 0; i < card.flow.length; i++) {
      const f = card.flow[i]!
      if (f < 0.56) continue
      const c = i % cols
      const r = (i - c) / cols
      if (hash(c, r) > 0.45 + (f - 0.56) * 1.6) continue
      const level = soft(0.56, 0.86, f)
      const mark = MARKS[Math.min(MARKS.length - 1, Math.floor(level * MARKS.length + hash(c + turn, r) * 0.9))]!
      const key = `${mark}|${Math.round(level * 6)}`
      const list = batches.get(key)
      if (list) list.push(i)
      else batches.set(key, [i])
    }
    for (const [key, cells] of batches) {
      const [mark, step] = key.split('|') as [string, string]
      const level = Number(step) / 6
      const hue: RGB = [Math.round(ICE[0] + (GOLD[0] - ICE[0]) * level), Math.round(ICE[1] + (GOLD[1] - ICE[1]) * level), Math.round(ICE[2] + (GOLD[2] - ICE[2]) * level)]
      g.fillStyle = rgba(hue, 0.18 + 0.55 * level)
      for (const i of cells) {
        const c = i % cols
        g.fillText(mark, ox + (c + 0.5) * cell, oy + ((i - c) / cols + 0.5) * cell)
      }
    }

    for (const s of twinkles) {
      if (s.k < 0.02) continue
      const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, cell * 3)
      halo.addColorStop(0, rgba(s.color, 0.8 * s.k))
      halo.addColorStop(0.3, rgba(s.color, 0.25 * s.k))
      halo.addColorStop(1, rgba(s.color, 0))
      g.fillStyle = halo
      g.fillRect(s.x - cell * 3, s.y - cell * 3, cell * 6, cell * 6)
      // At its brightest a star flares into a + across its neighbours.
      if (s.k > 0.6) {
        const f = (s.k - 0.6) / 0.4
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) glyph(g, card, '+', s.x + dx * cell, s.y + dy * cell, s.color, 0.55 * f)
      }
    }

    // The entrance front decodes the card: marks just ahead of it turn over, brightest at the front.
    if (front < 2) {
      const tick = Math.floor(t * 20)
      for (let r = 0; r < rows; r++) {
        const y = oy + (r + 0.5) * cell
        for (let c = 0; c < cols; c++) {
          const x = ox + (c + 0.5) * cell
          const d = (x / w) * 0.85 + (y / h) * 0.15 - front
          if (d < -0.06 || d > 0.14) continue
          if (hash(c + tick, r) > 0.8) continue
          const k = d < 0 ? 1 + d / 0.06 : 1 - d / 0.14
          glyph(g, card, MARKS[Math.floor(hash(c, r + tick) * MARKS.length)]!, x, y, d < 0.02 ? GOLD : ICE, k)
        }
      }
    }

    // A click's ring turns marks over as it passes.
    for (const rp of card.ripples) {
      const age = (t - rp.born) / RIPPLE_SECONDS
      const radius = age * Math.max(w, h) * 0.95
      const steps = Math.ceil((radius * Math.PI * 2) / cell)
      for (let i = 0; i < steps; i++) {
        if (hash(i, Math.floor(t * 18)) > 0.6) continue
        const a = (i / steps) * Math.PI * 2
        glyph(g, card, MARKS[(i + Math.floor(t * 12)) % MARKS.length]!, rp.x + Math.cos(a) * radius, rp.y + Math.sin(a) * radius, WARM, 0.9 * (1 - age))
      }
    }

    // Skies: a shooting star now and then, hopping cell to cell, its trail fading through ×+:·.
    if (card.sky) {
      if (!card.meteor && t > card.nextMeteor) {
        const from = hash(card.index, Math.floor(t))
        card.meteor = { x: w * (0.15 + 0.6 * from), y: h * (0.04 + 0.12 * hash(Math.floor(t), card.index)), vx: w * 0.55, vy: h * 0.28, born: t }
      }
      if (card.meteor) {
        const m = card.meteor
        const age = t - m.born
        const life = 1.1
        if (age > life) {
          card.meteor = null
          card.nextMeteor = t + 3.5 + hash(card.index, Math.floor(t)) * 4
        } else {
          const fade = Math.sin((age / life) * Math.PI)
          const hx = m.x + m.vx * age
          const hy = m.y + m.vy * age
          const len = Math.hypot(m.vx, m.vy)
          for (let i = 0; i < 12; i++) {
            const back = i * cell * 0.9
            const mark = i === 0 ? '×' : i < 3 ? '+' : i < 7 ? ':' : '·'
            glyph(g, card, mark, hx - (m.vx / len) * back, hy - (m.vy / len) * back, i === 0 ? [255, 255, 255] : GOLD, fade * (1 - i / 12))
          }
          const head = g.createRadialGradient(hx, hy, 0, hx, hy, cell * 3)
          head.addColorStop(0, rgba([255, 240, 210], 0.55 * fade))
          head.addColorStop(1, rgba([255, 240, 210], 0))
          g.fillStyle = head
          g.fillRect(hx - cell * 3, hy - cell * 3, cell * 6, cell * 6)
        }
      }
    } else {
      // Landscapes: fireflies drift up from the lower half, swaying, each a glyph with a glow.
      const fireflies = card.glyphs.filter((p) => p.kind === 'firefly').length
      if (fireflies < 16 && t > card.nextMeteor) {
        card.nextMeteor = t + 0.3 + hash(t, card.index) * 0.5
        card.glyphs.push({ x: w * hash(t, 3), y: h * (0.55 + 0.4 * hash(t, 5)), vx: 0, vy: -h * (0.03 + 0.04 * hash(t, 7)), born: t, life: 4 + 3 * hash(t, 11), kind: 'firefly', seed: hash(t, 13) * 10 })
      }
    }

    // Glyph particles: fireflies and the pointer's sparks.
    card.glyphs = card.glyphs.filter((p) => t - p.born < p.life)
    for (const p of card.glyphs) {
      const age = t - p.born
      const k = Math.sin((age / p.life) * Math.PI)
      if (p.kind === 'firefly') {
        const x = p.x + Math.sin(age * 1.3 + p.seed) * cell * 2.5
        const y = p.y + p.vy * age
        const pulse = 0.55 + 0.45 * Math.sin(age * 5 + p.seed)
        const glow = g.createRadialGradient(x, y, 0, x, y, cell * 2.6)
        glow.addColorStop(0, rgba(GOLD, 0.55 * k * pulse))
        glow.addColorStop(1, rgba(GOLD, 0))
        g.fillStyle = glow
        g.fillRect(x - cell * 3, y - cell * 3, cell * 6, cell * 6)
        glyph(g, card, pulse > 0.75 ? '×' : '+', x, y, [255, 236, 170], k * pulse)
      } else {
        const mark = MARKS[Math.max(0, MARKS.length - 1 - Math.floor((age / p.life) * MARKS.length))]!
        glyph(g, card, mark, p.x + p.vx * age, p.y + p.vy * age, WARM, k)
      }
    }
  }

  const loop = (now: number): void => {
    frame = 0
    if (!onScreen || document.hidden) return
    // The front card: on wide screens the uncovered one; on narrow screens every card on screen counts as one.
    for (const card of cards) {
      let isFront = live(card)
      if (isFront && narrow.matches) {
        // Stacked cards: one counts as front once a third of it is in the window, so its sweep is seen.
        const box = card.el.getBoundingClientRect()
        isFront = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0) > box.height / 3
      } else if (isFront) isFront = (parseFloat(card.el.style.getPropertyValue('--fx-under')) || 0) < 0.5
      // A card no longer drawn lets go of the pointer's light, so an old pool does not come back with it.
      if (!live(card)) card.light.k = 0
      if (isFront && !card.front) card.entered = (now - clock) / 1000
      card.front = isFront
    }
    for (const card of cards) if (live(card)) draw(card, now)
    frame = requestAnimationFrame(loop)
  }
  const start = (): void => {
    if (!frame && onScreen && !document.hidden) frame = requestAnimationFrame(loop)
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
    // A spark in each new cell the pointer crosses.
    const { cell } = card.grid
    const key = `${card.index}:${Math.round(pointer.x / cell)}:${Math.round(pointer.y / cell)}`
    if (key === pointer.lastCell) return
    pointer.lastCell = key
    const t = (performance.now() - clock) / 1000
    for (let i = 0; i < 4; i++) {
      card.glyphs.push({ x: pointer.x + (hash(t, i) - 0.5) * cell * 3, y: pointer.y + (hash(i, t) - 0.5) * cell * 3, vx: (hash(t + 1, i) - 0.5) * cell * 2, vy: -cell * (1.5 + hash(i, t + 2) * 3), born: t, life: 0.9 + hash(t, i + 3) * 0.7, kind: 'spark', seed: 0 })
    }
    if (card.glyphs.length > 120) card.glyphs.splice(0, card.glyphs.length - 120)
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
