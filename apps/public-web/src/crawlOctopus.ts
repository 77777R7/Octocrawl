/** The crawl window's octopus (crawlView.ts), without the DOM: a mantle and eight arms worked out each frame as
 * shapes, then typed onto the window's grid. Nothing is ever drawn between cells, and every movement is a cell taking
 * another glyph.
 *
 * The mantle is a stamp: its outline is laid on the grid with its centre on a line between two columns and two rows,
 * so at rest it is always typed the same way and the same on both sides, and it moves a whole cell at a time. Only
 * what is meant to change it does: growing out of one cell, the squash of a landing, the stretch of a dive.
 *
 * An arm is one stroke: a gentle arc from the mantle's foot to its tip, typed as one cell in each row it crosses (or,
 * where it lies flat, each cell along the row), the glyph following the arm through the cell. The arms hang in an even
 * fan and walk as the mantle moves: every other arm reaches on while its neighbours hold the page and draw back, a
 * stride for each stretch the mantle covers, so a holding tip stays close to the cell it took. Let go, they stream
 * above a diving mantle; when it lands they slap out along the ground, then are thrown up. */

export interface Point { x: number; y: number }

/** How a cell is inked: the mantle's lit, plain and shaded faces and the sheen that crosses it, an arm near the
 * mantle and far from it, the cell an arm holds, an open eye (a gap in the mantle, with a glint) and a lid drawn over
 * one. */
export type Tone = 'lit' | 'body' | 'shade' | 'sheen' | 'arm' | 'far' | 'tip' | 'eye' | 'lid'
/** `skirt` marks a cell of an arm the page should not show beside: each row is clear from its first such cell to its
 * last, so the page's lines never run between the arms. */
export interface OctoCell { col: number; row: number; char: string; tone: Tone; heat: number; skirt?: boolean }
export type Eyes = 'open' | 'shut' | 'squint' | 'happy'
/** crawl: the arms walk. dive: they stream above it. land: they slap out along the ground, then are thrown up.
 * hold: two of them hold on to the two given points and the rest hang. */
export type Mode = 'crawl' | 'dive' | 'land' | 'hold'

export interface OctopusFrame {
  now: number
  dt: number
  /** The mantle's centre, in page pixels (x across, y down the page). */
  x: number
  y: number
  /** Its size (0 to 1 and a little past, while it emerges) and its squash and stretch (1 at rest). */
  scale: number
  sx: number
  sy: number
  mode: Mode
  eyes: Eyes
  /** 1 when the eyes look right, else 0. */
  look: number
  /** How warm it glows, 0 to 1 (emerging, landing). */
  heat: number
  /** land: the ground's y. hold: the two points held. crawl and hold: a y no tip may pass (a shut gate), when there
   * is one. */
  ground?: number
  grip?: readonly [Point, Point]
  bar?: number
}

export interface OctopusOptions {
  pitchX: number
  pitchY: number
  /** 1 on a wide window; smaller on a phone. */
  size: number
  seed: number
}

export interface Octopus {
  /** The mantle's half width, its height above its centre and its height below it, in pixels at rest; and how far to
   * either side of its centre, and how far above it, its arms reach once thrown up. */
  readonly rx: number
  readonly ry: number
  readonly belly: number
  readonly span: number
  readonly rise: number
  /** Puts it at a point with its arms tucked in; they unfurl from `now`. */
  place(x: number, y: number, now: number): void
  /** The grid's columns are now this wide (the window was resized while it played): everything it remembers across
   * the page moves with them. */
  setPitch(pitchX: number): void
  update(frame: OctopusFrame): void
  /** Its cells, one per grid cell it covers. The mantle rides `scrollBody` pixels of scroll, the cells its arms hold
   * `scrollPage` (they are whole cells of the page). */
  cells(scrollBody: number, scrollPage: number): OctoCell[]
  /** The page points its arms' tips hold. */
  holds(): Point[]
}

/** After it lands its arms lie out along the ground for this long, then are thrown up. */
export const SLAP_MS = 400

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 3

/** The mantle stops this far below its centre (a share of its height): a flat foot the arms leave from. */
const FOOT = 0.78
/** Below its centre it narrows as a taller ellipse would, so the foot stays wide; above, its dome is this blunt.
 * Around its centre it keeps its full width over a belt this tall (a share of its height each way), so the rows
 * there end in the same columns and its sides stay straight. */
const SWELL = 1.2
const DOME = 2
const BELT = 0.3
// Each arm: where it leaves the mantle (a share of the half width), its resting direction (degrees from straight
// down, negative to the left) and its length (a share of the longest).
const ARMS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.92, -31, 0.94], [-0.66, -22, 1], [-0.4, -13, 0.94], [-0.14, -4, 1],
  [0.14, 4, 1], [0.4, 13, 0.94], [0.66, 22, 1], [0.92, 31, 0.94],
]
/** The arms unfurl once the mantle is nearly whole, the inner pair first. */
const UNFURL_AT = 240
const UNFURL_GAP = 60
const UNFURL_MS = 520
/** A curve is sampled this often along its length (px). */
const SAMPLE = 2.5
/** A sheen crosses the waiting mantle once in this long. */
const SHEEN_MS = 3400

interface Arm {
  seat: number
  fan: number
  length: number
  side: -1 | 1
  /** 0 for the innermost arm of its side, 3 for the outermost. */
  rank: number
  /** Where its tip is (page pixels), where that is from its seat, and whether it has hold of the page there. */
  tip: Point
  reach: Point
  planted: boolean
  /** How far its curve bows outward between the mantle and its tip (a share of its length; negative bows inward),
   * and how far up the mantle's side it leaves from (0 at the foot, 1 at the shoulder); they ease between modes. */
  bow: number
  lift: number
  /** When it next lifts off the page for a moment while the octopus waits. */
  fidgetAt: number
  phase: number
  delay: number
}

export function createOctopus(options: OctopusOptions): Octopus {
  const { pitchY, size } = options
  let pitchX = options.pitchX
  const unit = pitchY * size
  const rx = 5.3 * unit
  const ry = 3.7 * unit
  const reach = 9.6 * unit
  // A small deterministic generator: one link's octopus fidgets the same way every time.
  let state = options.seed >>> 0
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const arms: Arm[] = ARMS.map(([seat, fan, length], i) => ({
    seat, fan: fan * Math.PI / 180, length: length * reach, side: seat < 0 ? -1 : 1, rank: seat < 0 ? 3 - i : i - 4,
    tip: { x: 0, y: 0 }, reach: { x: 0, y: 0 }, planted: false,
    bow: 0, lift: 0, fidgetAt: 0, phase: i * 2.4, delay: Math.floor(Math.abs(i - 3.5)) * UNFURL_GAP,
  }))
  let frame: OctopusFrame = { now: 0, dt: 0, x: 0, y: 0, scale: 1, sx: 1, sy: 1, mode: 'crawl', eyes: 'open', look: 0, heat: 0 }
  let born = 0
  let last: Point = { x: 0, y: 0 }
  let velocity: Point = { x: 0, y: 0 }
  let landedAt = -Infinity
  /** How far the mantle has travelled (px), and how much it is on the move (0 still, 1 walking). */
  let walked = 0
  let moving = 0

  /** Where a thrown-up arm points: more to its side the further out it sits. */
  const thrown = (arm: Arm): number => (6 + 11 * arm.rank) * Math.PI / 180
  /** Where an arm leaves the mantle, from the mantle's centre, as shares of its half width and height: along its
   * foot, or (thrown up) spaced up its shoulder. */
  function seatAt(arm: Arm): Point {
    const w = Math.sqrt(1 - ((FOOT - BELT) / (SWELL - BELT)) ** 2)
    const foot = { x: arm.seat * w * 0.76, y: FOOT - 0.1 }
    const shoulder = { x: arm.side * (0.3 + 0.18 * arm.rank), y: -0.7 + 0.22 * arm.rank }
    return { x: foot.x + (shoulder.x - foot.x) * arm.lift, y: foot.y + (shoulder.y - foot.y) * arm.lift }
  }
  function seatOf(arm: Arm, f: OctopusFrame): Point {
    const seat = seatAt(arm)
    return { x: f.x + rx * f.sx * f.scale * seat.x, y: f.y + ry * f.sy * f.scale * seat.y }
  }
  /** How much of its length an arm has unfurled. */
  const grownAt = (arm: Arm, now: number): number => easeOut((now - born - UNFURL_AT - arm.delay) / UNFURL_MS)

  function place(x: number, y: number, now: number): void {
    born = now
    last = { x, y }
    velocity = { x: 0, y: 0 }
    landedAt = -Infinity
    walked = 0
    moving = 0
    frame = { ...frame, now, x, y, scale: 0, mode: 'crawl' }
    arms.forEach((arm) => {
      arm.tip = { x, y }
      arm.reach = { x: 0, y: 0 }
      arm.planted = false
      arm.bow = 0.07
      arm.lift = 0
      arm.fidgetAt = now + 1400 + random() * 2600
    })
  }

  /** Where each arm's tip is this frame, and how its curve bends: walking, let go, coming down or holding on. */
  function aim(f: OctopusFrame, dt: number): void {
    arms.forEach((arm, i) => {
      const base = seatOf(arm, f)
      // The tip eases toward a goal given from its seat, and moves with the mantle meanwhile: however fast the mantle
      // goes, the arm keeps its shape. (A goal that is a fixed point, the ground or the note, is given from the seat
      // too, so the tip closes on it as the mantle settles.)
      const spring = (goal: Point, ms: number): void => {
        const k = 1 - Math.exp(-dt / ms)
        arm.reach = { x: arm.reach.x + (goal.x - base.x - arm.reach.x) * k, y: arm.reach.y + (goal.y - base.y - arm.reach.y) * k }
        arm.tip = { x: base.x + arm.reach.x, y: base.y + arm.reach.y }
      }
      const bend = (bow: number, lift = 0): void => {
        const k = 1 - Math.exp(-dt / 110)
        arm.lift += (lift - arm.lift) * k
        arm.bow += (bow - arm.bow) * k
      }
      if (f.mode === 'dive') {
        // Let go, the arms sweep up past the mantle's shoulders and stream above it, the outer ones widest.
        const angle = thrown(arm) * 0.5
        const up = arm.length * (0.9 - 0.08 * arm.rank)
        arm.planted = false
        spring({ x: base.x + arm.side * Math.sin(angle) * up, y: base.y - Math.cos(angle) * up }, 130)
        bend(-0.04, 1)
        return
      }
      if (f.mode === 'land') {
        const ground = f.ground ?? f.y + ry * FOOT
        arm.planted = false
        if (f.now - landedAt < SLAP_MS) {
          // They slap out along the ground both ways, the outer arms furthest, every other one a row up.
          spring({ x: f.x + arm.side * (rx * 0.9 + arm.length * (0.2 + 0.26 * arm.rank)), y: ground - pitchY * (0.5 + (arm.rank % 2)) }, 45)
          bend(0)
        } else {
          // Then they are thrown up and out, and stay up, waving.
          const up = arm.length * (0.8 - 0.05 * arm.rank)
          spring({ x: base.x + arm.side * (Math.sin(thrown(arm)) * up + Math.sin(f.now / 190 + arm.phase) * unit * 0.45), y: base.y - Math.cos(thrown(arm)) * up }, 100)
          bend(0.06, 1)
        }
        return
      }
      bend(0.07)
      if (f.mode === 'hold') {
        const held = f.grip && (i === 2 ? f.grip[0] : i === 5 ? f.grip[1] : null)
        arm.planted = Boolean(held)
        const goal = held ? { ...held } : { x: base.x + Math.sin(arm.fan) * arm.length * 0.6 + Math.sin(f.now / 1100 + arm.phase) * unit * 0.4, y: base.y + Math.cos(arm.fan) * arm.length * 0.56 }
        // A shut gate is not passed to hold on to something either: the arm comes to rest on it.
        if (f.bar !== undefined) goal.y = Math.min(goal.y, f.bar)
        spring(goal, held ? 190 : 320)
        return
      }
      // Walking: every other arm is half a stride ahead of its neighbours. A stride is as long as the stretch the
      // mantle covers in it, so an arm that is drawing back stays close to the cell it took.
      const stride = arm.length * 0.14
      const beat = walked / stride + (i % 2 ? Math.PI : 0)
      // Waiting, an arm now and then lifts off the page and feels for another cell.
      if (f.now > arm.fidgetAt + 620) arm.fidgetAt = f.now + 1400 + random() * 3200
      const feel = moving < 0.3 && f.now > arm.fidgetAt ? Math.sin(Math.PI * (f.now - arm.fidgetAt) / 620) : 0
      const out = 0.72 + 0.14 * moving * Math.sin(beat) - 0.16 * feel
      const goal = { x: base.x + Math.sin(arm.fan + feel * arm.side * 0.12) * arm.length * out, y: base.y + Math.cos(arm.fan) * arm.length * out }
      if (f.bar !== undefined) goal.y = Math.min(goal.y, f.bar)
      // It holds the page while it draws back (and while the octopus is still), and lifts while it reaches on.
      arm.planted = grownAt(arm, f.now) >= 1 && feel < 0.15 && (moving < 0.3 || Math.cos(beat) < 0.2)
      spring(goal, 70)
    })
  }

  function update(f: OctopusFrame): void {
    const dt = Math.max(1, Math.min(100, f.dt))
    // The mantle's speed, smoothed.
    const blend = 1 - Math.exp(-dt / 140)
    velocity = { x: velocity.x + ((f.x - last.x) / dt - velocity.x) * blend, y: velocity.y + ((f.y - last.y) / dt - velocity.y) * blend }
    walked += Math.hypot(f.x - last.x, f.y - last.y)
    // On the move above about a row a second.
    moving += (clamp01((Math.hypot(velocity.x, velocity.y) - 0.008) / 0.03) - moving) * blend
    last = { x: f.x, y: f.y }
    if (f.mode === 'land' && frame.mode !== 'land') landedAt = f.now
    frame = f
    aim(f, dt)
  }

  /** An arm's curve on the window, sampled from the mantle out: a gentle arc from its seat to its tip, swaying along
   * the way. Each sample has its place and how far along the arm it is. `shift` is how far the mantle's stamp sits
   * from where its centre really is. */
  function curve(arm: Arm, f: OctopusFrame, scrollBody: number, scrollPage: number, shift: Point): Array<{ x: number; y: number; u: number }> {
    const grown = grownAt(arm, f.now)
    const seat = seatOf(arm, f)
    const base = { x: seat.x + shift.x, y: seat.y - scrollBody + shift.y }
    // A tip on the page keeps to the page's own rows; a free one moves with the mantle.
    const end = f.mode === 'crawl' || arm.planted ? { x: arm.tip.x, y: arm.tip.y - scrollPage } : { x: arm.tip.x + shift.x, y: arm.tip.y - scrollBody + shift.y }
    const far = Math.hypot(end.x - base.x, end.y - base.y) || 1
    const length = arm.length * f.scale
    const slack = Math.max(0, length * 0.8 - far)
    // Bowed to the arm's own side, a slack arm more; one lying along the ground lies straight, in its own row.
    const lying = f.mode === 'land' && arm.lift <= 0.5
    let nx = (end.y - base.y) / far
    let ny = -(end.x - base.x) / far
    if (Math.abs(nx) >= 0.3 ? Math.sign(nx) !== arm.side : ny > 0) { nx = -nx; ny = -ny }
    const bow = lying ? 0 : arm.bow * length + Math.min(slack, length * 0.25) * 0.12
    const c1 = { x: base.x + (end.x - base.x) * 0.33 + nx * bow, y: base.y + (end.y - base.y) * 0.33 + ny * bow }
    const c2 = { x: base.x + (end.x - base.x) * 0.67 + nx * bow, y: base.y + (end.y - base.y) * 0.67 + ny * bow }
    const free = !arm.planted
    const sway = lying ? 0 : (f.mode === 'dive' ? 0.5 : free ? 0.34 : 0.24) * unit
    const beat = f.now / (f.mode === 'dive' ? 130 : 560)
    const count = Math.max(6, Math.ceil((far + slack + length * 0.3) / SAMPLE))
    const out: Array<{ x: number; y: number; u: number }> = []
    for (let s = 1; s <= count * grown; s++) {
      const t = s / count
      const v = 1 - t
      const x = v * v * v * base.x + 3 * v * v * t * c1.x + 3 * v * t * t * c2.x + t * t * t * end.x
      const y = v * v * v * base.y + 3 * v * v * t * c1.y + 3 * v * t * t * c2.y + t * t * t * end.y
      const tx = 3 * v * v * (c1.x - base.x) + 6 * v * t * (c2.x - c1.x) + 3 * t * t * (end.x - c2.x)
      const ty = 3 * v * v * (c1.y - base.y) + 6 * v * t * (c2.y - c1.y) + 3 * t * t * (end.y - c2.y)
      const size = Math.hypot(tx, ty) || 1
      // The sway runs along the arm; a held tip stays where it is.
      const wave = Math.sin(t * 5.4 - beat + arm.phase) * sway * (free ? Math.sin(Math.PI * Math.min(1, t * 1.2) / 2) : Math.sin(Math.PI * t))
      out.push({ x: x - ty / size * wave, y: y + tx / size * wave, u: t })
    }
    return out
  }

  function cells(scrollBody: number, scrollPage: number): OctoCell[] {
    const f = frame
    if (f.scale <= 0.02) return []
    const grid = new Map<number, OctoCell>()
    const key = (col: number, row: number): number => (row + 512) * 4096 + col + 512
    // The stamp's centre: on the line between two columns and between two rows.
    const cx = Math.round(f.x / pitchX) * pitchX
    const cy = Math.round((f.y - scrollBody) / pitchY) * pitchY
    const shift = { x: cx - f.x, y: cy - (f.y - scrollBody) }
    const hx = rx * f.sx * f.scale
    const hy = ry * f.sy * f.scale

    // The mantle's outline: for each row it covers, the cells between its two sides.
    const spans: Array<{ row: number; a: number; b: number; v: number }> = []
    for (let row = Math.floor((cy - hy) / pitchY); row <= Math.floor((cy + hy * FOOT) / pitchY); row++) {
      const v = (row * pitchY + pitchY / 2 - cy) / hy
      if (v <= -1 || v > FOOT) continue
      const half = hx * (v < 0 ? (1 - (Math.max(0, -v - BELT) / (1 - BELT)) ** DOME) ** (1 / DOME) : Math.sqrt(1 - (Math.max(0, v - BELT) / (SWELL - BELT)) ** 2))
      const a = Math.ceil((cx - half) / pitchX - 0.5)
      const b = Math.floor((cx + half) / pitchX - 0.5)
      if (b >= a) spans.push({ row, a, b, v })
    }
    // A top row that only just catches the dome would sit on it as a nub: the dome starts with the row below.
    if (spans.length > 2 && spans[0]!.b - spans[0]!.a < (spans[1]!.b - spans[1]!.a) * 0.4) spans.shift()
    const under = new Map(spans.map((span) => [span.row, span] as const))

    // The arms: one stroke each. Where an arm runs steeply it takes one cell in each row it crosses, so it reads as
    // a single line; where it lies flat (slapped out along the ground) it takes each cell along the row. A cell's
    // glyph follows the arm through it: straight, leaning, or a bracket where the arm bends there. The cell an arm
    // holds is a hook turned outward.
    arms.forEach((arm) => {
      const grown = grownAt(arm, f.now)
      if (grown <= 0 || f.scale < 0.6) return
      const path: Array<{ col: number; row: number; u: number; flat: boolean }> = []
      let run: Array<{ col: number; u: number }> = []
      let runRow = 0
      const flush = (): void => {
        if (!run.length) return
        const cols = run.map((sample) => sample.col)
        // Up to three cells of a row are one step of a leaning stroke; more is a run along the row.
        if (Math.max(...cols) - Math.min(...cols) <= 2) {
          const middle = run[Math.floor(run.length / 2)]!
          path.push({ col: middle.col, row: runRow, u: middle.u, flat: false })
        } else {
          for (const sample of run) if (path[path.length - 1]?.col !== sample.col || path[path.length - 1]?.row !== runRow) path.push({ col: sample.col, row: runRow, u: sample.u, flat: true })
        }
        run = []
      }
      for (const sample of curve(arm, f, scrollBody, scrollPage, shift)) {
        const row = Math.floor(sample.y / pitchY)
        const col = Math.floor(sample.x / pitchX)
        // Under the mantle the arm is not seen: its stroke starts where it comes out.
        const cover = under.get(row)
        if (cover && col >= cover.a && col <= cover.b) continue
        if (run.length && row !== runRow) flush()
        runRow = row
        run.push({ col, u: sample.u })
      }
      flush()
      // The page is kept clear beside every arm but one that lies along the ground or holds on to something.
      const skirt = !(f.mode === 'land' && arm.lift <= 0.5) && !(f.mode === 'hold' && arm.planted)
      path.forEach((cell, n) => {
        const before = path[n - 1]
        const after = path[n + 1]
        // The neighbours above and below it, whichever way the arm runs.
        const above = before && before.row < cell.row ? before : after && after.row < cell.row ? after : undefined
        const below = before && before.row > cell.row ? before : after && after.row > cell.row ? after : undefined
        const fromAbove = above ? cell.col - above.col : 0
        const toBelow = below ? below.col - cell.col : 0
        const lean = fromAbove + toBelow
        const end = n === path.length - 1
        const holding = end && arm.planted && grown >= 1
        const upward = Boolean(before && before.row > cell.row)
        const char = holding ? (arm.side < 0 ? 'J' : 'L') : end ? (upward ? '.' : "'") : cell.flat ? '~'
          : fromAbove < 0 && toBelow > 0 ? '(' : fromAbove > 0 && toBelow < 0 ? ')' : lean === 0 ? '|' : lean > 0 ? '\\' : '/'
        grid.set(key(cell.col, cell.row), { col: cell.col, row: cell.row, char, tone: holding ? 'tip' : cell.u < 0.55 ? 'arm' : 'far', heat: f.heat * 0.7, ...(skirt ? { skirt: true } : {}) })
      })
    })

    // The mantle's cells, row by row. Waiting, a sheen crosses it now and then, from its lit shoulder down.
    const sheen = f.mode === 'crawl' || f.mode === 'hold' ? ((f.now - born) % SHEEN_MS) / SHEEN_MS * 7 - 1.7 : Infinity
    spans.forEach((span, n) => {
      const above = spans[n - 1]
      const below = spans[n + 1]
      for (let col = span.a; col <= span.b; col++) {
        const open = !above || col < above.a || col > above.b
        const left = col === span.a
        let char = '#'
        if (left || col === span.b) {
          const widerBelow = below && (left ? below.a < span.a : below.b > span.b)
          const widerAbove = above && (left ? above.a < span.a : above.b > span.b)
          char = !above || widerBelow ? ',' : !below || widerAbove ? (left ? '\\' : '/') : '='
        } else if (open) char = '='
        const across = (col * pitchX + pitchX / 2 - cx) / hx
        const face = across * 0.5 + span.v * 0.9
        const rim = Math.sqrt(across * across + span.v * span.v)
        // While it is still growing its edge is not drawn yet: the cells there run light to heavy inward, a mist
        // that the outline condenses out of.
        if (f.scale < 0.94 && rim > 0.7) char = rim > 0.92 ? ':' : rim > 0.81 ? '+' : 'x'
        const tone: Tone = char === '#' && Math.abs(face - sheen) < 0.2 ? 'sheen' : face < -0.5 ? 'lit' : face > 0.55 ? 'shade' : 'body'
        grid.set(key(col, span.row), { col, row: span.row, char, tone, heat: clamp01(f.heat * (0.45 + 0.8 * rim)) })
      }
    })

    // The eyes: two gaps in the mantle, two cells each, with a glint on the side it looks to; or lids.
    if (f.scale > 0.75) {
      const row = Math.floor((cy + hy * 0.1) / pitchY)
      const span = spans.find((candidate) => candidate.row === row)
      const k = Math.round(cx / pitchX)
      const inner = Math.max(2, Math.round(hx * 0.3 / pitchX))
      const pairs = [[k - inner - 1, k - inner], [k + inner - 1, k + inner]]
      pairs.forEach((cols, n) => {
        if (!span || cols[0]! <= span.a || cols[1]! >= span.b) return
        cols.forEach((col, at) => {
          grid.set(key(col, row), f.eyes === 'open' ? { col, row, char: at === (f.look > 0 ? 1 : 0) ? "'" : ' ', tone: 'eye', heat: 0 }
            : { col, row, char: f.eyes === 'happy' ? '^' : f.eyes === 'squint' ? (n === 0 ? '>' : '<') : '-', tone: 'lid', heat: 0 })
        })
      })
    }
    return [...grid.values()]
  }

  function holds(): Point[] {
    return arms.filter((arm) => arm.planted).map((arm) => ({ x: arm.tip.x, y: arm.tip.y }))
  }

  function setPitch(next: number): void {
    if (!(next > 0) || next === pitchX) return
    const k = next / pitchX
    pitchX = next
    last = { x: last.x * k, y: last.y }
    frame = { ...frame, x: frame.x * k }
    for (const arm of arms) arm.tip = { x: arm.tip.x * k, y: arm.tip.y }
  }

  const outer = arms[arms.length - 1]!
  const inner = arms[arms.length / 2]!
  const span = rx * (0.3 + 0.18 * outer.rank) + Math.sin(thrown(outer)) * outer.length * (0.8 - 0.05 * outer.rank) + unit * 0.45
  const rise = ry * 0.7 + Math.cos(thrown(inner)) * inner.length * 0.8
  return { rx, ry, belly: ry * FOOT, span, rise, place, setPitch, update, cells, holds }
}
