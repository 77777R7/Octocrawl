/** The Built for cards' figures (scrapePage.ts builtFor), drawn as characters on a grid: each cell's glow picks its
 * character from a ramp (fainter marks for less, denser ones for more) and its colour is the page's navy or the brand's
 * orange.
 *
 * - agents: the agents Octocrawl connects to, and an octopus that charges each in turn (agentOctopus.ts), on a finer grid;
 *
 * The other two are small 3D shapes made of points, turning slowly; each point lands in a cell, and the nearest,
 * best-lit point in a cell sets its glow (fainter for the far side), orange for the figure's moving part.
 *
 * - stack (pipelines): three discs, one above another, with drops falling from each to the next;
 * - radar (monitoring): a tilted dish with rings, rim ticks and a sweep with a fading wake; the pages it watches are blips
 *   that glint as it passes, or, when one changed, flare orange, ring and send the change up off the dish.
 *
 * A figure scrambles its characters and settles when its card first comes into view; the pointer over a card turns a
 * shape faster and brightens it. Over a shape itself the pointer pushes the characters near it out of its way, lights them
 * and turns them over, and the figure turns to face it; a click or tap sends a ring of orange characters out from where
 * it landed, pushing what it crosses, and kicks the figure into a faster turn that winds down. It draws only while on
 * screen and the tab is visible; with reduced motion each draws one still frame and does not answer the pointer. */

import { AGENT_TONES, agentScene, type AgentScene } from './agentOctopus'

type Point = { x: number; y: number; z: number; glow: number; accent: boolean }
type Figure = (t: number) => Point[]

const RAMP = '·:-=+xX#%@'
const ICE = '20, 37, 74'
const ACCENT = '243, 104, 61'
/** A deep orange, for a charged mark (agentOctopus.ts). */
const DEEP = '184, 70, 29'
/** The colours a cell's tone (its accent) picks: navy, orange, deep orange, then the agents' own. */
const TONES = [ICE, ACCENT, DEEP, ...AGENT_TONES]
const SETTLE_SECONDS = 0.9
/** How far from the pointer, in px, characters are pushed and stirred, and how far the nearest are pushed. */
const REACH = 64
const PUSH = 24
/** A click's ring: how fast it spreads (px a second), how long it lasts, and how much faster it turns the figure. */
const PULSE_SPEED = 300
const PULSE_SECONDS = 0.8
const KICK = 4

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
    const TAU = Math.PI * 2
    const turn = t * 1.1
    const sweep = turn % TAU
    /** How long ago, in radians of the sweep, it passed angle a. */
    const since = (a: number): number => (sweep - a + TAU * 2) % TAU
    const lit = (a: number): number => Math.exp(-since(a) / 0.9)
    // The dish: rings, a sparse fill, and ticks round the rim, longer every quarter, lit as the sweep goes by.
    for (const r of [0.34, 0.67, 1]) {
      for (const [x, y, z] of circle(r, 0, Math.round(80 * r) + 8)) points.push({ x, y, z, glow: 0.4 + 0.6 * lit(Math.atan2(z, x)), accent: false })
    }
    for (let i = 0; i < 240; i++) {
      const r = Math.sqrt(hash(i, 1))
      const a = hash(i, 2) * TAU
      points.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, glow: 0.12 + 0.75 * lit(a), accent: false })
    }
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU
      const long = k % 12 === 0
      for (let s = 0; s <= (long ? 3 : 1); s++) {
        const r = 1.04 + s * 0.035
        points.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, glow: 0.3 + 0.7 * lit(a), accent: false })
      }
    }
    // The sweep: an orange leading edge and a fading wake of lines behind it.
    for (let k = 0; k < 7; k++) {
      const a = sweep - k * 0.07
      for (let i = 1; i <= 26; i++) {
        const r = i / 26
        points.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, glow: k === 0 ? 1 : 0.75 * Math.exp(-k / 2.2), accent: k === 0 })
      }
    }
    // The core, breathing.
    for (const [x, y, z] of ball(0, 0, 0, 0.07 + 0.02 * Math.sin(t * 3), 10)) points.push({ x, y, z, glow: 0.9, accent: false })
    // The pages being watched: blips drifting slowly over the dish. Each pass of the sweep reads them again; a blip that
    // changed since its last read flares orange, a ring spreads round it and its change rises from it to the webhook;
    // one that did not just glints.
    for (let i = 0; i < 7; i++) {
      const a = hash(i, 11) * TAU + Math.sin(t * 0.2 + i) * 0.12
      const r = 0.25 + 0.68 * hash(i, 12) + Math.sin(t * 0.3 + i * 2) * 0.03
      const bx = Math.cos(a) * r
      const bz = Math.sin(a) * r
      const ago = since(a) / 1.1
      const pass = Math.floor((turn - a) / TAU)
      const changed = hash(i, pass) < 0.55
      const k = Math.exp(-ago / (changed ? 1.1 : 0.5))
      for (const [x, y, z] of ball(bx, 0, bz, 0.035 + 0.05 * k, 6)) points.push({ x, y, z, glow: 0.45 + 0.55 * k, accent: changed && k > 0.15 })
      if (!changed || ago > 1.6) continue
      const ring = 0.05 + ago * 0.2
      for (const [x, y, z] of circle(ring, 0, 22)) points.push({ x: bx + x, y, z: bz + z, glow: 1 - ago / 1.6, accent: true })
      // The change going out: a short stream of points rising off the dish, its head brightest.
      const head = Math.min(0.75, ago * 0.9)
      for (let s = 0; s < 9; s++) {
        const y = head - s * 0.05
        if (y < 0) break
        points.push({ x: bx, y: -y, z: bz, glow: Math.min(1, 1.2 * (1 - s / 9) * (1 - ago / 1.6)), accent: true })
      }
    }
    return points
  },
}

/** How each figure is turned to face the reader: a tilt towards them, and a slow turn about its upright axis. */
const VIEW: Record<string, { tilt: number; spin: (t: number) => number; scale: number }> = {
  stack: { tilt: 0.42, spin: (t) => t * 0.3, scale: 0.74 },
  radar: { tilt: 0.92, spin: (t) => Math.sin(t * 0.25) * 0.35, scale: 0.86 },
}

export function mountBuiltForIcons(section: HTMLElement): void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const icons = [...section.querySelectorAll<HTMLCanvasElement>('canvas.bf-icon')].flatMap((canvas) => {
    const kind = canvas.dataset.icon ?? ''
    const figure = kind in FIGURES ? FIGURES[kind]! : null
    const view = kind in VIEW ? VIEW[kind]! : null
    const paint = canvas.getContext('2d')
    const card = canvas.closest<HTMLElement>('.bf-card')
    if (!(figure && view) && kind !== 'agents') return []
    if (!paint || !card) return []
    return [{
      canvas, paint, figure, view, card, seen: false, revealed: 0, time: hash(kind.charCodeAt(0), 3) * 20, speed: 1, hover: false,
      scene: null as AgentScene | null,
      // The pointer over the canvas in client coordinates (null when it is elsewhere); where that is on the canvas, kept
      // after it leaves so its push fades where it was; how fully it is there (0 to 1), and the figure's turn to face it.
      pointer: null as { x: number; y: number } | null, px: 0, py: 0, over: 0, lookX: 0, lookY: 0,
      kick: 0, pulses: [] as Array<{ x: number; y: number; age: number; seed: number }>,
    }]
  })
  if (!icons.length) return
  const ring = (icon: (typeof icons)[number], x: number, y: number, seed: number): void => {
    icon.pulses = [...icon.pulses.slice(-2), { x, y, age: 0, seed }]
  }
  for (const icon of icons) {
    if (icon.canvas.dataset.icon === 'agents') icon.scene = agentScene({ still, ring: (x, y) => ring(icon, x, y, icon.time) })
  }
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
    // The agents' marks need a finer grid to read.
    const cellH = icon.scene ? 6 : 10
    const cellW = cellH * 0.62
    const cols = Math.floor(w / cellW)
    const rows = Math.floor(h / cellH)
    const glow = new Float32Array(cols * rows)
    const accent = new Uint8Array(cols * rows)
    const stir = new Float32Array(cols * rows)
    const marks: Array<string | undefined> = new Array(cols * rows)
    if (icon.scene) {
      icon.scene.layout(w, h, cellW, cellH)
      icon.scene.fill({ cols, rows, cellW, cellH, glow, accent, stir, marks })
    } else if (icon.figure && view) drawShape(icon, w, h, cols, rows, cellW, cellH, glow, accent, stir)
    drawRings(icon, cols, cellW, cellH, glow, accent, stir)
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
      let mark = marks[i] ?? RAMP[Math.min(RAMP.length - 1, Math.floor(g * RAMP.length))]!
      if (settle < 1 && hash(i, tick) > settle) mark = RAMP[Math.floor(hash(tick, i) * RAMP.length)]!
      // Stirred characters turn over among the dense ones.
      else if (!marks[i] && stir[i]! > 0.12 && hash(i, tick + 0.5) < stir[i]!) mark = RAMP[4 + Math.floor(hash(tick, i + 0.5) * 6)]!
      const key = `${mark}|${accent[i]}|${Math.round(g * 5)}`
      const list = groups.get(key)
      if (list) list.push(i)
      else groups.set(key, [i])
    }
    for (const [key, cells] of groups) {
      const [mark, isAccent, level] = key.split('|') as [string, string, string]
      paint.fillStyle = `rgba(${TONES[Number(isAccent)] ?? ICE}, ${(0.3 + 0.7 * (Number(level) / 5)).toFixed(2)})`
      for (const i of cells) paint.fillText(mark, ((i % cols) + 0.5) * cellW, (Math.floor(i / cols) + 0.5) * cellH)
    }
    icon.scene?.labels(paint)
  }

  /** A turning shape: its points turned and tilted, pushed by the pointer and by a click's rings, into the cells. */
  const drawShape = (
    icon: (typeof icons)[number], w: number, h: number, cols: number, rows: number, cellW: number, cellH: number,
    glow: Float32Array, accent: Uint8Array, stir: Float32Array,
  ): void => {
    const view = icon.view!
    const size = Math.min(w, h) * 0.5 * view.scale
    // Facing the pointer: its side of the figure comes round and towards it.
    const spin = view.spin(icon.time) - icon.lookX
    const tilt = view.tilt - icon.lookY
    const cs = Math.cos(spin)
    const sn = Math.sin(spin)
    const ct = Math.cos(tilt)
    const st = Math.sin(tilt)
    const brighten = icon.hover ? 0.08 : 0
    for (const p of icon.figure!(icon.time)) {
      // Turn about the upright axis, then tilt towards the reader.
      const x = p.x * cs - p.z * sn
      const z0 = p.x * sn + p.z * cs
      const y = p.y * ct - z0 * st
      const z = p.y * st + z0 * ct
      const near = (z + 1.3) / 2.6
      let sx = w / 2 + x * size * (1 + z * 0.08)
      let sy = h / 2 + y * size * (1 + z * 0.08)
      // The pointer pushes the characters near it out of its way, the nearest furthest, and stirs them.
      let stirred = 0
      if (icon.over > 0.01) {
        const dx = sx - icon.px
        const dy = sy - icon.py
        const d = Math.hypot(dx, dy) || 1
        if (d < REACH) {
          const f = (1 - d / REACH) * icon.over
          sx += (dx / d) * f * f * PUSH
          sy += (dy / d) * f * f * PUSH
          stirred = f
        }
      }
      // A click's ring pushes outwards what it is crossing and turns it orange.
      let ringed = 0
      for (const pulse of icon.pulses) {
        const dx = sx - pulse.x
        const dy = sy - pulse.y
        const d = Math.hypot(dx, dy) || 1
        const k = Math.max(0, 1 - Math.abs(d - pulse.age * PULSE_SPEED) / 22) * (1 - pulse.age / PULSE_SECONDS)
        if (k > 0) {
          sx += (dx / d) * k * 12
          sy += (dy / d) * k * 12
          stirred = Math.max(stirred, k)
          ringed = Math.max(ringed, k)
        }
      }
      const c = Math.floor(sx / cellW)
      const r = Math.floor(sy / cellH)
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue
      const i = r * cols + c
      const value = Math.min(1, p.glow * (0.35 + 0.65 * near) + brighten + stirred * 0.5)
      if (value > glow[i]!) {
        glow[i] = value
        accent[i] = p.accent || ringed > 0.55 ? 1 : 0
      }
      if (ringed > 0.55) accent[i] = 1
      if (stirred > stir[i]!) stir[i] = stirred
    }
    // A faint dotted circle round the pointer, so it shows where its reach is over the empty canvas too.
    if (icon.over > 0.01) {
      for (let i = 0; i < glow.length; i++) {
        const d = Math.hypot(((i % cols) + 0.5) * cellW - icon.px, (Math.floor(i / cols) + 0.5) * cellH - icon.py)
        const k = 1 - Math.abs(d - REACH * 0.8) / (cellH * 0.6)
        if (k <= 0 || hash(i, 7) > 0.6) continue
        const value = 0.16 * icon.over
        if (value > glow[i]!) glow[i] = value
      }
    }
  }

  /** A click's rings themselves: orange characters, a few missing, across the empty canvas as well as the figure. */
  const drawRings = (
    icon: (typeof icons)[number], cols: number, cellW: number, cellH: number, glow: Float32Array, accent: Uint8Array, stir: Float32Array,
  ): void => {
    for (const pulse of icon.pulses) {
      const radius = pulse.age * PULSE_SPEED
      const fade = 1 - pulse.age / PULSE_SECONDS
      for (let i = 0; i < glow.length; i++) {
        const d = Math.hypot(((i % cols) + 0.5) * cellW - pulse.x, (Math.floor(i / cols) + 0.5) * cellH - pulse.y)
        const k = 1 - Math.abs(d - radius) / cellH
        if (k <= 0 || hash(i, pulse.seed) > 0.75) continue
        const value = k * fade * 0.85
        if (value > glow[i]!) glow[i] = value
        if (value > 0.25) accent[i] = 1
        if (value > stir[i]!) stir[i] = value
      }
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
      // The pointer turns the figure faster, easing in and out; a click's kick winds down.
      icon.speed += ((icon.hover ? 2.6 : 1) - icon.speed) * 0.08
      icon.kick *= Math.exp(-dt * 1.5)
      icon.time += dt * (icon.speed + icon.kick)
      // A card still coming into place (builtForReveal.ts) holds its figure back until it lands.
      icon.revealed = icon.card.classList.contains('is-moving') ? 0 : icon.revealed + dt
      // Where the pointer is on the canvas (it moves with the page under a still pointer), and the turn towards it.
      const ease = 1 - Math.exp(-dt * 6)
      let lookX = 0
      let lookY = 0
      if (icon.pointer) {
        const box = icon.canvas.getBoundingClientRect()
        icon.px = icon.pointer.x - box.left
        icon.py = icon.pointer.y - box.top
        lookX = (icon.px / box.width - 0.5) * 1.1
        lookY = (icon.py / box.height - 0.5) * 0.6
      }
      icon.over += ((icon.pointer ? 1 : 0) - icon.over) * ease
      icon.lookX += (lookX - icon.lookX) * ease
      icon.lookY += (lookY - icon.lookY) * ease
      for (const pulse of icon.pulses) pulse.age += dt
      icon.pulses = icon.pulses.filter((pulse) => pulse.age < PULSE_SECONDS)
      icon.scene?.step(dt, icon.pointer ? { x: icon.px, y: icon.py } : null)
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
    if (still) continue
    icon.canvas.addEventListener('pointermove', (event) => { icon.pointer = { x: event.clientX, y: event.clientY } })
    icon.canvas.addEventListener('pointerleave', () => { icon.pointer = null })
    icon.canvas.addEventListener('pointerdown', (event) => {
      const box = icon.canvas.getBoundingClientRect()
      ring(icon, event.clientX - box.left, event.clientY - box.top, event.timeStamp)
      icon.scene?.press(event.clientX - box.left, event.clientY - box.top)
      icon.kick = Math.min(8, icon.kick + KICK)
    })
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
