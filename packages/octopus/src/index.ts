/** The octopus that crawls a page while Octocrawl reads it, without the DOM: its glyphs, how far it may go given
 * what the run has reported, and the cells of one frame. The website's crawl window draws it on a canvas
 * (apps/public-web/src/crawlView.ts); anything else that shows a run draws the same cells its own way. It has no
 * dependencies and touches no global, so it runs in a browser and in Node alike. */

/** What the run reported while it went (packages/public-preview, PreviewStage), in the order it does. */
export type StageEvent = { stage: 'started' } | { stage: 'robots'; allowed: boolean; unreachable?: true } | { stage: 'page' }
export type CrawlStage = StageEvent['stage']

/** How far down the page (0 to 1) the octopus may crawl. It never runs ahead of what the server has reported: it
 * waits at the door until robots.txt lets it in, and only the result lets it reach the foot. */
export function crawlCap(seen: ReadonlySet<CrawlStage>, robotsAllowed: boolean | null, done: boolean): number {
  if (done) return 1
  if (robotsAllowed === false) return 0
  if (seen.has('page')) return 0.9
  if (seen.has('robots')) return 0.35
  return 0
}

/** Whether the content the octopus passes may dissolve: only once the result says the page was read. The `page`
 * stage is not enough: the server receives a challenge page or an empty shell too, and refuses it after. */
export function mayRead(pageRead: boolean): boolean {
  return pageRead
}

/** The progress bar's steps, in order: the request was taken, robots.txt read, the page read, the result back. */
export const PROGRESS_STEPS = ['started', 'robots', 'page', 'result'] as const

/** How many of the bar's steps the server has completed. Steps are counted only when reported, never estimated. */
export function stepsDone(seen: ReadonlySet<CrawlStage>, done: boolean): number {
  return PROGRESS_STEPS.filter(step => step === 'result' ? done : seen.has(step)).length
}

/** What the server is doing, said plainly from the last thing it reported. */
export function stageLabel(seen: ReadonlySet<CrawlStage>, robotsAllowed: boolean | null, robotsUnreachable = false): string {
  if (robotsAllowed === false) return robotsUnreachable ? 'robots.txt could not be read · not fetching' : 'robots.txt disallows this page'
  if (seen.has('page')) return 'Page received · checking it'
  if (seen.has('robots')) return 'robots.txt allows it · fetching the page'
  if (seen.has('started')) return 'Checking robots.txt'
  return 'Sending the link'
}

// The octopus: its mantle, eyes (O) and two strides of arms.
export const MANTLE: readonly string[] = [
  '    ,=####=,    ',
  '  ,##########,  ',
  ' =###O####O###= ',
  ' =############= ',
  '  \\##########/  ',
]
export const ARMS: ReadonlyArray<readonly string[]> = [[
  '  /x/ x||x \\x\\  ',
  ' / /  x||x  \\ \\ ',
  ' + :  : :: :  + ',
], [
  '  \\x\\ x||x /x/  ',
  '   \\ \\x||x/ /   ',
  '  :  + :: +  :  ',
]]
// Landing: squashed flat, arms splayed.
export const SQUASH: readonly string[] = [
  '   ,=########=,   ',
  ' =####O####O####= ',
  '=################=',
  ' \\##############/ ',
  '/x/x/ x||||x \\x\\x\\',
]
/** The octopus standing: its width in cells, and its height (mantle and arms). */
export const SPRITE_W = MANTLE[0]!.length
export const SPRITE_H = MANTLE.length + ARMS[0]!.length

export interface PoseInput {
  /** The clock, in ms: it sets the stride and the blink, so one clock always gives one pose. */
  now: number
  /** The run failed: it walks slowly on the spot and blinks long. */
  failed?: boolean
  /** Ms since it landed at the foot of the page; left out (or negative) before it has. */
  sinceLanding?: number
  /** How far through its last drop to the foot it is, 0 to 1; left out when it is not dropping. */
  drop?: number
}

export interface Pose {
  /** The octopus's rows, top to bottom; `O` marks an eye. */
  lines: readonly string[]
  /** Where the first row sits against the standing octopus's top row, in rows (negative is higher). */
  rowOffset: number
  /** Where the first column sits against the standing octopus's left column, in cells. */
  colOffset: number
  /** How many of the rows, from the top, are mantle; the rest are arms. */
  mantleRows: number
  eyes: 'open' | 'blink' | 'squint'
}

/** How the octopus holds itself at one moment. Landing: squashed flat with its eyes screwed shut, a short hop back
 * up, then itself, eyes still shut a moment. Dropping fast, it stretches a row taller. */
export function octopusPose(input: PoseInput): Pose {
  const since = input.sinceLanding ?? -1
  const failed = input.failed === true
  const squashed = since >= 0 && since < 200
  const hopping = since >= 200 && since < 320
  const squint = since >= 0 && since < 400
  const stride = Math.floor(input.now / (failed ? 520 : 240)) % 2
  const blink = !squint && (failed ? Math.floor(input.now / 700) % 3 === 0 : (input.now % 2600) < 140)
  const stretched = (input.drop ?? 0) > 0.6
  const arms = ARMS[stride]!
  return {
    lines: squashed ? SQUASH : stretched ? [...MANTLE.slice(0, 4), MANTLE[3]!, MANTLE[4]!, ...arms] : [...MANTLE, ...arms],
    rowOffset: squashed ? SPRITE_H - SQUASH.length : stretched || hopping ? -1 : 0,
    colOffset: squashed ? -1 : 0,
    mantleRows: squashed ? SQUASH.length : MANTLE.length + (stretched ? 1 : 0),
    eyes: squint ? 'squint' : blink ? 'blink' : 'open',
  }
}

/** What a cell of the octopus is, for whoever colours it. */
export type OctopusTone = 'mantle' | 'arm' | 'eye'
export interface OctopusCell { char: string; tone: OctopusTone }

/** One frame of the octopus as a grid of cells, `null` where it has none: the pose's rows with the eyes drawn as
 * the pose says (open `O`, a blink `-`, screwed shut `>` and `<`). Place it with the pose's offsets. */
export function octopusFrame(pose: Pose): Array<Array<OctopusCell | null>> {
  return pose.lines.map((line, row) => {
    let eye = 0
    return [...line].map((char): OctopusCell | null => {
      if (char === ' ') return null
      if (char === 'O') return { char: pose.eyes === 'squint' ? (eye++ === 0 ? '>' : '<') : pose.eyes === 'blink' ? '-' : 'O', tone: 'eye' }
      return { char, tone: row < pose.mantleRows ? 'mantle' : 'arm' }
    })
  })
}
