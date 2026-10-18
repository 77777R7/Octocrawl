/** The Built for cards' figures (scrapePage.ts builtFor): small 3D shapes made of points, turning slowly, drawn as
 * characters on a grid. Each point lands in a grid cell; the nearest, best-lit point in a cell picks its character
 * from a ramp (fainter marks for the far side, denser ones for the near) and its colour, ice blue or, for a figure's
 * moving part, the brand's orange.
 *
 * - orbit (agents): a tilted ring with a bead running round it and a small core, an agent's loop round its tools;
 * - stack (pipelines): three discs, one above another, with drops falling from each to the next;
 * - radar (monitoring): a tilted dish with rings and a sweep that lights what it passes, a few blips flaring.
 *
 * A figure scrambles its characters and settles when its card first comes into view; the pointer over a card turns it
 * faster and brightens it. It draws only while on screen and the tab is visible; with reduced motion each draws one
 * still frame. */

type Point = { x: number; y: number; z: number; glow: number; accent: boolean }
type Figure = (t: number) => Point[]

const RAMP = '·:-=+xX#%@'
const ICE = '150, 198, 248'
const ACCENT = '255, 174, 134'
const SETTLE_SECONDS = 0.9

const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Points on a circle of radius r in the plane y = h, `n` of them, starting at angle `from`. */
function circle(r: number, h: number, n: number, from = 0): Array<[number, number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const a = from + (i / n) * Math.PI * 2
    return [Math.cos(a) * r, h, Math.sin(a) * r]
  })
}

/** A ball of points of radius r round (cx, cy, cz). */
function ball(cx: number, cy: number, cz: number, r: number, n: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  for (let i = 0; i < n; i++) {
    // Even spread on a sphere (golden angle), filled towards the middle.
    const y = 1 - (2 * (i + 0.5)) / n
    const s = Math.sqrt(1 - y * y)
    const a = i * 2.39996
    for (const k of [1, 0.6]) out.push([cx + Math.cos(a) * s * r * k, cy + y * r * k, cz + Math.sin(a) * s * r * k])
  }
  return out
}

const FIGURES: Record<string, Figure> = {
  orbit(t) {
    const points: Point[] = []
    // The ring: a thin torus.
    for (let i = 0; i < 90; i++) {
      const u = (i / 90) * Math.PI * 2
      for (let j = 0; j < 10; j++) {
        const v = (j / 10) * Math.PI * 2
        const r = 1 + 0.12 * Math.cos(v)
        points.push({ x: Math.cos(u) * r, y: 0.12 * Math.sin(v), z: Math.sin(u) * r, glow: 0.75, accent: false })
      }
    }
    // The core, and the bead running round the ring.
    for (const [x, y, z] of ball(0, 0, 0, 0.34, 70)) points.push({ x, y, z, glow: 0.65, accent: false })
    const a = t * 1.3
    for (const [x, y, z] of ball(Math.cos(a), 0, Math.sin(a), 0.17, 26)) points.push({ x, y, z, glow: 1, accent: true })
    return points
  },
  stack(t) {
    const points: Point[] = []
    const levels = [-0.78, 0, 0.78]
    for (const [k, h] of levels.entries()) {
      // A filled disc: rings from the rim inward; the level the drops are leaving glows a little.
      const lit = 0.7 + 0.3 * Math.max(0, Math.cos((t * 1.2 - k) * Math.PI * 0.66))
      for (let ring = 0; ring < 4; ring++) {
        const r = 1 - ring * 0.26
        for (const [x, y, z] of circle(r, h, Math.round(64 * r) + 6, ring * 0.3)) points.push({ x, y, z, glow: (ring === 0 ? 1 : 0.5) * lit, accent: false })
      }
    }
    // Drops falling from each disc to the next, on a ring of their own.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const fall = (t * 0.5 + i * 0.37) % 1
      const y = levels[0]! + fall * (levels[2]! - levels[0]!)
      for (const [x, yy, z] of ball(Math.cos(a) * 0.55, y, Math.sin(a) * 0.55, 0.07, 6)) points.push({ x, y: yy, z, glow: 1, accent: true })
    }
    return points
  },
  radar(t) {
    const points: Point[] = []
    const sweep = (t * 1.1) % (Math.PI * 2)
    const lit = (a: number): number => {
      const behind = (sweep - a + Math.PI * 4) % (Math.PI * 2)
      return Math.exp(-behind / 0.9)
    }
    // The dish: rings, and a sparse fill across it.
    for (const r of [0.34, 0.67, 1]) {
      for (const [x, y, z] of circle(r, 0, Math.round(80 * r) + 8)) points.push({ x, y, z, glow: 0.5 + 0.5 * lit(Math.atan2(z, x)), accent: false })
    }
    for (let i = 0; i < 360; i++) {
      const r = Math.sqrt(hash(i, 1))
      const a = hash(i, 2) * Math.PI * 2
      points.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, glow: 0.18 + 0.82 * lit(a), accent: false })
    }
    // The sweep's arm, and blips that flare as it passes.
    for (let i = 0; i < 26; i++) {
      const r = i / 25
      points.push({ x: Math.cos(sweep) * r, y: 0, z: Math.sin(sweep) * r, glow: 1, accent: false })
    }
    for (const [r, a] of [[0.5, 0.9], [0.82, 3.1], [0.3, 4.6], [0.72, 5.5]] as const) {
      const k = lit(a)
      if (k > 0.08) for (const [x, y, z] of ball(Math.cos(a) * r, 0, Math.sin(a) * r, 0.05 + 0.04 * k, 5)) points.push({ x, y, z, glow: k, accent: true })
    }
    return points
  },
}

/** How each figure is turned to face the reader: a tilt towards them, and a slow turn about its upright axis. */
const VIEW: Record<string, { tilt: number; spin: (t: number) => number; scale: number }> = {
  orbit: { tilt: 0.62, spin: (t) => t * 0.35, scale: 0.9 },
  stack: { tilt: 0.42, spin: (t) => t * 0.3, scale: 0.74 },
  radar: { tilt: 1.02, spin: (t) => Math.sin(t * 0.25) * 0.35, scale: 0.94 },
}

export function mountBuiltForIcons(section: HTMLElement): void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const icons = [...section.querySelectorAll<HTMLCanvasElement>('canvas.bf-icon')].flatMap((canvas) => {
    const figure = FIGURES[canvas.dataset.icon ?? '']
    const view = VIEW[canvas.dataset.icon ?? '']
    const paint = canvas.getContext('2d')
    const card = canvas.closest<HTMLElement>('.bf-card')
    if (!figure || !view || !paint || !card) return []
    return [{ canvas, paint, figure, view, card, seen: false, revealed: 0, time: hash(canvas.dataset.icon!.charCodeAt(0), 3) * 20, speed: 1, hover: false }]
  })
  if (!icons.length) return
  let frame = 0
  let last = 0

  const draw = (icon: (typeof icons)[number], now: number): void => {
    const { canvas, paint, view } = icon
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
    }
    const cellH = 10
    const cellW = cellH * 0.62
    const cols = Math.floor(w / cellW)
    const rows = Math.floor(h / cellH)
    const glow = new Float32Array(cols * rows)
    const accent = new Uint8Array(cols * rows)
    const size = Math.min(w, h) * 0.5 * view.scale
    const spin = view.spin(icon.time)
    const cs = Math.cos(spin)
    const sn = Math.sin(spin)
    const ct = Math.cos(view.tilt)
    const st = Math.sin(view.tilt)
    const brighten = icon.hover ? 0.18 : 0
    for (const p of icon.figure(icon.time)) {
      // Turn about the upright axis, then tilt towards the reader.
      const x = p.x * cs - p.z * sn
      const z0 = p.x * sn + p.z * cs
      const y = p.y * ct - z0 * st
      const z = p.y * st + z0 * ct
      const near = (z + 1.3) / 2.6
      const sx = w / 2 + x * size * (1 + z * 0.08)
      const sy = h / 2 + y * size * (1 + z * 0.08)
      const c = Math.floor(sx / cellW)
      const r = Math.floor(sy / cellH)
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue
      const i = r * cols + c
      const value = Math.min(1, p.glow * (0.35 + 0.65 * near) + brighten)
      if (value > glow[i]!) {
        glow[i] = value
        accent[i] = p.accent ? 1 : 0
      }
    }
    paint.setTransform(ratio, 0, 0, ratio, 0, 0)
    paint.clearRect(0, 0, w, h)
    paint.font = `600 ${cellH}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    paint.textAlign = 'center'
    paint.textBaseline = 'middle'
    // While a figure settles, its characters turn over at random before taking their place.
    const settle = still ? 1 : Math.min(1, icon.revealed / SETTLE_SECONDS)
    const tick = Math.floor(now / 50)
    const groups = new Map<string, number[]>()
    for (let i = 0; i < glow.length; i++) {
      const g = glow[i]!
      if (g < 0.08) continue
      let mark = RAMP[Math.min(RAMP.length - 1, Math.floor(g * RAMP.length))]!
      if (settle < 1 && hash(i, tick) > settle) mark = RAMP[Math.floor(hash(tick, i) * RAMP.length)]!
      const key = `${mark}|${accent[i]}|${Math.round(g * 5)}`
      const list = groups.get(key)
      if (list) list.push(i)
      else groups.set(key, [i])
    }
    for (const [key, cells] of groups) {
      const [mark, isAccent, level] = key.split('|') as [string, string, string]
      paint.fillStyle = `rgba(${isAccent === '1' ? ACCENT : ICE}, ${(0.3 + 0.7 * (Number(level) / 5)).toFixed(2)})`
      for (const i of cells) paint.fillText(mark, ((i % cols) + 0.5) * cellW, (Math.floor(i / cols) + 0.5) * cellH)
    }
  }

  const loop = (now: number): void => {
    frame = 0
    if (document.hidden) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    let any = false
    for (const icon of icons) {
      if (!icon.seen) continue
      any = true
      // The pointer turns the figure faster, easing in and out.
      icon.speed += ((icon.hover ? 2.6 : 1) - icon.speed) * 0.08
      icon.time += dt * icon.speed
      icon.revealed += dt
      draw(icon, now)
    }
    if (any) frame = requestAnimationFrame(loop)
    else last = 0
  }
  const start = (): void => {
    if (still) {
      for (const icon of icons) if (icon.seen) draw(icon, 0)
      return
    }
    if (!frame && !document.hidden) frame = requestAnimationFrame(loop)
  }

  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const icon = icons.find((i) => i.canvas === entry.target)
      if (icon) icon.seen = entry.isIntersecting
    }
    start()
  }, { threshold: 0.2 })
  for (const icon of icons) {
    seen.observe(icon.canvas)
    icon.card.addEventListener('pointerenter', () => { icon.hover = true })
    icon.card.addEventListener('pointerleave', () => { icon.hover = false })
  }
  document.addEventListener('visibilitychange', () => {
    last = 0
    if (document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
    } else start()
  })
  new ResizeObserver(() => { if (still) start() }).observe(section)
}
