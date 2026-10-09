/* The sea's other creatures (octopusSwim.ts), the parts of them that can be kept pure and tested: a crab on the
 * floor that raises its claws when the octopus comes low near it (and is given a wide berth: it is the site's
 * robots.txt), a shoal of fish the octopus maps when one passes: dotted lines run from its arm to each fish, and
 * it reads them one by one, which is what a crawl does; a jellyfish, a page that needs a browser, which the octopus
 * can read only once it has rendered; a ray, which is only scenery; and a sea anemone, the octopus's cache and its
 * hiding place. */

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
export const CRAB = { nearR: 3.5, lowR: 1.8 } as const

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

/** A jellyfish: a page that needs a browser to render. It rises slowly through the water, its bell opening and
 * closing; the octopus that stops for it waits a couple of pulses for the page to render, then gets structured data
 * ({ }) from it. */
export const JELLY = {
  /** One pulse, ms: the bell opens over the first part and closes over the rest. */
  pulseMs: 2400,
  /** How fast it rises (css px per second), and how long after one has gone the next comes. */
  rise: 9,
  everyMs: [45000, 75000] as const,
  /** The pulses the octopus waits through, and how long the { } takes to reach it. */
  waitPulses: 2,
  giveMs: 1400,
} as const

/** How open the bell is `age` ms into the jellyfish's life, 0 (closed) to 1 (open): a quick opening, a slower close. */
export function jellyOpen(age: number): number {
  const f = (((age % JELLY.pulseMs) + JELLY.pulseMs) % JELLY.pulseMs) / JELLY.pulseMs
  return f < 0.3 ? Math.sin((f / 0.3) * Math.PI / 2) : Math.cos(((f - 0.3) / 0.7) * Math.PI / 2)
}

/** The jellyfish's rows, top down, for how open its bell is and which way its tentacles hang (`sway` 0 or 1). Each
 * row is drawn centred on the same column. */
export function jellyRows(open: number, sway: number): string[] {
  const bell = open > 0.66 ? ['.-~~-.', '(      )'] : open > 0.33 ? ['.-~-.', '(    )'] : ['.-.', '(  )']
  return [...bell, sway ? '; | ;' : '| ; |', sway ? ' ; | ' : ' | ; ']
}

/** Where the octopus's wait for a jellyfish's page is, `age` ms after it stopped for it: still rendering, the { }
 * on its way (0 to 1), and whether it is done. */
export function renderState(age: number): { rendering: boolean, give: number, done: boolean } {
  const wait = JELLY.waitPulses * JELLY.pulseMs
  return { rendering: age < wait, give: age < wait ? 0 : Math.min(1, (age - wait) / JELLY.giveMs), done: age >= wait + JELLY.giveMs }
}

/** A ray: big, slow and faint, gliding through the water above the words now and then, its wings rising and
 * falling. Only scenery: it goes its way and nothing reacts to it. */
export const RAY = {
  /** Its speed (css px per second), how long after one has gone the next comes, and one wingbeat (ms). */
  speed: 22,
  everyMs: [70000, 120000] as const,
  beatMs: 3200,
} as const

const RAY_WIDTH = 15
// Facing left: wings spread, half way, folded.
const RAY_FRAMES = [
  ['   .-.', " .'   '-._", '<  ° °    >---~', " '.   _.-'", "   '-'"],
  ['', " .'''''-._", '<  ° °    >---~', " '.....-'", ''],
  ['', '  .----._', '<  ° °    >---~', "  '----'", ''],
].map(rows => rows.map(row => row.padEnd(RAY_WIDTH)))
const MIRROR: Record<string, string> = { '<': '>', '>': '<', '/': '\\', '\\': '/', '(': ')', ')': '(' }

/** The ray's rows, top down, facing `dir` (1 right, -1 left) at wingbeat phase `beat` (0 to 1): wings spread, half
 * way, folded, half way. Every row is the same width, so the ray holds its cells; its nose leads, its tail trails. */
export function rayRows(dir: number, beat: number): string[] {
  const f = ((beat % 1) + 1) % 1
  const frame = RAY_FRAMES[f < 0.25 ? 0 : f < 0.5 ? 1 : f < 0.75 ? 2 : 1]!
  return dir > 0 ? frame.map(row => [...row].reverse().map(g => MIRROR[g] ?? g).join('')) : frame
}

/** A sea anemone: fixed on the floor on the side away from the crab. It is the octopus's cache. Now and then, after
 * reading a page, the octopus takes what it read to the anemone and tucks it in (a few # sink into it and its
 * tentacles glow); and frightened, it hides in it, the tentacles closing over it, until the fright has passed. */
export const ANEMONE = {
  /** One sway of its tentacles, ms. */
  swayMs: 2600,
  /** The share of pages read that the octopus takes to it, and how long tucking one in takes. */
  storeShare: 0.35,
  storeMs: 1400,
  /** How long it hides in it. */
  hideMs: 3200,
} as const

/** The anemone's rows, top down, at sway phase `sway` (0 to 1), with its tentacles open or `closed` over something
 * hiding in it. Every row is the same width, centred on the same column, so it holds its cells. */
export function anemoneRows(sway: number, closed: boolean): string[] {
  if (closed) return [' .^^^. ', ' )|||( ', '  (_)  ']
  const f = ((sway % 1) + 1) % 1
  // Its tentacles open wide, then draw in.
  return f < 0.5 ? ['\\  |  /', ' \\ | / ', '  (_)  '] : [' \\ | / ', '  \\|/  ', '  (_)  ']
}

/** How a store is going `age` ms after the octopus reached the anemone: how far the # have sunk (0 to 1), how
 * brightly its tentacles glow (0 to 1), and whether it is done. */
export function storeState(age: number): { sink: number, glow: number, done: boolean } {
  const f = Math.max(0, age) / ANEMONE.storeMs
  return { sink: Math.min(1, f / 0.6), glow: f < 0.5 ? 0 : f < 0.7 ? (f - 0.5) / 0.2 : Math.max(0, 1 - (f - 0.7) / 0.3), done: f >= 1 }
}
