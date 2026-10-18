/** The first Built for card's figure (builtForIcons.ts): the four agents the MCP guide sets up (Claude Code, Codex,
 * Cursor, OpenCode), each drawn in characters from its mark in a row along the bottom, and an octopus in the brand's
 * orange that goes from one to the next. It settles on an agent, wraps its arms round it and charges it: light runs down
 * its arms into the mark, which lights up in its own colours from the bottom up, flashes and sends out a ring. Then it lets go and
 * swims on, the charge fading out of the mark behind it.
 *
 * The arms are curves that hang, wave and trail behind the body as it swims, opening and closing with each push. When
 * the octopus holds on, each arm is blended, root first, into a path round the mark, and lets go tip first. The pointer
 * over an agent makes it the next stop and a click goes there at once; near the octopus, the eyes follow the pointer, and
 * a click on it makes it flinch and blink. With reduced motion the octopus holds Claude Code, half charged, and does not
 * move. */

export type Cells = {
  cols: number
  rows: number
  cellW: number
  cellH: number
  glow: Float32Array
  accent: Uint8Array
  stir: Float32Array
  /** Each cell's colour: 0 navy, 1 orange, 2 a deep orange, and from AGENT_TONE_BASE on the agents' own (AGENT_TONES). */
  /** A character a cell must show (an eye), in place of one picked from its glow. */
  marks: Array<string | undefined>
}

type P = { x: number; y: number }

/** An agent's mark, drawn in its own units (vw by vh) in one colour; alpha draws a lighter tone. */
type AgentMark = {
  name: string
  vw: number
  vh: number
  draw: (g: CanvasRenderingContext2D) => void
  /** Which of AGENT_TONES a cell of the mark takes, by where it is in the block (u, v from 0 to 1) and how much it covers. */
  tone: (u: number, v: number, cover: number) => number
}

/** The agents' own colours: Claude Code's terracotta; Codex's gradient, lilac to blue; Cursor's black; OpenCode's black
 * and the grey of its window. */
export const AGENT_TONES = ['217, 119, 87', '177, 167, 255', '122, 157, 255', '57, 65, 255', '20, 18, 11', '33, 30, 30', '150, 148, 145']
/** Where the agents' colours start among the cell tones builtForIcons.ts paints. */
export const AGENT_TONE_BASE = 3

export const AGENT_MARKS: ReadonlyArray<AgentMark> = [
  {
    // A creature of blocks: a body with arms out to the sides, two eyes and four legs.
    name: 'Claude Code', vw: 24, vh: 15,
    tone: () => 0,
    draw(g) {
      g.fillRect(3, 0, 18, 12.1)
      g.fillRect(0, 5.95, 24, 3.1)
      for (const x of [4.5, 7.5, 15, 18]) g.fillRect(x, 12, 1.5, 3)
      g.clearRect(6, 3.1, 1.5, 2.85)
      g.clearRect(16.5, 3.1, 1.5, 2.85)
    },
  },
  {
    // A rounded, lobed blob with a prompt, > and _, cut out of it.
    name: 'Codex', vw: 24, vh: 24,
    tone: (u, v) => 1 + Math.min(2, Math.floor(((u + v) / 2) * 3)),
    draw(g) {
      g.beginPath()
      g.arc(12, 12, 8.6, 0, Math.PI * 2)
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 - 0.3
        const x = 12 + Math.cos(a) * 6.4
        const y = 12 + Math.sin(a) * 6.4
        g.moveTo(x + 5.4, y)
        g.arc(x, y, 5.4, 0, Math.PI * 2)
      }
      g.fill()
      g.globalCompositeOperation = 'destination-out'
      g.lineWidth = 2.3
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath()
      g.moveTo(6.6, 8.7)
      g.lineTo(9, 12.05)
      g.lineTo(6.6, 15.4)
      g.moveTo(12.8, 15.4)
      g.lineTo(17.5, 15.4)
      g.stroke()
    },
  },
  {
    // A cube seen corner on: a hexagon with its top and left faces solid and its right face cut away to the rim.
    name: 'Cursor', vw: 21, vh: 24,
    tone: () => 4,
    draw(g) {
      g.translate(-1.5, 0)
      g.beginPath()
      for (const [x, y] of [[12, 0], [22.5, 6.06], [22.5, 17.94], [12, 24], [1.5, 17.94], [1.5, 6.06]] as const) g.lineTo(x, y)
      g.closePath()
      for (const [k, [x, y]] of ([[2.7, 6.34], [21.2, 6.34], [12.1, 22.8], [12, 12.3]] as const).entries()) {
        if (k === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.closePath()
      g.fill('evenodd')
    },
  },
  {
    // An upright frame whose window is filled, in a lighter tone, from the middle down.
    name: 'OpenCode', vw: 16, vh: 20,
    tone: (_u, _v, cover) => (cover > 0.2 && cover < 0.45 ? 6 : 5),
    draw(g) {
      g.fillRect(0, 0, 16, 20)
      g.clearRect(4, 4, 8, 12)
      g.globalAlpha = 0.32
      g.fillRect(4, 8, 8, 8)
    },
  },
]

const NAVY = '20, 37, 74'
/** Arms: three a side, outer to inner. Where each joins the body (in body radii), how far it spreads from straight down
 * and curls out at the tip (radians), and its length (in agent widths). */
const ROOT_X = [0.8, 0.5, 0.18]
const ROOT_Y = [0.48, 0.72, 0.86]
const SPREAD = [0.7, 0.4, 0.13]
const CURL = [1.3, 0.85, 0.4]
const LENGTH = [1.25, 1.3, 1.05]
const ARM_POINTS = 18
/** How far above a mark's top the perched body's centre sits, in body heights. */
const PERCH = 0.92
const SECONDS = { reach: 0.75, charge: 2.3, flash: 0.45, release: 0.55, gather: 0.3 }
type Phase = keyof typeof SECONDS | 'swim'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const smooth = (v: number): number => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** `n` points spaced evenly along a smooth (Catmull-Rom) path through `points`, from the first to the last. */
export function resample(points: ReadonlyArray<P>, n: number): P[] {
  if (points.length < 2) return Array.from({ length: n }, () => ({ ...(points[0] ?? { x: 0, y: 0 }) }))
  const dense: P[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(points.length - 1, i + 2)]!
    for (let k = 0; k < 8; k++) {
      const t = k / 8
      const along = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
      dense.push({ x: along(p0.x, p1.x, p2.x, p3.x), y: along(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  dense.push({ ...points[points.length - 1]! })
  const lengths = [0]
  for (let i = 1; i < dense.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y))
  const total = lengths[lengths.length - 1]!
  const out: P[] = []
  let j = 0
  for (let m = 0; m < n; m++) {
    const target = (total * m) / (n - 1)
    while (j < dense.length - 2 && lengths[j + 1]! < target) j++
    const span = lengths[j + 1]! - lengths[j]! || 1
    const f = clamp01((target - lengths[j]!) / span)
    out.push({ x: dense[j]!.x + (dense[j + 1]!.x - dense[j]!.x) * f, y: dense[j]!.y + (dense[j + 1]!.y - dense[j]!.y) * f })
  }
  return out
}

/** The next agent to visit: the one the reader picked, if it is not this one, or else the one after this. */
export function nextAgent(at: number, picked: number | null, count: number): number {
  return picked !== null && picked !== at ? picked : (at + 1) % count
}

/** How long the swim from one agent to another takes, by how far apart they are in px. */
export const swimSeconds = (distance: number): number => 0.85 + distance / 280

/** How much of each cell a mark covers, 0 to 1, fitted and centred in a block of cols by rows cells. */
function rasterise(mark: AgentMark, cols: number, rows: number, cellW: number, cellH: number): Float32Array {
  const cover = new Float32Array(cols * rows)
  const S = 4
  const canvas = document.createElement('canvas')
  canvas.width = cols * S
  canvas.height = rows * S
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) return cover
  g.scale(S / cellW, S / cellH)
  const k = Math.min((cols * cellW) / mark.vw, (rows * cellH) / mark.vh)
  g.translate((cols * cellW - mark.vw * k) / 2, (rows * cellH - mark.vh * k) / 2)
  g.scale(k, k)
  g.fillStyle = '#000'
  g.strokeStyle = '#000'
  mark.draw(g)
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) sum += data[((r * S + y) * canvas.width + c * S + x) * 4 + 3]!
      cover[r * cols + c] = sum / (S * S * 255)
    }
  }
  return cover
}

type Tile = {
  mark: AgentMark
  c0: number
  r0: number
  cols: number
  rows: number
  cover: Float32Array
  /** The mark's drawn bounds in px, its centre, the line its name sits on, and the box the pointer picks it in. */
  box: { x0: number; y0: number; x1: number; y1: number }
  cx: number
  labelY: number
  hit: { x0: number; y0: number; x1: number; y1: number }
}

export type AgentScene = {
  layout(w: number, h: number, cellW: number, cellH: number): void
  step(dt: number, pointer: P | null): void
  fill(cells: Cells): void
  labels(paint: CanvasRenderingContext2D): void
  press(x: number, y: number): void
}

export function agentScene(options: { still: boolean; ring: (x: number, y: number) => void }): AgentScene {
  let tiles: Tile[] = []
  let size = ''
  let width = 70
  let labelSize = 10
  let at = 0
  let next = 1
  let picked: number | null = null
  let hovered = -1
  let phase: Phase = options.still ? 'charge' : 'reach'
  let t = options.still ? 1.4 : 0
  let time = 0
  let body: P = { x: 0, y: 0 }
  let vel: P = { x: 0, y: 0 }
  /** The body's speed over the last frame, unsmoothed: what a turn mid-swim carries on from. */
  let motion: P = { x: 0, y: 0 }
  let look: P = { x: 0, y: 1 }
  let pointer: P | null = null
  let blink = 2.5
  let flinch = 0
  /** The swim: its path and how long it takes; the beat of its strokes and how far into them it starts (both carried
   * over when it turns mid-way, so the body keeps its rhythm), how strong they still are, and whether it glides in
   * already moving rather than starting from rest. */
  let swim = { from: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 0, y: 0 }, to: { x: 0, y: 0 }, seconds: 1, beat: 1, clock: 0, strength: 1, glide: false }
  const charged = AGENT_MARKS.map(() => 0)

  const rx = (): number => 0.4 * width
  const ry = (): number => 0.42 * width
  // Perched just above the mark, so the mark stays in sight under it.
  const perch = (n: number): P => ({ x: tiles[n]!.cx, y: tiles[n]!.box.y0 - ry() * PERCH })
  const inside = (p: P, b: Tile['hit']): boolean => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1
  /** How far the arms have closed round the agent (0 to 1), and how charged it is. */
  const hold = (): number => (phase === 'reach' ? t / SECONDS.reach : phase === 'charge' || phase === 'flash' ? 1 : phase === 'release' ? 1 - t / SECONDS.release : 0)
  const charge = (): number => (phase === 'charge' ? clamp01(t / SECONDS.charge) ** 1.6 : phase === 'flash' ? 1 : 0)
  /** The swim's push: 1 at each stroke, when the body stretches and the arms close. */
  const stroke = (): number => {
    if (phase !== 'swim') return 0
    const k = clamp01(t / swim.seconds)
    // Gone by the end, so the arms and body land where the swim left them.
    return Math.max(0, Math.sin(((swim.clock + t) / swim.beat) * Math.PI * 2.6)) * (1 - k) * swim.strength
  }

  /** Swim from `from` to the agent picked next: an arc over the agents in between, its top a little higher the further
   * it goes, kept inside the canvas. */
  const swimFrom = (from: P): void => {
    const to = perch(next)
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const peak = Math.max(ry() * 1.25 + 3, Math.min(from.y, to.y) - Math.min(0.9 * width, 18 + distance * 0.35))
    const cy = (peak - 0.25 * from.y) / 0.75
    const seconds = swimSeconds(distance)
    swim = {
      from, to, seconds, beat: seconds, clock: 0, strength: 1, glide: false,
      c1: { x: from.x + (to.x - from.x) * 0.15, y: cy },
      c2: { x: to.x - (to.x - from.x) * 0.15, y: cy },
    }
    ;[phase, t] = ['swim', 0]
  }

  /** Turn mid-swim towards the agent picked next, from where the body is and at the speed it is going (a path that
   * glides in: its first control point carries the velocity, its easing starts at speed), keeping the strokes' beat. */
  const turn = (): void => {
    const to = perch(next)
    const from = body
    const seconds = swimSeconds(Math.hypot(to.x - from.x, to.y - from.y))
    const strength = swim.strength * (1 - clamp01(t / swim.seconds))
    const clock = swim.clock + t
    const beat = swim.beat
    const lift = Math.min(from.y, to.y) - 0.6 * width
    swim = {
      from, to, seconds, beat, clock, strength, glide: true,
      // With easing 1 - (1 - x)², speed at the start is 2/seconds along the path: the first control point a sixth of the
      // way the velocity goes in `seconds` keeps it.
      c1: { x: from.x + (motion.x * seconds) / 6, y: from.y + (motion.y * seconds) / 6 },
      c2: { x: to.x, y: Math.max(ry() * 1.25 + 3, lift) },
    }
    t = 0
  }

  /** The body's stretch: squashing to push off, stretching with each stroke, landing, breathing, flinching. */
  const shape = (): { sx: number; sy: number } => {
    let sx = 1
    let sy = 1
    if (phase === 'gather') {
      const q = smooth(t / SECONDS.gather)
      sx += 0.1 * q
      sy -= 0.13 * q
    } else if (phase === 'swim') {
      const rest = clamp01(1 - ((swim.clock + t) / swim.beat) * 6)
      const p = stroke()
      sx += 0.1 * rest - 0.07 * p
      sy += -0.13 * rest + 0.15 * p
    } else if (phase === 'reach') {
      const q = Math.sin(clamp01(t / 0.4) * Math.PI) * 0.7
      sx += 0.07 * q
      sy -= 0.08 * q
    } else if (phase === 'charge') {
      const b = Math.sin(time * 10) * 0.03 * charge()
      sx += b
      sy -= b
    } else if (phase === 'flash') {
      const q = Math.sin(clamp01(t / SECONDS.flash) * Math.PI)
      sx += 0.07 * q
      sy += 0.07 * q
    }
    const breathe = Math.sin(time * 2.2) * 0.025
    return { sx: sx + breathe + 0.12 * flinch, sy: sy - breathe - 0.14 * flinch }
  }

  /** Each arm's points from root to tip: hanging and waving, or along its path round the agent as far as it holds. */
  const arms = (centre: P, sx: number, sy: number): P[][] => {
    const w = hold()
    const tile = tiles[at]!
    const { x0, y0, x1, y1 } = tile.box
    const W = x1 - x0
    const H = y1 - y0
    const p = stroke()
    const out: P[][] = []
    for (let k = 0; k < 6; k++) {
      const side = k < 3 ? -1 : 1
      const j = k % 3
      const root = { x: centre.x + side * ROOT_X[j]! * rx() * sx, y: centre.y + ROOT_Y[j]! * ry() * sy }
      // Hanging: spread from straight down, more as the body sinks and less as it rises or pushes, swung back
      // against the way it is going, curling out towards the tip and waving.
      const spread = SPREAD[j]! * (1 + Math.max(-0.5, Math.min(0.7, vel.y * 0.004))) * (1 - 0.45 * p)
      let a = Math.PI / 2 - side * spread + Math.max(-0.8, Math.min(0.8, vel.x * 0.006))
      const step = (width * LENGTH[j]! * (1 - 0.12 * flinch)) / (ARM_POINTS - 1)
      const free: P[] = [root]
      let q = root
      for (let i = 1; i < ARM_POINTS; i++) {
        const s = i / (ARM_POINTS - 1)
        a += (-side * CURL[j]! * (0.2 + 2.2 * s * s) + Math.sin(time * 2.3 + k * 1.7 - s * 5) * 0.9 * s) / (ARM_POINTS - 1)
        q = { x: q.x + Math.cos(a) * step, y: q.y + Math.sin(a) * step }
        free.push(q)
      }
      // Holding on: the outer arm goes down the agent's side and under it, the middle one down the near edge of its
      // face, the inner one rests on its top. Arms close outer first and let go inner first.
      const reach = clamp01(w * 1.45 - j * 0.15 - (side > 0 ? 0.06 : 0))
      if (reach <= 0) {
        out.push(free)
        continue
      }
      const X = (u: number): number => (side < 0 ? x0 + u * W : x1 - u * W)
      const squeeze = phase === 'charge' ? Math.sin(time * 9 + k) * 0.6 : 0
      const path = j === 0
        ? [root, { x: X(-0.07) - squeeze, y: y0 + 0.12 * H }, { x: X(-0.1) - squeeze, y: y0 + 0.6 * H }, { x: X(0.02), y: y1 + 0.03 * H }, { x: X(0.26), y: y1 + 0.04 * H }]
        : j === 1
          ? [root, { x: X(0.07), y: y0 + 0.05 * H }, { x: X(0.05) + squeeze, y: y0 + 0.45 * H }, { x: X(0.13), y: y0 + 0.82 * H }]
          : [root, { x: X(0.26), y: y0 - 0.02 * H }, { x: X(0.36), y: y0 + 0.1 * H }]
      const held = resample(path, ARM_POINTS)
      out.push(free.map((f, i) => {
        const b = smooth(reach * 1.6 - (i / (ARM_POINTS - 1)) * 0.6)
        return { x: f.x + (held[i]!.x - f.x) * b, y: f.y + (held[i]!.y - f.y) * b }
      }))
    }
    return out
  }

  return {
    layout(w, h, cellW, cellH) {
      const key = `${w}|${h}|${cellW}`
      if (key === size) return
      size = key
      const gap = Math.min(12, Math.max(5, w * 0.03))
      // Room either side for the outer arms of the agents at the ends.
      width = Math.min(80, (w - 3 * gap) / 4.7)
      labelSize = Math.min(10, Math.max(8, width / 7))
      const cols = Math.max(4, Math.floor(width / cellW))
      const rows = Math.max(3, Math.floor((width * 0.9) / cellH))
      const left = (w - (4 * cols * cellW + 3 * gap)) / 2
      // The perched octopus, the marks and their names, centred top to bottom; the swim arcs over them.
      const above = ry() * (PERCH + 1.08)
      const r0 = Math.max(0, Math.floor(((h - (above + rows * cellH + labelSize + 8)) / 2 + above) / cellH))
      tiles = AGENT_MARKS.map((mark, n) => {
        const c0 = Math.round((left + n * (cols * cellW + gap)) / cellW)
        const cover = rasterise(mark, cols, rows, cellW, cellH)
        let minC = cols
        let maxC = 0
        let minR = rows
        let maxR = 0
        cover.forEach((v, i) => {
          if (v < 0.2) return
          minC = Math.min(minC, i % cols)
          maxC = Math.max(maxC, i % cols)
          minR = Math.min(minR, Math.floor(i / cols))
          maxR = Math.max(maxR, Math.floor(i / cols))
        })
        if (minC > maxC) [minC, maxC, minR, maxR] = [0, cols - 1, 0, rows - 1]
        const box = { x0: (c0 + minC) * cellW, x1: (c0 + maxC + 1) * cellW, y0: (r0 + minR) * cellH, y1: (r0 + maxR + 1) * cellH }
        const labelY = (r0 + rows) * cellH + labelSize + 3
        return {
          mark, c0, r0, cols, rows, cover, box, cx: (box.x0 + box.x1) / 2, labelY,
          hit: { x0: c0 * cellW - gap / 2, x1: (c0 + cols) * cellW + gap / 2, y0: r0 * cellH - 6, y1: labelY + 4 },
        }
      })
      if (phase !== 'swim') body = perch(at)
    },

    step(dt, here) {
      if (!tiles.length) return
      pointer = here
      time += dt
      t += dt
      hovered = here ? tiles.findIndex((tile) => inside(here, tile.hit)) : -1
      if (hovered >= 0 && hovered !== at) picked = hovered
      for (let n = 0; n < charged.length; n++) charged[n] = Math.max(0, charged[n]! - dt * 0.3)
      blink -= dt
      if (blink < -0.14) blink = 2.5 + hash(time, 9) * 3
      flinch = Math.max(0, flinch - dt * 2.5)
      if (phase === 'reach' && t >= SECONDS.reach) [phase, t] = ['charge', 0]
      else if (phase === 'charge' && t >= SECONDS.charge) {
        ;[phase, t] = ['flash', 0]
        charged[at] = 1
        const { box } = tiles[at]!
        options.ring((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
      } else if (phase === 'flash' && t >= SECONDS.flash) [phase, t] = ['release', 0]
      else if (phase === 'release' && t >= SECONDS.release) {
        next = nextAgent(at, picked, tiles.length)
        picked = null
        ;[phase, t] = ['gather', 0]
      } else if (phase === 'gather' && t >= SECONDS.gather) {
        swimFrom(perch(at))
      } else if (phase === 'swim' && t >= swim.seconds) {
        at = next
        ;[phase, t] = ['reach', 0]
      }
      const before = body
      if (phase === 'swim') {
        const x = clamp01(t / swim.seconds)
        const k = swim.glide ? 1 - (1 - x) * (1 - x) : easeInOut(x)
        const u = 1 - k
        const { from, c1, c2, to } = swim
        body = {
          x: u * u * u * from.x + 3 * u * u * k * c1.x + 3 * u * k * k * c2.x + k * k * k * to.x,
          y: u * u * u * from.y + 3 * u * u * k * c1.y + 3 * u * k * k * c2.y + k * k * k * to.y,
        }
      } else body = { ...perch(at), y: perch(at).y + 2 * (width / 70) * smooth(hold()) }
      const ease = 1 - Math.exp(-dt * 8)
      if (dt > 0) {
        motion = { x: (body.x - before.x) / dt, y: (body.y - before.y) / dt }
        vel = { x: vel.x + (motion.x - vel.x) * ease, y: vel.y + (motion.y - vel.y) * ease }
      }
      // The eyes: on the pointer when it is near, else on where it is going, else down at the agent it holds.
      let aim: P = { x: 0, y: 1 }
      if (pointer && Math.hypot(pointer.x - body.x, pointer.y - body.y) < 120) aim = { x: pointer.x - body.x, y: pointer.y - body.y }
      else if (phase === 'gather' || phase === 'swim') aim = { x: perch(next).x - body.x, y: perch(next).y - body.y }
      const length = Math.hypot(aim.x, aim.y) || 1
      look = { x: look.x + (aim.x / length - look.x) * ease, y: look.y + (aim.y / length - look.y) * ease }
    },

    fill(cells) {
      if (!tiles.length) return
      const { cols, rows, cellW, cellH, glow, accent, stir, marks } = cells
      const set = (c: number, r: number, value: number, tone: number, mark?: string): void => {
        if (c < 0 || r < 0 || c >= cols || r >= rows) return
        const i = r * cols + c
        glow[i] = value
        accent[i] = tone
        marks[i] = mark
      }
      // The agents, the one being charged filling with orange from the bottom, the line of the fill flickering; the
      // charge of the ones it left going out a character at a time.
      const level = charge()
      for (const [n, tile] of tiles.entries()) {
        const live = n === at && (phase === 'charge' || phase === 'flash')
        const fillY = tile.box.y1 - (live ? level : 0) * (tile.box.y1 - tile.box.y0)
        for (let r = 0; r < tile.rows; r++) {
          for (let c = 0; c < tile.cols; c++) {
            const cover = tile.cover[r * tile.cols + c]!
            if (cover < 0.06) continue
            const gc = tile.c0 + c
            const gr = tile.r0 + r
            const y = (gr + 0.5) * cellH
            // In the agent's own colours, at rest in three light tones so the mark reads as a shape (solid, edge, faint);
            // charged, full and dense.
            const tone = AGENT_TONE_BASE + tile.mark.tone((c + 0.5) / tile.cols, (r + 0.5) / tile.rows, cover)
            let value = (cover >= 0.55 ? 0.56 : cover >= 0.25 ? 0.36 : 0.2) + (n === hovered ? 0.14 : 0)
            if (live && y > fillY) {
              value = phase === 'flash'
                ? Math.min(1, 0.7 + 0.3 * cover + 0.2 * Math.sin(clamp01(t / SECONDS.flash) * Math.PI))
                : 0.6 + 0.4 * cover + 0.05 * Math.sin(time * 18 + gc * 1.3 + gr)
            } else if (charged[n]! > 0 && hash(gr * cols + gc, Math.floor(time * 8)) < charged[n]!) value += 0.3 * charged[n]!
            // The line of the fill: bright orange, turning over.
            set(gc, gr, value, live && phase === 'charge' && Math.abs(y - fillY) < cellH * 0.75 ? 1 : tone)
            if (live && phase === 'charge' && Math.abs(y - fillY) < cellH && gr < rows && gc < cols) stir[gr * cols + gc] = 0.9
          }
        }
      }
      const { sx, sy } = shape()
      const centre = { x: body.x, y: body.y + ry() * (1 - sy) * 0.6 }
      // The arms, thick at the root and thin at the tip; while charging, light runs down each from the body.
      const scale = width / 70
      const limbs = arms(centre, sx, sy)
      for (const arm of limbs) {
        for (let i = 0; i < arm.length - 1; i++) {
          const a = arm[i]!
          const b = arm[i + 1]!
          const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5))
          for (let k = 0; k < steps; k++) {
            const f = k / steps
            const s = (i + f) / (arm.length - 1)
            // An arm that would reach past the side of the canvas lies along it instead.
            const x = Math.min(cols * cellW - 3, Math.max(3, a.x + (b.x - a.x) * f))
            const y = a.y + (b.y - a.y) * f
            const radius = Math.max(0.7, (1 - 0.75 * s) * 4.4 * scale)
            const value = 0.7 - 0.3 * s
            set(Math.floor(x / cellW), Math.floor(y / cellH), value, 1)
            for (let r = Math.floor((y - radius) / cellH); r <= Math.floor((y + radius) / cellH); r++) {
              for (let c = Math.floor((x - radius) / cellW); c <= Math.floor((x + radius) / cellW); c++) {
                if (Math.hypot((c + 0.5) * cellW - x, (r + 0.5) * cellH - y) <= radius) set(c, r, value, 1)
              }
            }
          }
        }
      }
      if (phase === 'charge') {
        for (const [k, arm] of limbs.entries()) {
          for (const m of [0, 0.5]) {
            const p = arm[Math.floor(((time * 1.3 + k * 0.19 + m) % 1) * (arm.length - 1))]!
            set(Math.floor(p.x / cellW), Math.floor(p.y / cellH), 1, 1, '@')
          }
        }
      }
      // The body: a dome, fuller at the top, its rim darker and a highlight up on the left; brighter while charging.
      const rxs = rx() * sx
      const top = ry() * 1.08 * sy
      const bottom = ry() * 0.86 * sy
      for (let r = Math.floor((centre.y - top) / cellH); r <= Math.floor((centre.y + bottom) / cellH); r++) {
        for (let c = Math.floor((centre.x - rxs) / cellW); c <= Math.floor((centre.x + rxs) / cellW); c++) {
          const dx = ((c + 0.5) * cellW - centre.x) / rxs
          const y = (r + 0.5) * cellH - centre.y
          const dy = y / (y < 0 ? top : bottom)
          const d2 = dx * dx + dy * dy
          if (d2 > 1) continue
          let value = d2 > 0.62 ? 0.78 : 0.6
          if ((dx + 0.35) ** 2 + (dy + 0.45) ** 2 < 0.06) value = 0.42
          value = Math.min(1, value + 0.12 * level + (level > 0 ? 0.06 * Math.sin(time * 12) : 0))
          set(c, r, value, 1)
        }
      }
      // The eyes: white, a navy pupil looking where the octopus looks, a line when it blinks.
      const radius = Math.max(cellW * 1.05, 0.2 * rx())
      const shut = blink < 0 || flinch > 0.5
      for (const side of [-1, 1]) {
        const ex = centre.x + side * 0.42 * rxs
        const ey = centre.y + 0.2 * ry() * sy
        for (let r = Math.floor((ey - radius) / cellH); r <= Math.floor((ey + radius) / cellH); r++) {
          for (let c = Math.floor((ex - radius) / cellW); c <= Math.floor((ex + radius) / cellW); c++) {
            if (Math.hypot((c + 0.5) * cellW - ex, (r + 0.5) * cellH - ey) <= radius) set(c, r, 0, 0)
          }
        }
        if (shut) {
          for (let c = Math.floor((ex - radius) / cellW); c <= Math.floor((ex + radius) / cellW); c++) set(c, Math.floor(ey / cellH), 0.9, 0, '-')
        } else set(Math.floor((ex + look.x * radius * 0.55) / cellW), Math.floor((ey + look.y * radius * 0.45) / cellH), 1, 0, '@')
      }
    },

    labels(paint) {
      paint.font = `500 ${labelSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      paint.textAlign = 'center'
      paint.textBaseline = 'alphabetic'
      for (const [n, tile] of tiles.entries()) {
        const held = n === at && phase !== 'gather' && phase !== 'swim'
        const own = AGENT_TONES[tile.mark.tone(0.9, 0.9, 1)]!
        paint.fillStyle = held ? `rgb(${own})` : n === hovered ? `rgb(${NAVY})` : `rgba(${NAVY}, 0.62)`
        paint.fillText(tile.mark.name, tile.cx, tile.labelY)
      }
    },

    press(x, y) {
      const n = tiles.findIndex((tile) => inside({ x, y }, tile.hit))
      if (n >= 0) {
        if (n === at && phase !== 'gather' && phase !== 'swim') return
        // Let go now, from however far it holds, and go; already on the way, turn there from where it is.
        if (phase === 'gather' || phase === 'swim') {
          next = n
          picked = null
          if (phase === 'swim') turn()
        } else {
          picked = n
          if (phase !== 'release') [phase, t] = ['release', (1 - hold()) * SECONDS.release]
        }
        return
      }
      const dx = (x - body.x) / rx()
      const dy = (y - body.y) / ry()
      if (dx * dx + dy * dy < 1.2) flinch = 1
    },
  }
}

