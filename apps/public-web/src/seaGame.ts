/* The octopus game's rules (octopusGame.ts draws it), kept pure so they can be tested. The octopus swims a sea of
 * glyphs for a minute and reads what it catches: a fish (><>) is a page, a big one with braces (><{{°>) is a page of
 * structured data and counts three. The sea follows the rules a polite crawler does. A crab guards a stretch of floor
 * marked disallow, the site's robots.txt: fish in it cannot be read, and an octopus that goes in gets pinched and
 * loses a life. A jellyfish stings: the octopus cannot move for two seconds, as a page that will not render holds a
 * crawler up. Read three pages inside a second and the sea answers 429: the octopus is slowed for two seconds. Ink is
 * a dash with a moment's cover from both, and takes a few seconds to come back. Every place and size is in cells of
 * the glyph grid; time is in milliseconds. */

export const GAME = {
  seconds: 60,
  lives: 3,
  /** Swimming: how hard the octopus pushes (cells/s²), how quickly the water slows it (per second), its top speed
   * (cells/s), and how much of that it keeps while rate limited. */
  push: 110,
  drag: 2.4,
  topSpeed: 24,
  limited: 0.4,
  /** Its body, in cells. */
  octoW: 7,
  octoH: 4,
  inkMs: 1100,
  inkCooldownMs: 3500,
  inkDash: 34,
  stungMs: 2000,
  slowMs: 2000,
  /** After a pinch or a sting, how long nothing else can hurt it. */
  graceMs: 1500,
  rateWindowMs: 1000,
  rateLimit: 3,
  /** The crab's stretch of floor: this share of the width, this many rows tall. */
  zoneShare: 0.3,
  zoneRows: 5,
  bigShare: 0.18,
  maxJellies: 3,
} as const

export type Kind = 'fish' | 'big' | 'jelly'
export type Thing = { id: number, kind: Kind, x: number, y: number, vx: number, vy: number, w: number, h: number, seed: number }
export type Octo = { x: number, y: number, vx: number, vy: number, stungUntil: number, slowUntil: number, inkUntil: number, inkReadyAt: number, graceUntil: number }
export type Zone = { x0: number, x1: number, y0: number, y1: number }
export type State = {
  t: number, cols: number, rows: number, octo: Octo, things: Thing[], zone: Zone, crabX: number, crabDir: number,
  score: number, pages: number, structured: number, pinched: number, stung: number, limited: number, lives: number,
  caughtAt: number[], nextFish: number, nextJelly: number, nextId: number, over: boolean, random: () => number,
}
export type GameEvent =
  | { type: 'catch', x: number, y: number, points: number }
  | { type: '429' | 'stung' | 'pinched' | 'ink', x: number, y: number }
  | { type: 'over' }
/** Where the player is steering, -1 to 1 each way, and whether ink was asked for this step. */
export type Steer = { x: number, y: number, ink: boolean }

/** A small seeded random source (mulberry32), so a game can be replayed in a test. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const overlaps = (a: { x: number, y: number, w: number, h: number }, b: { x: number, y: number, w: number, h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const inZone = (z: Zone, x: number, y: number) => x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1
/** The octopus's body as a box, by its top-left corner. */
export const octoBox = (o: Octo) => ({ x: o.x, y: o.y, w: GAME.octoW, h: GAME.octoH })

/** A new game on a field `cols` × `rows` cells: the octopus in the middle, the crab's floor on one side. */
export function newGame(cols: number, rows: number, random: () => number = Math.random): State {
  const zw = Math.max(10, Math.round(cols * GAME.zoneShare))
  const right = random() < 0.5
  const zone = { x0: right ? cols - zw : 0, x1: right ? cols : zw, y0: rows - GAME.zoneRows, y1: rows }
  return {
    t: 0, cols, rows, things: [], zone, crabX: (zone.x0 + zone.x1) / 2, crabDir: 1,
    octo: { x: cols / 2 - GAME.octoW / 2, y: rows / 2 - GAME.octoH, vx: 0, vy: 0, stungUntil: 0, slowUntil: 0, inkUntil: 0, inkReadyAt: 0, graceUntil: 0 },
    score: 0, pages: 0, structured: 0, pinched: 0, stung: 0, limited: 0, lives: GAME.lives,
    caughtAt: [], nextFish: 300, nextJelly: 6000, nextId: 1, over: false, random,
  }
}

/** How far through the game it is, 0 to 1; the sea gets busier as it goes. */
const progress = (s: State) => Math.min(1, s.t / (GAME.seconds * 1000))

function spawn(s: State): void {
  const p = progress(s)
  while (s.t >= s.nextFish) {
    const big = s.random() < GAME.bigShare
    const dir = s.random() < 0.5 ? 1 : -1
    const w = big ? 6 : 3
    const speed = (big ? 5 : 7) + s.random() * (big ? 3 : 6) + p * 4
    const y = 2 + Math.floor(s.random() * Math.max(1, s.rows - 4))
    s.things.push({ id: s.nextId++, kind: big ? 'big' : 'fish', x: dir > 0 ? -w : s.cols, y, vx: dir * speed, vy: 0, w, h: 1, seed: s.random() * 6 })
    s.nextFish += 900 - 450 * p + s.random() * 400
  }
  while (s.t >= s.nextJelly) {
    if (s.things.filter(t => t.kind === 'jelly').length < GAME.maxJellies) {
      const x = 2 + s.random() * Math.max(1, s.cols - 9)
      s.things.push({ id: s.nextId++, kind: 'jelly', x, y: s.rows, vx: (s.random() - 0.5) * 2, vy: -(2.5 + s.random() * 2 + p * 2), w: 5, h: 3, seed: s.random() * 6 })
    }
    s.nextJelly += 7000 - 3500 * p + s.random() * 2000
  }
}

/** Moves the game on by `dt` ms with the player steering as given, and says what happened. */
export function step(s: State, steer: Steer, dt: number): GameEvent[] {
  const events: GameEvent[] = []
  if (s.over) return events
  s.t += dt
  const sec = dt / 1000
  const o = s.octo
  const centre = () => ({ x: o.x + GAME.octoW / 2, y: o.y + GAME.octoH / 2 })

  // Ink: a dash the way it is steering (up, if it is not), and cover for a moment.
  if (steer.ink && s.t >= o.inkReadyAt && s.t >= o.stungUntil) {
    const len = Math.hypot(steer.x, steer.y)
    const [dx, dy] = len > 0.1 ? [steer.x / len, steer.y / len] : [0, -1]
    o.vx = dx * GAME.inkDash
    o.vy = dy * GAME.inkDash
    o.inkUntil = s.t + GAME.inkMs
    o.inkReadyAt = s.t + GAME.inkCooldownMs
    events.push({ type: 'ink', ...centre() })
  }

  // Swimming: pushed by the steering, slowed by the water, held by a sting.
  const stung = s.t < o.stungUntil
  const top = GAME.topSpeed * (s.t < o.slowUntil ? GAME.limited : 1) * (s.t < o.inkUntil ? 1.5 : 1)
  if (!stung) {
    const len = Math.max(1, Math.hypot(steer.x, steer.y))
    o.vx += (steer.x / len) * GAME.push * sec
    o.vy += (steer.y / len) * GAME.push * sec
  }
  const drag = Math.exp(-GAME.drag * sec * (stung ? 2 : 1))
  o.vx *= drag
  o.vy *= drag
  const speed = Math.hypot(o.vx, o.vy)
  if (speed > top) { o.vx *= top / speed; o.vy *= top / speed }
  o.x = Math.max(0, Math.min(s.cols - GAME.octoW, o.x + o.vx * sec))
  o.y = Math.max(1, Math.min(s.rows - GAME.octoH, o.y + o.vy * sec))

  spawn(s)
  for (const t of s.things) {
    t.x += t.vx * sec
    t.y += t.vy * sec + (t.kind === 'jelly' ? Math.sin(s.t / 600 + t.seed) * 0.6 * sec : 0)
  }
  s.things = s.things.filter(t => t.x > -t.w - 2 && t.x < s.cols + 2 && t.y > -t.h - 1 && t.y <= s.rows + 1)

  // The crab walks its floor.
  s.crabX += s.crabDir * 3 * sec
  if (s.crabX < s.zone.x0 + 2 || s.crabX > s.zone.x1 - 6) { s.crabDir *= -1; s.crabX = Math.max(s.zone.x0 + 2, Math.min(s.zone.x1 - 6, s.crabX)) }

  const box = octoBox(o)
  const covered = s.t < o.inkUntil
  const graced = s.t < o.graceUntil

  // Into the crab's floor: pinched, a life lost, and sent back up.
  if (!covered && !graced && overlaps(box, { x: s.zone.x0, y: s.zone.y0, w: s.zone.x1 - s.zone.x0, h: s.zone.y1 - s.zone.y0 })) {
    s.lives--
    s.pinched++
    o.graceUntil = s.t + GAME.graceMs
    o.vy = -GAME.topSpeed
    events.push({ type: 'pinched', ...centre() })
  }

  // Fish read, or a jellyfish's sting.
  const caught: Thing[] = []
  for (const t of s.things) {
    if (!overlaps(box, t)) continue
    if (t.kind === 'jelly') {
      if (covered || graced || stung) continue
      o.stungUntil = s.t + GAME.stungMs
      o.graceUntil = s.t + GAME.stungMs + 500
      s.stung++
      events.push({ type: 'stung', ...centre() })
      continue
    }
    if (inZone(s.zone, t.x + t.w / 2, t.y)) continue
    caught.push(t)
  }
  for (const t of caught) {
    const points = t.kind === 'big' ? 3 : 1
    s.score += points
    s.pages++
    if (t.kind === 'big') s.structured++
    events.push({ type: 'catch', x: t.x + t.w / 2, y: t.y, points })
    s.caughtAt = s.caughtAt.filter(at => s.t - at < GAME.rateWindowMs)
    s.caughtAt.push(s.t)
    if (s.caughtAt.length >= GAME.rateLimit) {
      s.caughtAt.length = 0
      o.slowUntil = s.t + GAME.slowMs
      s.limited++
      events.push({ type: '429', ...centre() })
    }
  }
  if (caught.length) s.things = s.things.filter(t => !caught.includes(t))

  if (s.lives <= 0 || s.t >= GAME.seconds * 1000) {
    s.over = true
    s.lives = Math.max(0, s.lives)
    events.push({ type: 'over' })
  }
  return events
}

/** The seconds left, rounded up, for the clock. */
export const secondsLeft = (s: State) => Math.max(0, Math.ceil(GAME.seconds - s.t / 1000))
