/* The sea's other creatures (octopusSwim.ts), the parts of them that can be kept pure and tested: a crab on the
 * floor that raises its claws when the octopus comes low near it (and is given a wide berth: it is the site's
 * robots.txt), and a shoal of fish the octopus maps when one passes: dotted lines run from its arm to each fish, and
 * it reads them one by one, which is what a crawl does. */

export const SHOAL = {
  /** How many fish make a shoal. */
  min: 3,
  max: 5,
  /** Cells from one fish to the next along the way they swim. */
  gap: 4,
  /** How long the lines run to the fish before the first is read, how long each fish's reading takes, and how long
   * of that it shows as read; then a moment before the shoal swims on. */
  linkMs: 1300,
  readEveryMs: 450,
  readMs: 300,
  restMs: 400,
} as const

/** A crab raises its claws at an octopus this near along the floor whose arms come this close to it. */
export const CRAB = { nearR: 4.5, lowR: 2.6 } as const

/** Where each fish of a shoal of `n` swims, in cells behind the leader (dc, never negative) and rows off its line
 * (dr): a chevron, the leader at its point. */
export function shoalSlots(n: number): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => [i * SHOAL.gap, i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2)])
}

/** Whether a crab at `crabX` on the floor at `floorY` raises its claws at an octopus at `octoX` whose arms reach
 * down to `octoBottom`, with head radius `R`: it has to be near along the floor and low in the water. */
export function crabAlarmed(crabX: number, floorY: number, octoX: number, octoBottom: number, R: number): boolean {
  return Math.abs(crabX - octoX) < CRAB.nearR * R && octoBottom > floorY - CRAB.lowR * R
}

/** The cells of a dotted line from one cell to another, every other cell along the way, neither end included. */
export function linkCells(c0: number, r0: number, c1: number, r1: number): Array<[number, number]> {
  const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))
  const cells: Array<[number, number]> = []
  for (let k = 2; k < steps; k += 2) cells.push([Math.round(c0 + (c1 - c0) * k / steps), Math.round(r0 + (r1 - r0) * k / steps)])
  return cells
}

export type ReadState = {
  /** The lines to the fish are showing. */
  linking: boolean
  /** The fish being shown as read right now, or -1. */
  reading: number
  /** The reading is over and the shoal may swim on. */
  done: boolean
}

/** Where the mapping of a shoal of `n` is, `age` ms after it began. */
export function readState(age: number, n: number): ReadState {
  const end = SHOAL.linkMs + n * SHOAL.readEveryMs
  const since = age - SHOAL.linkMs
  const index = since >= 0 ? Math.floor(since / SHOAL.readEveryMs) : -1
  const flashing = index >= 0 && index < n && since - index * SHOAL.readEveryMs < SHOAL.readMs
  return { linking: age < end, reading: flashing ? index : -1, done: age >= end + SHOAL.restMs }
}
