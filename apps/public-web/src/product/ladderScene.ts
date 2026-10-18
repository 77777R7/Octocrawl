/** How it reads a page (scrapePage.ts ladder): one page climbing the mountain in the painting, a ledge at a time, as the
 * reader reads down the steps beside it. Four ledges drawn in characters along the lit ridge stand for the four steps
 * (HTTP, a browser, installed Chrome, your own Chrome); an octopus sits on the summit.
 *
 * Where the reader is in the list of steps (the step at the middle of the window) sets where the page is. An orange box
 * drops onto the first ledge as the list comes up. Reading on, a word over it says why this page needs more ("drawn by
 * script"), it crouches and jumps to the next ledge, flipping once in the air; and so on to the summit, where the octopus
 * reaches out and takes it. Scrolling back runs it backwards. The step the box is on is marked in the list. The ledges,
 * the box and the octopus are drawn over the painting, which is the card's own background; the canvas finds where the
 * painting lies from the card's background size and position, so the ledges stay on the ridge at every width.
 *
 * It draws only while on screen and the tab is visible. With reduced motion it is not mounted: the painting and the
 * steps stay as they are. */

/** The painting's size, and where on it (its own pixels) each ledge's top centre and the summit are. */
const PAINTING = { w: 1672, h: 941 }
const LEDGES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 835, y: 698 },
  { x: 965, y: 636 },
  { x: 1212, y: 592 },
  { x: 1352, y: 516 },
]
const SUMMIT = { x: 1478, y: 462 }
/** Where in the climb (0 to 1) each part happens: the drop, then for each ledge a stay and a jump on. */
const DROP = 0.05
const STAY = 0.13
const JUMP = 0.07
/** The stage holds still for this many window heights beyond its own (wide screens). */
const TRACK = 1.8
/** The octopus's crown, in gold over its head, jewels in white. */
const CROWN = [String.raw`.^.^.^.`, String.raw`|_*_*_|`]
/** Its arms: three a side, outer to inner. Where each joins the body (in body radii), how far it spreads from straight
 * down and curls out at the tip (radians), and its length (in body widths). The same octopus as the Built for card's
 * (agentOctopus.ts), sitting. */
const ROOT_X = [0.8, 0.5, 0.18]
const ROOT_Y = [0.48, 0.72, 0.86]
const SPREAD = [0.7, 0.4, 0.13]
const CURL = [1.3, 0.85, 0.4]
const LENGTH = [1.05, 1.1, 0.9]
/** What a page looks like before it is read: characters that never settle; read, it becomes lines of Markdown. */
const GARBLE = '#%&$@?!*~^'
const RAMP = '·:-=+xX#%@'
const TONES = ['190, 220, 255', '255, 160, 112', '255, 255, 255', '255, 206, 102']
const TAU = Math.PI * 2

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Where the climb is at position `at`: the ledge the box is on or leaving, and how far through that stay or
 * jump. Ledge index LEDGES.length is the summit. */
export function climbAt(at: number): { phase: 'drop' | 'stay' | 'jump'; ledge: number; k: number } {
  if (at < DROP) return { phase: 'drop', ledge: 0, k: at / DROP }
  let t = at - DROP
  for (let i = 0; i <= LEDGES.length; i++) {
    if (t < STAY || i === LEDGES.length) return { phase: 'stay', ledge: i, k: clamp01(t / STAY) }
    t -= STAY
    if (t < JUMP) return { phase: 'jump', ledge: i, k: t / JUMP }
    t -= JUMP
  }
  return { phase: 'stay', ledge: LEDGES.length, k: 1 }
}

export function mountLadder(section: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const frame = section.querySelector<HTMLElement>('.ld-art')
  const canvas = section.querySelector<HTMLCanvasElement>('.ld-canvas')
  const steps = [...section.querySelectorAll<HTMLElement>('.ld-step')]
  const tag = section.querySelector<HTMLElement>('.ld-tag')
  const paint = canvas?.getContext('2d')
  if (!frame || !canvas || !paint || steps.length !== LEDGES.length) return
  const names = steps.map((step) => step.querySelector('h3')?.lastChild?.textContent?.trim() ?? '')

  // Wide screens: the section is a stage that holds still while the page scrolls through its track, and how far
  // through the track the reader is sets the climb. Narrow screens read the steps as they scroll by instead.
  const wide = window.matchMedia('(min-width: 1001px)')
  const grid = section.querySelector<HTMLElement>('.ld-grid')!
  const band = grid.parentElement!
  const track = document.createElement('div')
  track.className = 'ld-track'
  const stage = document.createElement('div')
  stage.className = 'ld-stage'
  band.replaceWith(track)
  stage.append(band)
  track.append(stage)
  const measure = (): void => {
    section.classList.toggle('is-staged', wide.matches)
    section.style.setProperty('--ld-track', `${Math.round(window.innerHeight * (1 + TRACK))}px`)
  }
  const staged = (): number => {
    const box = track.getBoundingClientRect()
    return clamp01(-box.top / Math.max(1, box.height - window.innerHeight))
  }

  /** Where the climb should be: the middle of the window read against the steps' middles. Each step's middle is the
   * middle of the box's stay on its ledge; between two, the box is on its way; before the first, it drops in; past the
   * last, it goes on to the summit. */
  const progress = (): number => {
    if (wide.matches) return staged()
    const line = window.innerHeight * 0.5
    const mids = steps.map((step) => {
      const box = step.getBoundingClientRect()
      return box.top + box.height / 2
    })
    const stops = mids.map((_, i) => DROP + i * (STAY + JUMP) + STAY / 2)
    const lead = 260
    if (line <= mids[0]!) return clamp01(1 - (mids[0]! - line) / lead) * stops[0]!
    for (let i = 0; i < mids.length - 1; i++) {
      if (line <= mids[i + 1]!) return stops[i]! + ((line - mids[i]!) / Math.max(1, mids[i + 1]! - mids[i]!)) * (stops[i + 1]! - stops[i]!)
    }
    return stops[stops.length - 1]! + clamp01((line - mids[mids.length - 1]!) / lead) * (1 - stops[stops.length - 1]!)
  }

  /** Where the painting lies in the frame, from its background size (cover, or auto and a height) and position. */
  const painting = (w: number, h: number): { s: number; x: number; y: number } => {
    const style = getComputedStyle(frame)
    const size = style.backgroundSize.split(' ')
    let s = Math.max(w / PAINTING.w, h / PAINTING.h)
    if (size[1]?.endsWith('%')) s = (h * parseFloat(size[1])) / 100 / PAINTING.h
    const [px, py] = style.backgroundPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5))
    return { s, x: (w - PAINTING.w * s) * (px ?? 0.5), y: (h - PAINTING.h * s) * (py ?? 0.5) }
  }

  let shown = ''
  /** The ledge the box last landed on and when, for the landing's own short animation. */
  let landedOn = -1
  let landedAt = -10
  let time = 0
  let at = 0
  const draw = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
    }
    const fit = painting(w, h)
    const place = (p: { x: number; y: number }): { x: number; y: number } => ({ x: fit.x + p.x * fit.s, y: fit.y + p.y * fit.s })
    const spots = [...LEDGES, SUMMIT].map(place)
    // Characters a size up from the painting's own grain, so what moves stands out from it.
    const cellH = Math.max(10, Math.min(13, Math.round(w / 48)))
    const cellW = cellH * 0.62
    const cols = Math.floor(w / cellW)
    const rows = Math.floor(h / cellH)
    const glow = new Float32Array(cols * rows)
    const tone = new Uint8Array(cols * rows)
    const marks: Array<string | undefined> = new Array(cols * rows)
    const put = (x: number, y: number, value: number, colour: number, mark?: string): void => {
      const c = Math.floor(x / cellW)
      const r = Math.floor(y / cellH)
      if (c < 0 || r < 0 || c >= cols || r >= rows) return
      const i = r * cols + c
      if (value < glow[i]! && !mark) return
      glow[i] = value
      tone[i] = colour
      marks[i] = mark
    }

    const climb = climbAt(at)
    const unit = cellH * 3.4
    // The route: faint dotted arcs from each ledge to the next, and to the summit.
    for (let i = 0; i < spots.length - 1; i++) {
      const a = spots[i]!
      const b = spots[i + 1]!
      const lift = Math.max(unit * 2.2, (a.y - b.y) + unit * 1.4)
      for (let k = 1; k < 18; k++) {
        const t = k / 18
        put(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - lift * 4 * t * (1 - t) - unit * 0.5, 0.22, 0, '·')
      }
    }
    // The ledges: small stone slabs on the ridge, a bright top, a textured face and a rough underside narrowing to a
    // point; the one the box is on is orange. A landing sinks the slab, flashes its top and springs it back.
    const on = climb.phase === 'jump' && climb.k > 0.55 ? climb.ledge + 1 : climb.ledge
    if (climb.phase === 'stay' && climb.ledge < LEDGES.length && climb.ledge !== landedOn) {
      landedOn = climb.ledge
      landedAt = time
    } else if (climb.phase === 'drop') landedOn = -1
    const since = time - landedAt
    const impact = landedOn >= 0 && since < 0.6 ? since / 0.6 : 1
    LEDGES.forEach((_, i) => {
      const p = spots[i]!
      const here = i === on && climb.phase !== 'drop'
      const hit = here && i === landedOn && impact < 1
      const half = unit * 1.2
      // Sink and spring back: a damped bounce over the impact's first half.
      const dip = hit ? Math.exp(-impact * 7) * Math.cos(impact * 22) * cellH * 0.55 : 0
      const flash = hit && impact < 0.18
      const colour = here ? 1 : 0
      const y = p.y + dip
      for (let x = p.x - half; x <= p.x + half; x += cellW * 0.5) {
        const edge = x < p.x - half + cellW * 0.6 || x > p.x + half - cellW * 0.6
        put(x, y, flash ? 1 : here ? 1 : 0.92, flash ? 2 : here ? 1 : 2, edge ? (x < p.x ? '/' : '\\') : '=')
        put(x, y + cellH, here ? 0.62 : 0.42, colour, edge ? '|' : '#')
      }
      const under = half - cellW * 1.5
      for (let x = p.x - under; x <= p.x + under; x += cellW * 0.5) put(x, y + cellH * 2, here ? 0.42 : 0.28, colour, Math.abs(x - p.x) > under - cellW ? (x < p.x ? '\\' : '/') : ':')
      const tip = under - cellW * 1.6
      for (let x = p.x - tip; x <= p.x + tip; x += cellW * 0.5) put(x, y + cellH * 3, here ? 0.3 : 0.2, colour, Math.abs(x - p.x) > tip - cellW ? (x < p.x ? '\\' : '/') : '.')
      // A number plate beside the slab: [1] to [4].
      const plate = p.x + half + cellW * 1.4
      ;['[', String(i + 1), ']'].forEach((m, k) => put(plate + k * cellW, y, here ? 1 : 0.7, here ? 1 : 2, m))
    })
    // The landing itself: grit thrown up from both sides of the box and falling back, and short strokes of motion
    // either side of it, all over in a moment whether or not the reader keeps scrolling.
    if (landedOn >= 0 && impact < 1) {
      const p = spots[landedOn]!
      for (let n = 0; n < 22; n++) {
        const side = n % 2 ? 1 : -1
        const speed = unit * (1.6 + hash(n, landedOn) * 2.2)
        const rise = unit * (1.2 + hash(landedOn, n) * 2)
        const t = impact * 0.6
        const x = p.x + side * (unit * 0.45 + speed * t)
        const y = p.y - cellH * 0.6 - rise * t + unit * 7 * t * t
        put(x, y, 1 - impact * 0.8, n % 3 ? 2 : 1, '.\'`*,'[n % 5])
      }
      if (impact < 0.35) {
        const fade = 1 - impact / 0.35
        for (const side of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const x = p.x + side * (unit * (0.85 + k * 0.32))
            const y = p.y - unit * (0.25 + k * 0.22)
            put(x, y, 0.85 * fade, 2, side < 0 ? '\\' : '/')
          }
        }
      }
    }

    // The box, a page not yet read: its characters never settle. Dropping in, crouching before a jump, flipping once
    // in the air, squashing as it lands; held by the octopus at the top, it reads into lines of Markdown.
    const box = boxAt(climb, spots, unit, cellH)
    const tick = Math.floor(time * 9)
    const read = climb.ledge === LEDGES.length ? clamp01((climb.k - 0.1) * 2.5) : 0
    if (box) {
      const half = unit * 0.5
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const x = sx! * half * box.sx
        const y = sy! * half * box.sy
        return { x: box.x + x * Math.cos(box.a) - y * Math.sin(box.a), y: box.y + x * Math.sin(box.a) + y * Math.cos(box.a) }
      })
      fill(corners, (x, y) => {
        const cell = Math.floor(x / cellW) * 131 + Math.floor(y / cellH)
        if (hash(cell, 7) < read) put(x, y, 1, 2, '=')
        else put(x, y, 0.95, 1, GARBLE[Math.floor(hash(cell, tick) * GARBLE.length)])
      })
      for (let i = 0; i < 4; i++) line(corners[i]!, corners[(i + 1) % 4]!, cellW, cellH, (x, y, m) => put(x, y, 1, 2, m))
    }

    // The octopus on the summit, the Built for card's own: a dome filled in characters, darker at the rim with a
    // highlight up on the left, white eyes that blink, six arms hanging down the peak and waving, and a gold crown.
    // As the page comes up one arm reaches out and holds it.
    const top = spots[spots.length - 1]!
    const rx = unit * 1.0
    const ry = unit * 1.1
    const breathe = Math.sin(time * 2.2) * 0.03
    const head = { x: top.x, y: top.y - ry * 1.9 }
    const size = ry * 3
    const reaching = climb.ledge === LEDGES.length - 1 && climb.phase === 'jump' ? easeOut(climb.k) : climb.ledge === LEDGES.length ? 1 : 0
    for (let k = 0; k < 6; k++) {
      const side = k < 3 ? -1 : 1
      const j = k % 3
      const root = { x: head.x + side * ROOT_X[j]! * rx, y: head.y + ROOT_Y[j]! * ry }
      const holding = k === 0 && reaching > 0 && box
      let a = Math.PI / 2 - side * SPREAD[j]!
      let x = root.x
      let y = root.y
      const steps = 16
      const length = rx * 2.2 * LENGTH[j]! * (holding ? 1 + 0.6 * reaching : 1)
      for (let i = 1; i <= steps; i++) {
        const s = i / steps
        if (holding) a += (Math.atan2(box.y - y, box.x + unit * 0.45 - x) - a) * 0.3 * reaching
        a += ((-side * CURL[j]! * (0.2 + 2.2 * s * s) + Math.sin(time * 2.3 + k * 1.7 - s * 5) * 0.9 * s) / steps) * (holding ? 1 - reaching : 1)
        x += (Math.cos(a) * length) / steps
        y += (Math.sin(a) * length) / steps
        const radius = Math.max(cellW * 0.45, (1 - 0.75 * s) * rx * 0.17)
        for (let dy = -radius; dy <= radius; dy += cellH * 0.5) {
          for (let dx = -radius; dx <= radius; dx += cellW * 0.5) if (dx * dx + dy * dy <= radius * radius) put(x + dx, y + dy, 0.7 - 0.3 * s, 1)
        }
        put(x, y, 0.7 - 0.3 * s, 1)
      }
    }
    const top2 = ry * 1.08 * (1 - breathe)
    const bottom = ry * 0.86 * (1 - breathe)
    const wide = rx * (1 + breathe)
    for (let y = head.y - top2; y <= head.y + bottom; y += cellH * 0.5) {
      for (let x = head.x - wide; x <= head.x + wide; x += cellW * 0.5) {
        const dx = (x - head.x) / wide
        const dy = (y - head.y) / (y < head.y ? top2 : bottom)
        const d2 = dx * dx + dy * dy
        if (d2 > 1) continue
        let value = d2 > 0.62 ? 0.84 : 0.66
        if ((dx + 0.35) ** 2 + (dy + 0.45) ** 2 < 0.06) value = 0.42
        put(x, y, value, 1)
      }
    }
    const blink = time % 4.2 < 0.13
    for (const side of [-1, 1]) put(head.x + side * wide * 0.42, head.y + ry * 0.18, 1, 2, blink ? '-' : '@')
    CROWN.forEach((row, r) => {
      ;[...row].forEach((ch, c) => put(head.x + (c - (row.length - 1) / 2) * cellW, head.y - top2 - (CROWN.length - r - 0.2) * cellH, 1, ch === '*' ? 2 : 3, ch))
    })
    // At the top, a ring of light from the summit.
    if (climb.ledge === LEDGES.length) {
      const radius = unit * (0.6 + 2.6 * easeOut(climb.k))
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * TAU
        put(head.x + Math.cos(t) * radius, head.y + Math.sin(t) * radius * 0.6, 0.9 * (1 - climb.k), 1, '·')
      }
    }

    paint.setTransform(ratio, 0, 0, ratio, 0, 0)
    paint.clearRect(0, 0, w, h)
    // A soft dark pool behind each ledge, the box and the octopus, so their characters read over the painting.
    const pool = (x: number, y: number, r: number, a: number): void => {
      const g = paint.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(2, 10, 40, ${a})`)
      g.addColorStop(1, 'rgba(2, 10, 40, 0)')
      paint.fillStyle = g
      paint.fillRect(x - r, y - r, r * 2, r * 2)
    }
    for (const p of spots.slice(0, LEDGES.length)) pool(p.x, p.y, unit * 1.9, 0.55)
    pool(head.x, head.y + ry * 0.4, size * 0.62, 0.6)
    if (box) pool(box.x, box.y, unit * 1.3, 0.5)
    paint.font = `600 ${cellH}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    paint.textAlign = 'center'
    paint.textBaseline = 'middle'
    const groups = new Map<string, number[]>()
    for (let i = 0; i < glow.length; i++) {
      const g = glow[i]!
      if (g < 0.08) continue
      const mark = marks[i] ?? RAMP[Math.min(RAMP.length - 1, Math.floor(g * RAMP.length))]!
      const key = `${mark}|${tone[i]}|${Math.round(g * 5)}`
      const list = groups.get(key)
      if (list) list.push(i)
      else groups.set(key, [i])
    }
    for (const [key, cells] of groups) {
      const [mark, colour, level] = key.split('|') as [string, string, string]
      paint.fillStyle = `rgba(${TONES[Number(colour)]}, ${(0.3 + 0.7 * (Number(level) / 5)).toFixed(2)})`
      for (const i of cells) paint.fillText(mark, ((i % cols) + 0.5) * cellW, (Math.floor(i / cols) + 0.5) * cellH)
    }
    // Why this page needs more, over the box, as it gets ready to jump.
    const why = steps[climb.ledge]?.dataset.why
    if (box && why && climb.phase === 'stay' && climb.k > 0.5) {
      paint.font = `500 ${Math.max(11, cellH + 2)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      paint.globalAlpha = clamp01((climb.k - 0.5) / 0.15)
      const text = `${why} →`
      const width = paint.measureText(text).width + 20
      const height = cellH + 14
      const x = Math.max(8, Math.min(w - width - 8, box.x - width / 2))
      const y = box.y - unit * 1.3 - height / 2
      paint.fillStyle = 'rgba(2, 10, 40, .82)'
      paint.beginPath()
      paint.roundRect(x, y, width, height, 6)
      paint.fill()
      paint.fillStyle = `rgb(${TONES[1]})`
      paint.fillText(text, x + width / 2, y + height / 2 + 1)
      paint.globalAlpha = 1
    }

    // The step the box is on (the first while it drops in, the last once it is at the summit), marked in the list.
    const mark = Math.min(on, steps.length - 1)
    const label = on >= LEDGES.length ? 'read' : `${mark}`
    if (label !== shown) {
      shown = label
      steps.forEach((step, i) => step.classList.toggle('is-active', i === mark))
      if (tag) tag.innerHTML = on >= LEDGES.length ? '<b>Read</b> · the page is read' : `<b>Step ${mark + 1} / ${LEDGES.length}</b> · ${names[mark]}`
    }
  }

  // Drawn every frame while on screen, for the octopus's breathing; the climb eases towards where the scroll is.
  let frameId = 0
  let last = 0
  let seen = false
  const loop = (now: number): void => {
    frameId = 0
    if (document.hidden || !seen) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    time += dt
    const target = progress()
    at += (target - at) * (1 - Math.exp(-dt * 10))
    if (Math.abs(target - at) < 0.0005) at = target
    draw()
    frameId = requestAnimationFrame(loop)
  }
  const start = (): void => {
    if (!frameId && seen && !document.hidden) {
      last = 0
      frameId = requestAnimationFrame(loop)
    }
  }
  window.addEventListener('resize', measure)
  wide.addEventListener('change', measure)
  measure()
  new IntersectionObserver(([entry]) => {
    seen = Boolean(entry?.isIntersecting)
    if (seen) at = progress()
    start()
  }).observe(section)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId)
      frameId = 0
    } else start()
  })
}

/** Where the box is for a point in the climb: its centre, its squash, and its turn. Null before it drops in. */
function boxAt(climb: ReturnType<typeof climbAt>, spots: Array<{ x: number; y: number }>, unit: number, cellH: number): { x: number; y: number; sx: number; sy: number; a: number } | null {
  const rest = (i: number): { x: number; y: number } => ({ x: spots[i]!.x, y: spots[i]!.y - unit * 0.5 - cellH * 0.75 })
  if (climb.phase === 'drop') {
    if (climb.k <= 0) return null
    const p = rest(0)
    return { x: p.x, y: p.y - unit * 6 * (1 - climb.k * climb.k), sx: 1, sy: 1.1, a: 0 }
  }
  if (climb.ledge >= spots.length - 1) {
    // Taken by the octopus: held just under its head.
    const p = spots[spots.length - 1]!
    return { x: p.x - unit * 2.6, y: p.y - unit * 0.7, sx: 0.9, sy: 0.9, a: 0 }
  }
  if (climb.phase === 'stay') {
    const p = rest(climb.ledge)
    const land = climb.k < 0.12 ? Math.sin((climb.k / 0.12) * Math.PI) * 0.3 : 0
    const crouch = climb.k > 0.82 ? easeOut((climb.k - 0.82) / 0.18) * 0.28 : 0
    const squash = Math.max(land, crouch)
    return { x: p.x, y: p.y + unit * 0.5 * squash, sx: 1 + squash * 0.6, sy: 1 - squash, a: 0 }
  }
  const a = rest(climb.ledge)
  const b = climb.ledge + 1 === spots.length - 1 ? { x: spots[spots.length - 1]!.x - unit * 2.6, y: spots[spots.length - 1]!.y - unit * 0.7 } : rest(climb.ledge + 1)
  const k = climb.k
  const lift = Math.max(unit * 2.2, (a.y - b.y) + unit * 1.4)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - lift * 4 * k * (1 - k), sx: 1, sy: 1 + 0.15 * Math.sin(k * Math.PI), a: -TAU * easeInOut(k) }
}

/** A convex polygon's points, a half cell apart. */
function fill(pts: Array<{ x: number; y: number }>, put: (x: number, y: number) => void): void {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  let area = 0
  for (let i = 0; i < pts.length; i++) area += pts[i]!.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * pts[i]!.y
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) {
      let inside = true
      for (let i = 0; i < pts.length && inside; i++) {
        const a = pts[i]!
        const b = pts[(i + 1) % pts.length]!
        if (((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) * area < 0) inside = false
      }
      if (inside) put(x, y)
    }
  }
}

/** A line in characters that follow its slant. */
function line(a: { x: number; y: number }, b: { x: number; y: number }, cellW: number, cellH: number, put: (x: number, y: number, mark: string) => void): void {
  const dc = (b.x - a.x) / cellW
  const dr = (b.y - a.y) / cellH
  const mark = Math.abs(dr) < Math.abs(dc) * 0.3 ? '-' : Math.abs(dc) < Math.abs(dr) * 0.3 ? '|' : dc * dr > 0 ? '\\' : '/'
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dc), Math.abs(dr)) * 1.5))
  for (let i = 0; i <= n; i++) put(a.x + (b.x - a.x) * (i / n), a.y + (b.y - a.y) * (i / n), mark)
}
