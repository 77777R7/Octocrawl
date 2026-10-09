import { BEACONS, EARTH_ART, EARTH_CELL, EARTH_SIZE, LAND, type EarthAnalysis } from './earthArtwork'

/* The free-tiers window's lights. Every light is one of the Earth artwork's own painted glyphs, drawn again over
 * itself a little brighter in the palette's light colours, so the cells never move and, with nothing lit, the
 * artwork shows exactly as painted. The lights change only when the visitor does something: choosing a tier lights
 * that many marks (5, 20, 1,000, every one), the pointer brightens the marks it passes over, and a click sends a
 * ring of light through the marks around it. Nothing loops on its own, and with reduced motion a tier's marks are
 * simply lit. */

// Only the palette's roles (styles.css :root): land lights in --orange-200 (#ffae86), a city's core in --orange-100
// (#ffc2a4) with an --orange-200 halo, the sea and the pointer's light in --on-navy (#e6eefc) over --on-navy-2
// (#b7c8e6). The sea only brightens softly, as a haze, so a lit planet still reads as painted marks, not a grid.
const WARM = { mark: '255,174,134', glow: '255,174,134' }
const CITY = { mark: '255,194,164', glow: '255,174,134' }
const COOL = { mark: '230,238,252', glow: '183,200,230' }
// A light flares as it comes on, then settles; a light going out fades.
const FLARE_MS = 220
const SETTLE_MS = 900
const OUT_MS = 420
const STEADY = 0.72
// "Not lit" and "not going out": no clock value can equal it (a settled light's time can be negative early on).
const OFF = Number.NEGATIVE_INFINITY
// The pointer's reach and how fast its light fades; a click's ring speed (css px per ms) and life.
const REACH = 64
const COOL_MS = 240
const RING_SPEED = 0.5
const RING_MS = 1300

export type EarthLights = { show(count: number): void, dispose(): void, /** Settles once the planet's marks can be lit; rejects if they never can. */ ready: Promise<void> }

let analysis: Promise<EarthAnalysis> | undefined
/** Decodes the artwork and finds its glyphs in a worker, once per page; a failure is not kept. Without workers,
 * OffscreenCanvas or createImageBitmap the painted artwork simply stays as it is. */
function load(): Promise<EarthAnalysis> {
  if (!analysis) {
    analysis = (async () => {
      const bitmap = await createImageBitmap(await (await fetch(EARTH_ART)).blob())
      const worker = new Worker(new URL('./earthGlyphsWorker.ts', import.meta.url), { type: 'module' })
      try {
        return await new Promise<EarthAnalysis>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<EarthAnalysis>) => resolve(event.data)
          worker.onerror = () => reject(new Error('Earth glyph analysis failed'))
          worker.postMessage(bitmap, [bitmap])
        })
      } finally {
        worker.terminate()
      }
    })()
    analysis.catch(() => { analysis = undefined })
  }
  return analysis
}

/** An object-position component ("72%", "40px", "center"…) as an offset in px, given the free space. */
function offset(value: string | undefined, free: number): number {
  const v = (value ?? '').trim()
  if (v.endsWith('%')) return (free * Number.parseFloat(v)) / 100
  if (v.endsWith('px')) return Number.parseFloat(v)
  if (v === 'left' || v === 'top') return 0
  if (v === 'right' || v === 'bottom') return free
  return free / 2
}

/** A light's strength at `age` ms after it came on: a quick flare, then a settle to its steady glow. */
function strength(age: number): number {
  if (age < 0) return 0
  if (age < FLARE_MS) return (age / FLARE_MS) ** 0.6
  if (age < SETTLE_MS) return 1 - (1 - STEADY) * ((age - FLARE_MS) / (SETTLE_MS - FLARE_MS)) ** 0.8
  return STEADY
}

/** Lights the Earth artwork inside `art` (the element holding its <img>). `area` takes the pointer and clicks;
 * clicks inside `ignore` (the rail of tiers) are not the planet's. */
export function mountEarthLights(art: HTMLElement, area: HTMLElement, ignore: HTMLElement | null): EarthLights {
  const img = art.querySelector('img')
  const canvas = document.createElement('canvas')
  canvas.className = 'earth-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  art.append(canvas)
  const context = canvas.getContext('2d')
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const fine = window.matchMedia('(pointer: fine)')

  let glyphs: Float32Array = new Float32Array(0)
  let order: Uint16Array = new Uint16Array(0)
  let xs = new Float32Array(0)
  let ys = new Float32Array(0)
  let heat = new Float32Array(0)
  // Per light, by its place in the order: when it came on, and when it began to go out (OFF: never).
  let onAt = new Float64Array(0)
  let offAt = new Float64Array(0)
  let shown = 0
  let wanted = 0
  let ready = false
  let width = 0
  let height = 0
  let ratio = 1
  let cell = EARTH_CELL
  let sprites: Record<'warm' | 'city' | 'cool', { mark: HTMLCanvasElement, glow: HTMLCanvasElement }> | null = null
  const rings: Array<{ x: number, y: number, at: number }> = []
  // Marks that flicker as one of the first few lights comes on, so a single light is not lost on the planet.
  const sparks: Array<{ x: number, y: number, at: number }> = []
  let raf = 0
  let last = 0
  let onScreen = false
  // The first tier lights up as the window first comes on screen, not before.
  let entered = false
  let disposed = false

  function sprite(colour: string, kind: 'mark' | 'glow', reach = 3.2): HTMLCanvasElement {
    const s = document.createElement('canvas')
    const size = Math.ceil((kind === 'glow' ? cell * reach : cell * 1.2) * ratio)
    s.width = s.height = size
    const c = s.getContext('2d')!
    const mid = size / 2
    if (kind === 'glow') {
      const g = c.createRadialGradient(mid, mid, 0, mid, mid, mid)
      g.addColorStop(0, `rgba(${colour},.9)`)
      g.addColorStop(0.35, `rgba(${colour},.28)`)
      g.addColorStop(1, `rgba(${colour},0)`)
      c.fillStyle = g
      c.fillRect(0, 0, size, size)
    } else {
      // The artwork's own mark: a small ×.
      const arm = cell * 0.24 * ratio
      c.strokeStyle = `rgb(${colour})`
      c.lineWidth = Math.max(1, cell * 0.13 * ratio)
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(mid - arm, mid - arm)
      c.lineTo(mid + arm, mid + arm)
      c.moveTo(mid + arm, mid - arm)
      c.lineTo(mid - arm, mid + arm)
      c.stroke()
    }
    return s
  }

  function layout(): void {
    width = art.clientWidth
    height = art.clientHeight
    if (!width || !height) return
    const scale = Math.max(width / EARTH_SIZE.width, height / EARTH_SIZE.height)
    const [px, py] = (img ? getComputedStyle(img).objectPosition : '50% 50%').split(/\s+/)
    const ox = offset(px, width - EARTH_SIZE.width * scale)
    const oy = offset(py, height - EARTH_SIZE.height * scale)
    ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(3e6 / Math.max(1, width * height)))
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    cell = EARTH_CELL * scale
    const count = glyphs.length / 3
    xs = new Float32Array(count)
    ys = new Float32Array(count)
    for (let g = 0; g < count; g++) {
      xs[g] = ox + glyphs[g * 3]! * scale
      ys[g] = oy + glyphs[g * 3 + 1]! * scale
    }
    sprites = {
      warm: { mark: sprite(WARM.mark, 'mark'), glow: sprite(WARM.glow, 'glow') },
      city: { mark: sprite(CITY.mark, 'mark'), glow: sprite(CITY.glow, 'glow', 8) },
      cool: { mark: sprite(COOL.mark, 'mark'), glow: sprite(COOL.glow, 'glow') },
    }
    request()
  }

  function stamp(g: number, kind: 'warm' | 'city' | 'cool', mark: number, glow: number): void {
    if (!context || !sprites) return
    const { mark: m, glow: l } = sprites[kind]
    const x = xs[g]! * ratio
    const y = ys[g]! * ratio
    if (glow > 0.01) {
      context.globalAlpha = Math.min(1, glow)
      context.drawImage(l, x - l.width / 2, y - l.height / 2)
    }
    if (mark > 0.01) {
      context.globalAlpha = Math.min(1, mark)
      context.drawImage(m, x - m.width / 2, y - m.height / 2)
    }
  }

  /** Draws one frame; true while anything is still changing. */
  function draw(now: number): boolean {
    if (!context) return false
    const dt = last ? Math.min(64, now - last) : 16
    last = now
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    let moving = false
    for (let rank = 0; rank < order.length; rank++) {
      const on = onAt[rank]!
      if (on === OFF) continue
      const age = now - on
      let s = strength(age)
      if (age < SETTLE_MS) moving = true
      const off = offAt[rank]!
      if (off !== OFF) {
        const gone = (now - off) / OUT_MS
        if (gone >= 1) { onAt[rank] = OFF; offAt[rank] = OFF; continue }
        if (gone > 0) s *= 1 - gone
        moving = true
      }
      if (s <= 0) continue
      const g = order[rank]!
      if (rank < BEACONS) stamp(g, 'city', s, s * 0.62)
      else if (glyphs[g * 3 + 2] === LAND) stamp(g, 'warm', s * 0.9, s * 0.16)
      else stamp(g, 'cool', s * 0.2, s * 0.1)
    }
    // The pointer's and the rings' light, in the cool tint, on any glyph.
    const fade = Math.exp(-dt / COOL_MS)
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i]!
      if (now < spark.at) { moving = true; continue }
      lift(spark.x, spark.y, cell * 2.6, 0.55)
      sparks.splice(i, 1)
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]!
      const age = now - ring.at
      if (age > RING_MS) { rings.splice(i, 1); continue }
      const radius = age * RING_SPEED
      const band = cell * 1.6
      const lift = 0.5 * (1 - age / RING_MS)
      for (let g = 0; g < xs.length; g++) {
        const d = Math.abs(Math.hypot(xs[g]! - ring.x, ys[g]! - ring.y) - radius)
        if (d < band) heat[g] = Math.max(heat[g]!, lift * (1 - d / band))
      }
      moving = true
    }
    for (let g = 0; g < heat.length; g++) {
      const h = heat[g]!
      if (h < 0.015) { heat[g] = 0; continue }
      stamp(g, 'cool', h * 0.8, h * 0.22)
      heat[g] = h * fade
      moving = true
    }
    context.globalAlpha = 1
    return moving
  }

  /** Lifts the marks within `reach` of a point (css px) towards `level`, most at the centre. */
  function lift(x: number, y: number, reach: number, level: number): void {
    for (let g = 0; g < xs.length; g++) {
      const d = Math.hypot(xs[g]! - x, ys[g]! - y)
      if (d < reach) heat[g] = Math.max(heat[g]!, level * (1 - d / reach) ** 2)
    }
  }

  function frame(now: number): void {
    raf = 0
    if (disposed || !onScreen) return
    if (draw(now)) raf = requestAnimationFrame(frame)
    else last = 0
  }
  function request(): void {
    if (!raf && onScreen && ready && !disposed) raf = requestAnimationFrame(frame)
  }

  function apply(): void {
    if (!ready) return
    if (!entered) {
      if (!onScreen) return
      entered = true
    }
    const count = Math.max(0, Math.min(order.length, wanted))
    const now = performance.now()
    const still = motion.matches || !onScreen
    if (count > shown) {
      const n = count - shown
      const span = still ? 0 : Math.min(1300, 450 + 260 * Math.log10(1 + n))
      for (let rank = shown; rank < count; rank++) {
        const at = still ? now - SETTLE_MS : now + span * ((rank - shown) / n) ** 0.9
        onAt[rank] = at
        offAt[rank] = OFF
        // The first lights of a tier are few; a flicker of the marks around each makes it findable.
        if (!still && rank < 20) sparks.push({ x: xs[order[rank]!]!, y: ys[order[rank]!]!, at })
      }
    } else if (count < shown) {
      for (let rank = count; rank < shown; rank++) {
        if (onAt[rank] === OFF) continue
        offAt[rank] = still ? now - OUT_MS : now + ((shown - 1 - rank) / Math.max(1, shown - count)) * 320
      }
    }
    shown = count
    request()
  }

  const onMove = (event: PointerEvent): void => {
    if (!ready || motion.matches || !fine.matches || event.pointerType === 'touch') return
    const box = art.getBoundingClientRect()
    lift(event.clientX - box.left, event.clientY - box.top, REACH, 0.7)
    request()
  }
  const onDown = (event: PointerEvent): void => {
    if (!ready || motion.matches || (ignore && ignore.contains(event.target as Node))) return
    const box = art.getBoundingClientRect()
    rings.push({ x: event.clientX - box.left, y: event.clientY - box.top, at: performance.now() })
    if (rings.length > 3) rings.shift()
    request()
  }
  area.addEventListener('pointermove', onMove)
  area.addEventListener('pointerdown', onDown)

  const resize = new ResizeObserver(() => { if (ready) layout() })
  resize.observe(art)
  const seen = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting)
    if (onScreen && !entered) apply()
    else if (onScreen) request()
  })
  seen.observe(art)

  const loaded = load().then((result) => {
    if (disposed) return
    glyphs = result.glyphs
    order = result.lights
    heat = new Float32Array(glyphs.length / 3)
    onAt = new Float64Array(order.length).fill(OFF)
    offAt = new Float64Array(order.length).fill(OFF)
    ready = true
    layout()
    apply()
  })
  loaded.catch(() => { /* The painted artwork stays as it is. */ })

  return {
    ready: loaded,
    show(count: number): void {
      wanted = count
      apply()
    },
    dispose(): void {
      disposed = true
      cancelAnimationFrame(raf)
      resize.disconnect()
      seen.disconnect()
      area.removeEventListener('pointermove', onMove)
      area.removeEventListener('pointerdown', onDown)
      canvas.remove()
    },
  }
}
