import { whenVisible } from './motion'
import { PET, petMood, rollAngle, startles } from './octopusPet'

/* A small sea around the Get started heading, drawn in glyphs on the character grid, with an octopus living in it.
 *
 * The octopus is the brand mark's: a round head with its eyes low on it, and six arms from under it, the upper pair
 * rising, the middle pair reaching out and the lower pair hanging, every one curling outward at the tip. Like the
 * mark it is a field of small glyphs (x + .) on a finer grid of its own, so its shape reads as a shape. Swimming, it
 * jets head first, its head stretching and its arms gathering and trailing behind, then spreads them and glides.
 *
 * It keeps busy with one thing after another, picked at random and never the same twice running: swimming somewhere,
 * hanging in the water with its arms slowly curling, sleeping (z Z), fading into the water and flashing back
 * (octopuses change colour), waving an arm (hi!), peeking at the heading (?), blowing bubbles, and reading a page: a little page floats down, it swims to it and holds it, reads, and the page breaks up into
 * Markdown (# - * >) that drifts away, which is what Octocrawl does. Now and then a fish (><>) comes by and the
 * octopus watches it: it may give chase until the fish darts off, the fish may come over to touch the arm it holds out
 * (<3, waking it if it sleeps), or swim once round it, or just pass and be waved at. Come at it fast with the pointer
 * and it squirts ink and flees; come slowly and it only watches. Touch it (a click or a tap on its body) and it is
 * glad: ^ ^, a heart, and it puffs up for a moment; the third touch in a row turns it a somersault, and seven in ten
 * seconds are too many: a flat look, and it fades into the water for a while. Keep a finger on it and it is tickled
 * (x x), bubbles streaming up. Click the water and it comes to look. It never swims over the words: to cross, it
 * rises above them.
 *
 * Everything sits on a grid, so everything moves a cell at a time. It runs only while on screen and the visitor
 * allows motion; otherwise one still frame shows it resting. */

const SEA_FONT = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace'
const BODY_FONT = '700 7px ui-monospace, SFMono-Regular, Menlo, monospace'
const EYE_FONT = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace'
const LINE = 16
// The octopus's own grid, finer than the sea's.
const CW = 5
const CH = 6
const ORANGE = [243, 104, 61]
const RUST = [184, 70, 29]
const LIGHT = [255, 174, 134]
const SEA = [157, 178, 214]
const NAVY = [20, 37, 74]
const STROKE = 1.9
const MARKDOWN = '#->*`_#'
const INK = '#%*+:..'

// The arms on the right, in head radii and degrees (0 points right, 90 down); the left ones mirror them. Each curls
// clockwise, gently at first and tightly at the tip.
const ARMS = [
  { root: [0.62, 0.8], a0: -78, len: 2.6, turn: 300, r0: 0.26 },
  { root: [0.58, 1.12], a0: -6, len: 2.9, turn: 290, r0: 0.28 },
  { root: [0.32, 1.32], a0: 60, len: 2.4, turn: 245, r0: 0.3 },
] as const
const ARM_STEPS = 36

type Rgb = readonly number[]
type Cell = { glyph: string, color: Rgb, alpha: number, z: number }
type Particle = { x: number, y: number, vx: number, vy: number, born: number, life: number, glyph: string, alpha: number, front?: boolean }
// What a fish is about: passing, darting off, swimming over to visit or to circle the octopus, visiting, circling.
type FishMode = 'pass' | 'flee' | 'visit' | 'circle' | 'meet' | 'orbit'
// A fish by its nose; `dir` is the way it is going, `face` the way it faces, `side` the octopus's side it visits,
// `at` when it set off or arrived.
type Fish = { x: number, y: number, dir: number, face: number, side: number, speed: number, seed: number, big: boolean, mode: FishMode, at: number, angle: number, swept: number, waved: boolean }
type Kind = 'wander' | 'rest' | 'sleep' | 'camo' | 'wave' | 'read' | 'peek' | 'bubbles' | 'chase' | 'meet'
type Page = { x: number, y: number, stop: number, held: boolean, readAt: number }
// `puff` is how swollen with pleasure it is (0 to 1), `roll` how far round a somersault it has turned.
type Pose = { t: number, moving: number, trail: number, stretch: number, heading: number, curl: number, droop: number, wave: boolean, hold: boolean, reach: number, puff: number, roll: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const rad = (d: number) => d * Math.PI / 180
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v + (b[i]! - v) * t)

/** The arms' centre lines for a pose, as points (x, y, radius) from the head's centre. */
function armPoints(pose: Pose, R: number): number[][] {
  const arms: number[][] = []
  for (const side of [1, -1]) {
    ARMS.forEach((arm, n) => {
      let base = side > 0 ? rad(arm.a0) : Math.PI - rad(arm.a0)
      let curl = pose.curl * (0.86 + 0.14 * Math.sin(pose.t * 0.9 + n * 1.7 + side))
      base += side * pose.droop * (n === 2 ? 0.3 : 1)
      // Waving: the upper right arm rises and swings.
      if (pose.wave && side > 0 && n === 0) { base = rad(-104) + Math.sin(pose.t * 8) * 0.42; curl = 0.35 }
      // Holding a page: the lower arms come in under it and curl round it.
      if (pose.hold && n === 2) { base = side > 0 ? rad(100) : Math.PI - rad(100); curl = 1.25 }
      // Greeting a fish: the middle arm on its side reaches out to it.
      if (pose.reach === side && n === 1) { base = side > 0 ? rad(4) : Math.PI - rad(4); curl = 0.25 }
      // Swimming, the arms swing round to trail behind, by way of underneath: measured from straight up, clockwise
      // for the right arms and anticlockwise for the left, so that none sweeps over the head.
      const fromUp = (angle: number) => ((side * (angle + Math.PI / 2) + 0.3) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - 0.3
      const from = fromUp(base)
      let a = side * (from + (fromUp(pose.trail + side * (n - 1) * 0.2) - from) * pose.moving) - Math.PI / 2
      const len = arm.len * R * (1 - pose.moving * 0.1)
      const ds = len / ARM_STEPS
      const turn = rad(arm.turn) * curl * (1 - pose.moving * 0.8)
      const c = turn / len / (0.08 + 1 / 4)
      let x = arm.root[0] * R * side
      let y = arm.root[1] * R
      const points: number[] = []
      for (let k = 0; k <= ARM_STEPS; k++) {
        const s = k / ARM_STEPS
        points.push(x, y, arm.r0 * R * (1 - 0.7 * s))
        const wave = (pose.moving > 0.4 ? 0.01 : 0.006) * Math.sin(pose.t * 2.2 - s * 5 + n * 2.1 + (side > 0 ? 0 : 1.3))
        a += side * (c * (0.08 + s ** 3) + wave) * ds
        x += Math.cos(a) * ds
        y += Math.sin(a) * ds
      }
      arms.push(points)
    })
  }
  return arms
}

export function mountOctopusSwim(head: HTMLElement): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'start-octopus'
  canvas.setAttribute('aria-hidden', 'true')
  head.prepend(canvas)
  const maybe = canvas.getContext('2d')
  if (!maybe) return
  const context: CanvasRenderingContext2D = maybe
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  let width = 0
  let height = 0
  let ratio = 1
  let cw = 8.4
  let cols = 0
  let rows = 0
  let R = 28
  // The words' box, kept clear, and whether there is water beside them or only above.
  let text = { l: 0, t: 0, r: 0, b: 0 }
  let sides = true
  // The octopus by its head's centre.
  const octo = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, flee: 0, gaze: 0, look: 0, eager: false }
  // What it is doing, since when, until when, and when it got where it was going (0 until then).
  const act = { kind: 'rest' as Kind, since: 0, until: 0, at: 0 }
  const face = { eye: 'o', until: 0 }
  let page: Page | null = null
  let fish: Fish | null = null
  let nextFish = 0
  const bubbles: Particle[] = []
  const ink: Particle[] = []
  const plankton: Array<{ x: number, y: number, ox: number, oy: number, seed: number }> = []
  let start = 0
  let last = 0
  let raf = 0
  let lastStroke = -1
  // Where the pointer is, when it last moved, how fast it has been moving (css px per second), and until when a
  // click or a touch has made the octopus calm rather than shy.
  const pointer = { x: -1e4, y: -1e4, at: -1e9, speed: 0, calm: 0 }
  // Being touched: when each touch landed, when a finger came down on it and whether it is still there, how puffed
  // up it is, and when a somersault began (0 for none).
  const pet = { times: [] as number[], down: 0, held: false, puff: 0, rolledAt: 0 }
  const sea = new Map<number, Cell>()
  // The octopus's cells: how much of each it covers, over a box around it.
  let cover = new Float32Array(0)
  let box = { c0: 0, r0: 0, cols: 0, rows: 0 }

  /** The text's own box (not its block's), relative to the head. */
  const textBox = (el: Element | null, origin: DOMRect) => {
    if (!el) return null
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return r.width ? { l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top } : null
  }

  // How far the octopus reaches from its head's centre, arms and all.
  const reach = () => ({ l: 3.3 * R, r: 3.3 * R, t: 1.25 * R, b: 3.1 * R })
  const overText = (x: number, y: number) => {
    const e = reach()
    return x - e.l < text.r + 14 && x + e.r > text.l - 14 && y - e.t < text.b + 8 && y + e.b > text.t - 8
  }
  const side = (x: number) => x < (text.l + text.r) / 2 ? -1 : 1
  // The water above the words, through which it crosses from one side to the other.
  const lane = () => text.t - reach().b - 14
  const canCross = () => lane() >= reach().t + 2
  const fit = (x: number, y: number): [number, number] => {
    const e = reach()
    return [clamp(x, e.l * 0.85, width - e.r * 0.85), clamp(y, e.t + 2, height - e.b)]
  }

  /** Where it starts: beside the words, or above them when there is no water beside them. */
  const home = (): [number, number] => sides ? [text.l / 2, Math.max(reach().t + 2, (text.t + text.b) / 2 - R)] : [reach().l + 4, reach().t + 2]

  /** A spot in the open water, on its own side when it cannot cross. */
  const pick = (): [number, number] => {
    const e = reach()
    for (let i = 0; i < 60; i++) {
      const x = e.l + Math.random() * Math.max(1, width - e.l - e.r)
      const y = e.t + 2 + Math.random() * Math.max(1, (sides ? height : text.t) - e.t - e.b - 4)
      if (overText(x, y)) continue
      if (sides && !canCross() && side(x) !== side(octo.x)) continue
      return [x, y]
    }
    return overText(octo.x, octo.y) ? home() : [octo.x, octo.y]
  }

  const layout = () => {
    const rect = head.getBoundingClientRect()
    width = rect.width
    height = rect.height
    ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.font = SEA_FONT
    cw = context.measureText('M').width
    cols = Math.ceil(width / cw)
    rows = Math.ceil(height / LINE)
    R = width < 720 ? 21 : 27
    const boxes = ['.section-kicker', 'h2', '.start-lead'].map(sel => textBox(head.querySelector(sel), rect)).filter(Boolean) as Array<typeof text>
    if (boxes.length) text = { l: Math.min(...boxes.map(b => b.l)), t: Math.min(...boxes.map(b => b.t)), r: Math.max(...boxes.map(b => b.r)), b: Math.max(...boxes.map(b => b.b)) }
    sides = text.l > reach().l + reach().r + 30
    if (!octo.x && !octo.y) {
      const [x, y] = home()
      Object.assign(octo, { x, y, tx: x, ty: y })
    } else {
      // A resize: back into the water if it is now outside it, and off the words if they moved under it or its spot;
      // then it starts afresh.
      const [x, y] = fit(octo.x, octo.y)
      const [tx, ty] = fit(octo.tx, octo.ty)
      if (x !== octo.x || y !== octo.y || tx !== octo.tx || ty !== octo.ty || overText(x, y) || overText(tx, ty)) {
        Object.assign(octo, { x, y, vx: 0, vy: 0 })
        if (overText(x, y)) [octo.x, octo.y] = pick()
        begin('rest', performance.now())
      }
    }
    plankton.length = 0
    for (let i = 0; i < Math.round(width * height / 26000); i++) plankton.push({ x: Math.random() * width, y: Math.random() * height, ox: 0, oy: 0, seed: Math.random() * 10 })
  }

  const put = (x: number, y: number, glyph: string, color: Rgb, alpha: number, z: number) => {
    const col = Math.round(x / cw)
    const row = Math.round(y / LINE)
    if (col < 0 || row < 0 || col >= cols || row >= rows || alpha <= 0.01) return
    const key = row * 4096 + col
    const had = sea.get(key)
    if (!had || had.z <= z) sea.set(key, { glyph, color, alpha, z })
  }
  const say = (x: number, y: number, words: string, now: number, life = 1.8) => {
    ;[...words].forEach((glyph, i) => bubbles.push({ x: x + i * cw, y, vx: 0, vy: -12, born: now, life, glyph, alpha: 0.78, front: true }))
  }
  const squirt = (now: number) => {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 16 + Math.random() * 64
      ink.push({ x: octo.x, y: octo.y + R, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, born: now, life: 1.6 + Math.random() * 1.6, glyph: '', alpha: 0.7 })
    }
  }
  const feel = (eye: string, now: number, ms: number) => { face.eye = eye; face.until = now + ms }

  /** Something new to do, never the same twice running. */
  const choose = (now: number) => {
    const options: Array<[Kind, number]> = [['wander', 4], ['rest', 2], ['sleep', 1], ['camo', 1], ['wave', 1], ['read', 2], ['peek', 1], ['bubbles', 1]]
    const pool = options.filter(([k]) => k !== act.kind)
    let roll = Math.random() * pool.reduce((sum, [, w]) => sum + w, 0)
    for (const [kind, w] of pool) {
      roll -= w
      if (roll <= 0) return begin(kind, now)
    }
    begin('wander', now)
  }
  // Staying put: where it coasts to.
  const stay = () => { [octo.tx, octo.ty] = fit(octo.x + octo.vx / 1.3, octo.y + octo.vy / 1.3) }
  const begin = (kind: Kind, now: number) => {
    act.kind = kind
    act.since = now
    act.at = 0
    octo.eager = false
    page = null
    if (kind === 'wander') { [octo.tx, octo.ty] = pick(); act.until = now + 14000 }
    if (kind === 'rest') { stay(); act.until = now + 2600 + Math.random() * 2600 }
    if (kind === 'sleep') { stay(); act.until = now + 5500 + Math.random() * 2500 }
    if (kind === 'camo') { stay(); act.until = now + 5600 }
    if (kind === 'bubbles') { stay(); act.until = now + 3200 }
    if (kind === 'wave') { stay(); act.until = now + 3000; say(octo.x + 2.2 * R, octo.y - 1.6 * R, 'hi!', now, 2.4); feel('^', now, 2600) }
    if (kind === 'peek') {
      // Beside the words on its own side, level with the heading, to have a look at them.
      const s = sides ? side(octo.x) : 0
      const x = s < 0 ? text.l - reach().r - 18 : s > 0 ? text.r + reach().l + 18 : octo.x
      ;[octo.tx, octo.ty] = fit(x, sides ? text.t + R * 0.4 : reach().t + 2)
      if (overText(octo.tx, octo.ty)) [octo.tx, octo.ty] = pick()
      act.until = now + 10000
    }
    if (kind === 'read') {
      // A page floats down to a spot in the open water near by; the octopus goes to meet it there.
      const [x, y] = [pick(), pick(), pick(), pick()].reduce((a, b) => Math.hypot(b[0] - octo.x, b[1] - octo.y) < Math.hypot(a[0] - octo.x, a[1] - octo.y) ? b : a)
      page = { x, y: -2 * LINE, stop: y + 1.9 * R, held: false, readAt: 0 }
      octo.tx = x
      octo.ty = y
      act.until = now + 22000
    }
    if (kind === 'chase') act.until = now + 9000
    // A fish's visit: it stays where it is and the fish ends the visit.
    if (kind === 'meet') { stay(); act.until = now + 12000 }
  }
  // Free to give chase; and, short of reading a page or chasing, free to stop for a visiting fish.
  const free = () => act.kind === 'wander' || act.kind === 'rest' || act.kind === 'bubbles'
  const busy = () => act.kind === 'read' || act.kind === 'chase' || act.kind === 'meet'
  // Near enough the words to pass behind them (and not seem stuck to their ends).
  const behindWords = (x: number, y: number) => x > text.l - 20 && x < text.r + 20 && y > text.t - 8 && y < text.b + 8

  /** A touch on its body. It is glad of it and stops for it, unless it is busy with a page or a fish; the third in a
   * run turns it a somersault; too many, and it has had enough. */
  const stroked = (now: number) => {
    pet.times = pet.times.filter(at => now - at < PET.fedUpMs)
    pet.times.push(now)
    pointer.calm = now + PET.calmMs
    const mood = petMood(pet.times, now)
    if (mood === 'fedUp') {
      pet.times.length = 0
      pet.held = false
      feel('-', now, 2800)
      say(octo.x + 1.6 * R, octo.y - 1.8 * R, '...', now, 1.6)
      begin('camo', now)
      return
    }
    if (act.kind === 'sleep' || act.kind === 'camo') say(octo.x + 1.6 * R, octo.y - 1.8 * R, '!', now, 1.2)
    if (act.kind === 'rest' || act.kind === 'bubbles') act.until = Math.max(act.until, now + 2600)
    else if (act.kind !== 'read' && act.kind !== 'meet') begin('rest', now)
    pet.puff = 1
    feel('^', now, 1600)
    say(octo.x + 1.4 * R, octo.y - 1.9 * R, '<3', now, 1.8)
    if (mood === 'roll') { pet.rolledAt = now; say(octo.x - 2 * R, octo.y - 1.9 * R, '!', now, 1.2) }
  }

  function step(now: number) {
    const t = (now - start) / 1000
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now

    // The pointer: watched from afar; coming up fast it startles, squirts ink and flees. A slow or still one, the
    // spot it was called to, or one that has just touched it, does not frighten it.
    const pd = Math.hypot(pointer.x - octo.x, pointer.y - (octo.y + R))
    if (pd < 2.6 * R + 20 && octo.flee <= 0 && now - pointer.at < 300 && startles(pointer.speed) && now > pointer.calm) {
      if (act.kind === 'sleep' || act.kind === 'camo') say(octo.x + 1.6 * R, octo.y - 1.8 * R, '!', now, 1.2)
      squirt(now)
      feel('O', now, 900)
      const away = Math.atan2(octo.y + R - pointer.y, octo.x - pointer.x)
      begin('wander', now)
      let [tx, ty] = fit(octo.x + Math.cos(away) * 380, octo.y + Math.sin(away) * 220)
      if (overText(tx, ty) || (sides && !canCross() && side(tx) !== side(octo.x))) [tx, ty] = pick()
      octo.tx = tx
      octo.ty = ty
      octo.vx += Math.cos(away) * 260
      octo.vy += Math.sin(away) * 180
      octo.eager = true
      octo.flee = 2.4
    }
    octo.flee = Math.max(0, octo.flee - dt)
    const watching = now - pointer.at < 2500 && pd < 340
    // It watches the pointer, the words it came to peek at, a page drifting down to it, or a fish; otherwise where
    // it goes.
    const falling = page && !page.held && act.at ? page : null
    const lookX = watching ? pointer.x - octo.x : act.kind === 'peek' && act.at ? (text.l + text.r) / 2 - octo.x : falling ? falling.x - octo.x : fish ? fish.x - octo.x : octo.vx
    octo.gaze += (clamp(lookX / 40, -1, 1) - octo.gaze) * Math.min(1, dt * 6)
    const lookY = page?.held ? 1 : falling ? -1 : fish && !watching ? clamp((fish.y - octo.y) / (2 * R), -1, 1) : 0
    octo.look += (lookY - octo.look) * Math.min(1, dt * 4)

    // A fish now and then. When the octopus is free it may give chase, or the fish may come over to visit it or swim
    // round it; otherwise the fish passes by.
    if (!fish && now > nextFish) {
      const dir = Math.random() < 0.5 ? 1 : -1
      const y = sides ? 10 + Math.random() * (height - 40) : 10 + Math.random() * Math.max(10, text.t - 30)
      const roll = Math.random()
      const mode: FishMode = busy() ? 'pass' : roll < 0.3 ? (free() ? 'pass' : 'visit') : roll < 0.62 ? 'visit' : roll < 0.84 ? 'circle' : 'pass'
      fish = { x: dir > 0 ? -10 : width + 10, y, dir, face: dir, side: -dir, speed: 46 + Math.random() * 30, seed: Math.random() * 6, big: Math.random() < 0.5, mode, at: now, angle: 0, swept: 0, waved: false }
      if (free() && roll < 0.3) { begin('chase', now); say(octo.x + 1.6 * R, octo.y - 1.8 * R, '!', now, 1.2) }
    }
    if (fish) {
      const f = fish
      // Its friend went off to do something else: it swims on.
      if ((f.mode === 'meet' || f.mode === 'orbit') && act.kind !== 'meet') { f.mode = 'pass'; f.dir = f.face }
      if (f.mode === 'visit' || f.mode === 'circle') {
        // Over to the octopus: beside the arm it will hold out, or onto a ring round it, on whichever side has room.
        const off = (f.mode === 'visit' ? 3.7 : 3.4) * R
        const ty = octo.y + (f.mode === 'visit' ? 1.05 : 0.8) * R
        let s = -f.dir
        const bad = (k: number) => octo.x + k * off < 12 || octo.x + k * off > width - 12 || behindWords(octo.x + k * off, ty)
        if (bad(s) && !bad(-s)) s = -s
        // Round the words, not behind them: up above them first, along, and down the far side.
        let gx = octo.x + s * off
        let gy = ty
        const past = gx < (text.l + text.r) / 2 ? f.x < text.l - 10 : f.x > text.r + 10
        if (sides && !past && ty > text.t - 30) {
          gy = text.t - 30
          if (f.y > text.t - 26) gx = f.x
        }
        const dx = gx - f.x
        const dy = gy - f.y
        const d = Math.hypot(octo.x + s * off - f.x, ty - f.y)
        // An octopus that will not keep still for it, it gives up on.
        if (now - f.at > 14000) { f.mode = 'pass'; f.dir = f.face }
        else if (d < 6) {
          if (busy()) f.mode = 'pass'
          else {
            // Woken by a visitor.
            if (act.kind === 'sleep') say(octo.x + 1.4 * R, octo.y - 1.8 * R, '!', now, 1.2)
            begin('meet', now)
            f.mode = f.mode === 'visit' ? 'meet' : 'orbit'
            f.side = s
            f.at = now
            f.angle = s > 0 ? 0 : Math.PI
            f.swept = 0
          }
        } else {
          const leg = Math.hypot(dx, dy) || 1
          const stepLength = Math.min(leg, f.speed * 1.5 * dt)
          f.x += (dx / leg) * stepLength
          f.y += (dy / leg) * stepLength
          if (Math.abs(dx) > 2) f.face = Math.sign(dx)
        }
      } else if (f.mode === 'meet') {
        // Nose to the tip of the arm the octopus holds out; a bubble, a heart, and off back the way it came.
        f.x = octo.x + f.side * 3.7 * R
        f.y = octo.y + 1.05 * R + Math.sin(t * 3) * 2
        f.face = -f.side
        const age = now - f.at
        const was = age - dt * 1000
        if (age > 500 && was <= 500) bubbles.push({ x: f.x + f.face * cw, y: f.y - LINE * 0.6, vx: 0, vy: -24, born: now, life: 2, glyph: 'o', alpha: 0.5 })
        if (age > 1000 && was <= 1000) { say(octo.x + f.side * 2.4 * R - cw / 2, octo.y + 0.1 * R, '<3', now, 2); feel('^', now, 2200) }
        if (age > 2800) { f.mode = 'pass'; f.dir = f.side; f.face = f.side; act.until = now + 900 }
      } else if (f.mode === 'orbit') {
        // Once round the octopus, which watches it all the way, then on its way.
        const spin = f.side > 0 ? 1 : -1
        f.angle += spin * 1.6 * dt
        f.swept += 1.6 * dt
        const x = octo.x + Math.cos(f.angle) * 3.4 * R
        const y = octo.y + 0.8 * R + Math.sin(f.angle) * 2 * R
        if (Math.abs(x - f.x) > 0.2) f.face = Math.sign(x - f.x)
        f.x = x
        f.y = y
        if (f.swept > Math.PI * 2) { f.mode = 'pass'; f.dir = f.face; act.until = now + 900; feel('^', now, 1400) }
      } else {
        f.x += f.dir * f.speed * (f.mode === 'flee' ? 3 : 1) * dt
        f.y += Math.sin(t * 2.2 + f.seed) * 6 * dt
        const near = Math.hypot(f.x - octo.x, f.y - octo.y)
        // Caught up with, it darts off.
        if (f.mode === 'pass' && act.kind === 'chase' && near < 2.4 * R) { f.mode = 'flee'; begin('rest', now); feel('^', now, 1400) }
        // Going by, it may be waved at.
        if (f.mode === 'pass' && !f.waved && Math.abs(f.x - octo.x) < 3 * R && (act.kind === 'rest' || act.kind === 'bubbles')) {
          f.waved = true
          if (Math.random() < 0.5) begin('wave', now)
        }
        if (f.x < -80 || f.x > width + 80) {
          fish = null
          nextFish = now + 8000 + Math.random() * 9000
          if (act.kind === 'chase') begin('rest', now)
        }
      }
    }

    // The activity's own business.
    const there = Math.hypot(octo.tx - octo.x, octo.ty - octo.y) < 16
    if (there && !act.at) act.at = now
    if (act.kind === 'chase' && fish) {
      ;[octo.tx, octo.ty] = fit(fish.x, fish.y - R)
      octo.eager = true
    }
    if (act.kind === 'wander' && act.at) act.until = Math.min(act.until, act.at + 900)
    if (act.kind === 'sleep') {
      // It sinks a little as it sleeps.
      octo.tx = octo.x
      octo.ty = octo.y
      octo.vy += 6 * dt
      if (Math.floor(t / 0.75) !== Math.floor((t - dt) / 0.75)) say(octo.x + 1.4 * R, octo.y - 1.6 * R, Math.random() < 0.5 ? 'z' : 'Z', now, 2.2)
    }
    if (act.kind === 'bubbles' && Math.floor(t * 5) !== Math.floor((t - dt) * 5)) {
      bubbles.push({ x: octo.x + (Math.random() - 0.5) * R, y: octo.y - 1.2 * R, vx: 0, vy: -32 - Math.random() * 22, born: now, life: 2.6, glyph: Math.random() < 0.35 ? 'O' : 'o', alpha: 0.5 })
    }
    if (act.kind === 'camo' && now - act.since > 4500 && now - act.since - dt * 1000 <= 4500) {
      for (let i = 0; i < 12; i++) bubbles.push({ x: octo.x + (Math.random() - 0.5) * 4 * R, y: octo.y + (Math.random() - 0.3) * 3 * R, vx: 0, vy: -6, born: now + i * 30, life: 0.9, glyph: Math.random() < 0.5 ? '+' : '*', alpha: 0.6, front: true })
    }
    if (act.kind === 'peek' && act.at) {
      if (act.until > act.at + 3000) { act.until = act.at + 3000; say(octo.x + 1.6 * R * side(octo.x) * -1, octo.y - 1.8 * R, '?', now, 1.6) }
    }
    if (act.kind === 'read' && page) {
      if (!page.held) {
        page.y = Math.min(page.y + 60 * dt, page.stop)
        if (page.y >= page.stop - 1 && act.at) { page.held = true; page.readAt = now }
      } else {
        page.x = octo.x
        page.y = octo.y + 1.9 * R
        if (now - page.readAt > 3000) {
          // Read: the page turns into Markdown that drifts away.
          for (let i = 0; i < 12; i++) bubbles.push({ x: page.x + ((i % 4) - 1.5) * cw, y: page.y + (Math.floor(i / 4) - 1) * LINE, vx: (Math.random() - 0.5) * 34, vy: -26 - Math.random() * 30, born: now + i * 50, life: 2.4, glyph: MARKDOWN[i % MARKDOWN.length]!, alpha: 0.72, front: true })
          page = null
          feel('^', now, 1600)
          act.until = now + 1700
        }
      }
    }
    // Touched: it puffs up and settles again, and a somersault ends. Held, it is tickled: it squints, bubbles stream
    // up, and it stays put while the finger does.
    pet.puff = Math.max(0, pet.puff - dt * 1.6)
    if (pet.rolledAt && now - pet.rolledAt > PET.rollMs) pet.rolledAt = 0
    if (pet.held && now - pet.down > PET.holdMs) {
      feel('x', now, 150)
      pointer.calm = now + PET.calmMs
      if (!page?.held) act.until = Math.max(act.until, now + 600)
      if (Math.floor(t * 6) !== Math.floor((t - dt) * 6)) bubbles.push({ x: octo.x + (Math.random() - 0.5) * 2 * R, y: octo.y - 1.2 * R, vx: 0, vy: -30 - Math.random() * 20, born: now, life: 2.2, glyph: Math.random() < 0.3 ? 'O' : 'o', alpha: 0.5 })
    }
    if (now > act.until && !page?.held) choose(now)

    // Where to swim: the target, by way of the water above the words when they stand between.
    let gx = octo.tx
    let gy = octo.ty
    if (sides && side(octo.x) !== side(octo.tx)) {
      const e = reach()
      const past = side(octo.x) < 0 ? octo.x - e.l > text.r + 14 : octo.x + e.r < text.l - 14
      if (!past && octo.y > lane() + 0.6 * R) { gy = lane(); gx = octo.x }
      else if (!past) gy = lane()
    }
    const tdx = gx - octo.x
    const tdy = gy - octo.y
    const tdist = Math.hypot(tdx, tdy)
    // Swimming by strokes: a jet at the start of each, a glide after.
    const stroke = Math.floor(t / STROKE)
    if (stroke !== lastStroke && tdist > 10) {
      lastStroke = stroke
      // Towards a waypoint (the water above the words) it strokes firmly; towards its spot, more gently as it nears.
      const waypoint = gx !== octo.tx || gy !== octo.ty
      const push = clamp(tdist * 0.9, waypoint ? 120 : 40, octo.eager || octo.flee > 0 ? 240 : tdist > 300 ? 200 : 150)
      octo.vx += (tdx / tdist) * push
      octo.vy += (tdy / tdist) * push
      for (let k = 0; k < 1 + (stroke % 2); k++) bubbles.push({ x: octo.x + (k ? cw : 0), y: octo.y - 1.2 * R, vx: 0, vy: -26 - Math.random() * 10, born: now + k * 140, life: 2.4, glyph: 'o', alpha: 0.45 })
    }
    if (tdist <= 10) octo.vy += Math.sin(t * 1.6) * (act.kind === 'sleep' ? 3 : 6) * dt
    const drag = Math.exp(-dt * 1.3)
    octo.vx *= drag
    octo.vy *= drag
    let [nx, ny] = fit(octo.x + octo.vx * dt, octo.y + octo.vy * dt)
    // Never over the words: slide along their edge instead (unless it is already over them, when any move helps).
    if (overText(nx, ny) && !overText(octo.x, octo.y)) {
      if (!overText(nx, octo.y)) { ny = octo.y; octo.vy *= -0.3 }
      else if (!overText(octo.x, ny)) { nx = octo.x; octo.vx *= -0.3 }
      else { nx = octo.x; ny = octo.y; octo.vx *= -0.3; octo.vy *= -0.3 }
    }
    octo.x = nx
    octo.y = ny

    for (const list of [bubbles, ink]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!
        const age = (now - p.born) / 1000
        if (age < 0) continue
        if (age > p.life) { list.splice(i, 1); continue }
        p.vx *= Math.exp(-dt * 1.4)
        if (list === ink) p.vy *= Math.exp(-dt * 1.4)
        p.x += (p.vx + (list === bubbles ? Math.sin(age * 4 + p.life * 3) * 8 : 0)) * dt
        p.y += p.vy * dt
      }
    }
    for (const p of plankton) {
      p.x += Math.sin(t * 0.3 + p.seed) * 3 * dt
      p.y += (2 + Math.cos(t * 0.2 + p.seed) * 2) * dt
      if (p.y > height) p.y = 0
      const dx = p.x + p.ox - octo.x
      const dy = p.y + p.oy - (octo.y + R)
      const d = Math.hypot(dx, dy)
      const near = 3 * R
      if (d < near) { p.ox += (dx / (d || 1)) * (near - d) * dt * 3; p.oy += (dy / (d || 1)) * (near - d) * dt * 3 }
      p.ox *= Math.exp(-dt * 0.8)
      p.oy *= Math.exp(-dt * 0.8)
    }
  }

  /** Fills `cover` with how much of each of its cells the octopus covers in this pose. */
  function shape(pose: Pose) {
    // Trailing, the arms can reach further than at rest, in any direction.
    const far = 3.7 * R
    box = { c0: Math.floor((octo.x - far) / CW), r0: Math.floor((octo.y - far) / CH), cols: Math.ceil(2 * far / CW) + 1, rows: Math.ceil(2 * far / CH) + 1 }
    if (cover.length < box.cols * box.rows) cover = new Float32Array(box.cols * box.rows)
    cover.fill(0, 0, box.cols * box.rows)
    const mark = (c: number, r: number, v: number) => {
      const i = (r - box.r0) * box.cols + (c - box.c0)
      if (c >= box.c0 && r >= box.r0 && c < box.c0 + box.cols && r < box.r0 + box.rows && cover[i]! < v) cover[i] = v
    }
    // The head: round, or stretched along its way as it jets, and a little swollen when touched.
    const swell = 1 + 0.2 * pose.puff
    const along = R * pose.stretch * swell
    const across = R * 1.04 / pose.stretch * swell
    const cos = Math.cos(pose.heading)
    const sin = Math.sin(pose.heading)
    for (let r = Math.floor((octo.y - R * 1.45) / CH); r <= (octo.y + R * 1.45) / CH; r++) {
      for (let c = Math.floor((octo.x - R * 1.45) / CW); c <= (octo.x + R * 1.45) / CW; c++) {
        const x = c * CW - octo.x
        const y = r * CH - octo.y
        const d = (Math.hypot((x * cos + y * sin) / along, (y * cos - x * sin) / across) - 1) * R
        mark(c, r, clamp(0.5 - d / 2.5, 0, 1))
      }
    }
    // Turning a somersault, the arms go round with it.
    const rc = Math.cos(pose.roll)
    const rs = Math.sin(pose.roll)
    for (const points of armPoints(pose, R)) {
      for (let k = 0; k < points.length; k += 3) {
        const X = octo.x + points[k]! * rc - points[k + 1]! * rs
        const Y = octo.y + points[k]! * rs + points[k + 1]! * rc
        const rr = points[k + 2]!
        for (let r = Math.floor((Y - rr - 3) / CH); r <= (Y + rr + 3) / CH; r++) {
          for (let c = Math.floor((X - rr - 3) / CW); c <= (X + rr + 3) / CW; c++) {
            mark(c, r, clamp(0.5 - (Math.hypot(c * CW - X, r * CH - Y) - rr) / 2.5, 0, 1))
          }
        }
      }
    }
  }
  const covered = (c: number, r: number) => {
    if (c < box.c0 || r < box.r0 || c >= box.c0 + box.cols || r >= box.r0 + box.rows) return 0
    return cover[(r - box.r0) * box.cols + (c - box.c0)]!
  }
  /** Whether a point (css px from the head's corner) is on the octopus, as last drawn. */
  const onBody = (x: number, y: number) => covered(Math.round(x / CW), Math.round(y / CH)) > 0.3

  function render(now: number, still = false) {
    const t = still ? 1.4 : (now - start) / 1000
    const speed = Math.hypot(octo.vx, octo.vy)
    const phase = (t % STROKE) / STROKE
    const moving = still ? 0 : clamp((speed - 10) / 70, 0, 1) * (phase < 0.3 ? 1 : 0.75)
    const jetting = moving > 0.35 && phase < 0.3
    const sleeping = !still && act.kind === 'sleep'
    let hide = 0
    if (!still && act.kind === 'camo') {
      const a = (now - act.since) / 1000
      hide = a < 1.6 ? a / 1.6 : a < 4 ? 1 : a < 4.5 ? 1 - (a - 4) / 0.5 : 0
    }
    const pose: Pose = {
      t,
      moving,
      trail: speed > 8 ? Math.atan2(-octo.vy, -octo.vx) : Math.PI / 2,
      stretch: jetting ? 1.16 : 1,
      heading: Math.atan2(octo.vy, octo.vx),
      curl: sleeping ? 0.7 : 1,
      droop: sleeping ? 0.45 : 0,
      wave: !still && act.kind === 'wave',
      hold: !still && !!page?.held,
      reach: !still && fish?.mode === 'meet' ? fish.side : 0,
      puff: still ? 0 : pet.puff,
      roll: !still && pet.rolledAt ? rollAngle(now - pet.rolledAt) : 0,
    }
    shape(pose)

    // The sea, behind the octopus.
    sea.clear()
    for (const p of plankton) {
      const x = p.x + p.ox
      const y = p.y + p.oy
      if (x > text.l - 10 && x < text.r + 10 && y > text.t - 6 && y < text.b + 6) continue
      put(x, y, '·', NAVY, 0.22, 1)
    }
    if (sides) {
      const kelp = [[0.05, 7], [0.1, 5], [0.15, 6], [0.85, 6], [0.9, 8], [0.95, 5]] as const
      kelp.forEach(([fx, tall], n) => {
        for (let j = 0; j < tall; j++) {
          // A stalk zigzags ( then ) up from the floor, and sways more towards its tip.
          const sway = Math.sin(t * 1.1 + j * 0.55 + n * 1.7) * (j / tall) * 1.6
          const zig = (j + n) % 2
          put(fx * width + (zig + sway) * cw, height - (j + 1) * LINE, j === tall - 1 ? '\'' : zig ? ')' : '(', NAVY, 0.32 - j * 0.025, 2)
        }
      })
    }
    if (!still) {
      for (const p of bubbles) {
        const f = (now - p.born) / 1000 / p.life
        if (f < 0) continue
        const glyph = p.glyph === 'o' ? (f < 0.3 ? '.' : f < 0.7 ? 'o' : '°') : p.glyph
        put(p.x, p.y, glyph, NAVY, p.alpha * (1 - f * f), p.front ? 60 : 10)
      }
      // The fish, drawn back from its nose, passes behind the words.
      if (fish) {
        const look = fish.big ? (fish.face > 0 ? '><(((°>' : '<°)))><') : (fish.face > 0 ? '><>' : '<><')
        const tail = fish.face > 0 ? fish.x - (look.length - 1) * cw : fish.x
        ;[...look].forEach((g, i) => { const x = tail + i * cw; if (!behindWords(x, fish!.y)) put(x, fish!.y, g, NAVY, 0.6, 20) })
      }
      // The page in front, whole, whether it floats or is held.
      if (page) ['.-,', '|=|', '\'-\''].forEach((line, r) => [...line].forEach((g, c) => put(page!.x + (c - 1) * cw, page!.y + (r - 1) * LINE, g, NAVY, 0.72, 55)))
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.textBaseline = 'middle'
    context.textAlign = 'center'
    const fill = (color: Rgb, alpha: number) => `rgba(${color.map(Math.round).join(',')},${alpha.toFixed(3)})`
    const drawSea = (front: boolean) => {
      context.font = SEA_FONT
      for (const [key, cell] of sea) {
        if ((cell.z >= 50) !== front) continue
        const x = (key % 4096) * cw
        const y = Math.floor(key / 4096) * LINE
        if (!front && covered(Math.round(x / CW), Math.round(y / CH)) > 0.3) continue
        context.fillStyle = fill(cell.color, cell.alpha)
        context.fillText(cell.glyph, x, y)
      }
    }
    drawSea(false)

    // The octopus: dense glyphs inside, lighter at the edge, its underside darker, its crown lit, and now and then a
    // wave of colour passing over it, as over a real one.
    const rc = Math.cos(pose.roll)
    const rs = Math.sin(pose.roll)
    const eyes = [-1, 1].map(s => [Math.round((octo.x + s * 0.36 * R * rc - 0.5 * R * rs) / CW), Math.round((octo.y + s * 0.36 * R * rs + 0.5 * R * rc) / CH)] as const)
    const inEye = (c: number, r: number) => eyes.some(([ec, er]) => Math.abs(c - ec) <= 1 && r >= er - 1 && r <= er)
    const body = mix(ORANGE, SEA, hide * 0.9)
    const under = mix(RUST, SEA, hide * 0.9)
    const alpha = 0.92 * (1 - hide * 0.62)
    context.font = BODY_FONT
    for (let r = box.r0; r < box.r0 + box.rows; r++) {
      for (let c = box.c0; c < box.c0 + box.cols; c++) {
        const v = covered(c, r)
        if (v < 0.12 || inEye(c, r)) continue
        let glyph = v > 0.75 ? ((c + r) % 2 ? 'x' : '+') : v > 0.4 ? '+' : '.'
        if (hide > 0.5 && v > 0.4) glyph = (c + r) % 2 ? ':' : '.'
        let color = body
        if (covered(c, r + 1) < 0.4) color = under
        else if (hide < 0.2 && covered(c, r - 2) < 0.3 && r * CH < octo.y) color = LIGHT
        else if (!still && hide === 0 && Math.sin(c * 0.45 + r * 0.3 - t * 2.4) > 0.93) { glyph = '*'; color = under }
        context.fillStyle = fill(color, alpha)
        context.fillText(glyph, c * CW, r * CH)
      }
    }
    // Its eyes, looking where it goes, at the pointer, at the words, or down at a page; blinking now and then.
    const blink = !still && (t % 4.7) < 0.13
    const eye = sleeping || blink ? '-' : now < face.until ? face.eye : 'o'
    const gaze = clamp(Math.round(octo.gaze), -1, 1)
    context.font = EYE_FONT
    context.fillStyle = fill(NAVY, 0.95 * Math.max(0.4, 1 - hide * 0.6))
    for (const [ec, er] of eyes) context.fillText(eye, (ec + gaze) * CW, (er - 0.5 + Math.round(octo.look) * 0.5) * CH)

    // Ink over everything it hides behind.
    if (!still) {
      context.font = BODY_FONT
      for (const p of ink) {
        const f = (now - p.born) / 1000 / p.life
        if (f < 0) continue
        context.fillStyle = fill(NAVY, p.alpha * (1 - f))
        context.fillText(INK[Math.min(INK.length - 1, Math.floor(f * INK.length))]!, Math.round(p.x / CW) * CW, Math.round(p.y / CH) * CH)
      }
    }
    drawSea(true)
  }

  const loop = (now: number) => {
    step(now)
    render(now)
    raf = requestAnimationFrame(loop)
  }
  const still = () => { layout(); render(performance.now(), true) }

  new ResizeObserver(() => { layout(); if (reduced.matches) still() }).observe(head)
  head.addEventListener('pointermove', (event) => {
    const rect = head.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const now = performance.now()
    const dt = now - pointer.at
    // Its speed, smoothed over the last few moves; a pointer that has just arrived has none.
    pointer.speed = pointer.x > -1e3 && dt > 0 && dt < 200 ? pointer.speed * 0.6 + (Math.hypot(x - pointer.x, y - pointer.y) / dt) * 400 : 0
    pointer.x = x
    pointer.y = y
    pointer.at = now
    head.style.cursor = !reduced.matches && onBody(x, y) ? 'pointer' : ''
  })
  const release = () => {
    if (!pet.held) return
    pet.held = false
    if (performance.now() - pet.down > PET.holdMs) feel('^', performance.now(), 1000)
  }
  head.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; pointer.speed = 0; head.style.cursor = ''; release() })
  head.addEventListener('pointerup', release)
  head.addEventListener('pointercancel', release)
  // A touch on the octopus; or a click in the water, and it comes to look. Only the main button, or a finger: a
  // context menu would swallow the release.
  head.addEventListener('pointerdown', (event) => {
    if (reduced.matches || event.button !== 0) return
    const now = performance.now()
    const rect = head.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    if (onBody(px, py)) { pet.down = now; pet.held = true; stroked(now); return }
    const [x, y] = fit(px, py - R)
    if (overText(x, y) || (sides && !canCross() && side(x) !== side(octo.x))) return
    begin('wander', now)
    octo.tx = x
    octo.ty = y
    octo.eager = true
    pointer.calm = now + 4000
  })
  layout()
  start = performance.now()
  nextFish = start + 9000
  begin('rest', start)
  act.until = start + 1800
  still()
  whenVisible(head, () => { layout(); last = 0; raf = requestAnimationFrame(loop) }, () => { cancelAnimationFrame(raf) })
}
