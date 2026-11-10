/**
 * The octopus on the terminal while Octocrawl works: the one the website's crawl window draws (@w2l/octopus),
 * crawling down a page of glyphs as far as the run has reported and no further. A command draws it while it runs
 * (startMotion), a server while it works for a caller (startBoard). It is drawn on stderr only, for a person watching
 * a terminal, and wiped when the work ends: nothing of it stays in the scrollback, and stdout and the lines said on
 * stderr are what they are without it.
 */

import type { ScrapeStage, ServerActivity } from '@w2l/api'
import { crawlCap, octopusFrame, octopusPose, SPRITE_H, SPRITE_W, stageLabel, stageText, type CrawlStage, type OctopusTone } from '@w2l/octopus'

/** stderr as a terminal. */
export interface MotionTerminal {
  /** Text to the terminal as it is, with no line end added: frames and their escape sequences. */
  write: (text: string) => void
  /** The terminal's width and height in cells now; a side it does not know is left out. */
  size: () => { columns?: number; rows?: number }
}

/**
 * A process's stderr as the terminal the octopus is drawn on. The drawing counts on the cursor staying where its
 * last frame left it, and it is not the only writer: the command says its own lines there, and the engine logs to
 * it (console.error). So from here on, whatever else is written to the stream while a drawing is up goes above the
 * drawing (Motion.above): whole lines stay in the scrollback, in order, and the drawing goes on under them. A write
 * that does not end its line leaves the cursor where no frame can follow, so the drawing ends there instead.
 */
export function motionTerminal(stream: { write: (...args: never[]) => boolean; columns?: number; rows?: number }): MotionTerminal {
  const write = stream.write.bind(stream) as (...args: unknown[]) => boolean
  /** The write under way is the drawing's own. */
  let own = false
  stream.write = ((...args: unknown[]): boolean => {
    const up = drawing
    if (own || up === null) return write(...args)
    const chunk = args[0]
    const text = typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : ''
    if (!text.endsWith('\n')) { up.stop(); return write(...args) }
    let flushed = true
    up.above(() => { flushed = write(...args) })
    return flushed
  }) as typeof stream.write
  return {
    write: (text) => { own = true; try { write(text) } finally { own = false } },
    size: () => ({ ...(stream.columns === undefined ? {} : { columns: stream.columns }), ...(stream.rows === undefined ? {} : { rows: stream.rows }) }),
  }
}

/**
 * Whether to draw: not under CI, not on a terminal that cannot move its cursor (TERM=dumb), and not when switched
 * off, by `--no-motion` or OCTOCRAWL_NO_MOTION set to anything but nothing, 0 or false. That stderr is a terminal is
 * the caller's to know (CliIo.motion). NO_COLOR does not switch it off: it takes the colour away (motionColor).
 */
export function motionWanted(env: NodeJS.ProcessEnv, switchedOff: boolean): boolean {
  const set = (value: string | undefined): boolean => value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false'
  return !switchedOff && !set(env.OCTOCRAWL_NO_MOTION) && !set(env.CI) && env.TERM !== 'dumb'
}

export type MotionColor = 'truecolor' | '256' | 'none'

/** NO_COLOR (set to anything but nothing) draws with no colour; a terminal that says it has 24-bit colour gets the site's orange, any other its nearest of the 256. */
export function motionColor(env: NodeJS.ProcessEnv): MotionColor {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none'
  return env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit' ? 'truecolor' : '256'
}

/** How far a crawl or a batch has got, from its status as last read: the pages done, and of how many when the job knows (a batch does; a crawl finds its pages as it goes). */
export interface JobCount {
  done: number
  total: number | null
  /** A batch on the my-browser lane that waits for the person to allow its sites in their Chrome. */
  waitingForPerson?: boolean
}

export interface Motion {
  /** A stage of the scrape, as it is reported (scrapeStages). */
  stage: (stage: ScrapeStage) => void
  /** A crawl's or a batch's count, each time its status is read. */
  count: (count: JobCount) => void
  /** Run `say`, which writes whole lines to the same terminal, with the drawing out of the way: the lines stay in the scrollback and the drawing goes on under them (motionTerminal does this for every other writer of a process's stderr). */
  above: (say: () => void) => void
  /** Wipe the drawing and give the cursor back. Calling it again does nothing. */
  stop: () => void
}

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
/** Erase from the cursor to the end of its line, and to the end of the screen. */
const ERASE_LINE = '\x1b[K'
const ERASE_BELOW = '\x1b[J'
const up = (rows: number): string => rows > 0 ? `\x1b[${rows}A` : ''

/** A call that answers within this (a page from the cache) draws nothing: a drawing that flashes says nothing. */
const FIRST_FRAME_MS = 150
const FRAME_MS = 80

// The page it crawls: rows of glyphs standing for a heading and paragraphs, the same every run.
const PAGE_W = 46
const PAGE: readonly string[] = [
  '# ======== ===== ===',
  '',
  '---- ------- --- ----- -- ------ ---- -----',
  '------ -- ----- ---- --- ------- -- ---',
  '--- ----- ------ -- ---- ----- --- ------',
  '----- ---- -- ------- ---',
  '',
  '## ====== ====',
  '',
  '-- ------ ---- --- ----- ------- -- ----',
  '------- --- -- ----- ---- ------ --- --',
  '---- -- ------ ----- --- ---- -------',
  '------ ----- --- -- ------',
  '',
].map((line) => line.padEnd(PAGE_W))
const OCTOPUS_COL = Math.floor((PAGE_W - SPRITE_W) / 2)
const INDENT = '  '

const SGR: Readonly<Record<Exclude<MotionColor, 'none'>, Readonly<Record<OctopusTone | 'page', string>>>> = {
  truecolor: { mantle: '38;2;243;104;61', arm: '38;2;201;86;50', eye: '1', page: '2' },
  256: { mantle: '38;5;209', arm: '38;5;166', eye: '1', page: '2' },
}

/** A drawing on the terminal: what every one of them can do, whatever it shows. */
interface Drawing {
  /** Run `say`, which writes whole lines to the same terminal, with the drawing out of the way: the lines stay in the scrollback and the drawing goes on under them (motionTerminal does this for every other writer of a process's stderr). */
  above: (say: () => void) => void
  /** Wipe the drawing and give the cursor back. Calling it again does nothing. */
  stop: () => void
}

/** The drawing that is on the terminal now, for a process that exits without ending its command (stopMotion). */
let drawing: Drawing | null = null

/** Wipe whatever is drawn and give the cursor back: for the process's exit, where a second Ctrl-C leaves at once. */
export function stopMotion(): void {
  drawing?.stop()
}

/** What is to be on the terminal at one moment. */
interface Scene {
  /** The lines that say what is going on, top to bottom. */
  lines: readonly string[]
  /** The octopus on its page, above the lines: how far down it may go (0 to 1), and whether robots.txt refused it. Left out, the lines are drawn alone. */
  octopus?: { cap: number; refused: boolean }
}

/**
 * Draws a scene on the terminal, again every FRAME_MS, in place: `scene` says what is to be there now, or null for
 * nothing. The octopus goes toward the scene's cap, slower as it nears it (the crawl window's pace), and never past
 * it. A frame that is what the terminal already shows is not written again. On a terminal too small for the page
 * with the lines under it, the lines are drawn alone.
 */
function canvas(terminal: MotionTerminal, color: MotionColor, scene: (now: number) => Scene | null): Drawing {
  let depth = 0
  let lastAt = Date.now()
  /** How many lines of the drawing are on the terminal, the cursor on the line under them, and what they are. */
  let drawn = 0
  let shown = ''
  let hidden = false
  let stopped = false

  const paint = (text: string, tone: OctopusTone | 'page'): string => color === 'none' ? text : `\x1b[${SGR[color][tone]}m${text}\x1b[0m`

  const frameOf = (now: number, what: Scene): string[] => {
    // A terminal that does not say its size (or says 0) is taken for the usual 80 by 24.
    const size = terminal.size()
    const columns = size.columns !== undefined && size.columns > 0 ? size.columns : 80
    const rows = size.rows !== undefined && size.rows > 0 ? size.rows : 24
    // One column is left free, so a full line never wraps; a row is left free under the drawing, and one above it.
    const width = Math.max(0, columns - 1)
    const fits = Math.max(1, rows - 2)
    const lines = (what.lines.length <= fits ? what.lines : [...what.lines.slice(0, fits - 1), `and ${what.lines.length - fits + 1} more`]).map((line) => `${INDENT}${line}`.slice(0, width))
    if (what.octopus === undefined || width < INDENT.length + PAGE_W || rows < PAGE.length + lines.length + 2) return lines
    const pose = octopusPose({ now, failed: what.octopus.refused })
    const sprites = octopusFrame(pose)
    const head = Math.round(depth * (PAGE.length - SPRITE_H)) + pose.rowOffset
    const page = PAGE.map((text, row) => {
      const sprite = sprites[row - head]
      // The page shows around the octopus, not through it: its row is clear from a cell before its first glyph to a cell after its last.
      const glyphs = (sprite ?? []).flatMap((cell, at) => cell === null ? [] : [at])
      const from = glyphs.length === 0 ? 0 : glyphs[0]! - 1
      const to = glyphs.length === 0 ? -1 : glyphs.at(-1)! + 1
      let line = INDENT
      let run = ''
      let runTone: OctopusTone | 'page' = 'page'
      for (let col = 0; col < PAGE_W; col++) {
        const at = col - OCTOPUS_COL - pose.colOffset
        const cell = sprite?.[at] ?? null
        const tone = cell === null ? 'page' : cell.tone
        if (tone !== runTone && run !== '') { line += run.trim() === '' ? run : paint(run, runTone); run = '' }
        runTone = tone
        run += cell !== null ? cell.char : at >= from && at <= to ? ' ' : text[col]!
      }
      return line + (run.trim() === '' ? '' : paint(run.trimEnd(), runTone))
    })
    return [...page, ...lines]
  }

  const wipe = (): void => {
    if (drawn === 0) return
    terminal.write(`${up(drawn)}\r${ERASE_BELOW}`)
    drawn = 0
    shown = ''
  }

  const draw = (): void => {
    if (stopped) return
    const now = Date.now()
    const what = scene(now)
    if (what === null) { wipe(); return }
    const cap = what.octopus === undefined ? 0 : Math.min(1, Math.max(0, what.octopus.cap))
    // With no octopus to draw, the next one starts from the top of the page.
    depth = what.octopus === undefined ? 0 : depth + (cap - depth) * (1 - Math.exp(-(now - lastAt) / (cap < depth ? 300 : 1400)))
    lastAt = now
    const frame = frameOf(now, what)
    const text = frame.map((line) => `${line}${ERASE_LINE}\n`).join('')
    if (text === shown && drawn === frame.length) return
    const first = hidden ? '' : HIDE_CURSOR
    hidden = true
    drawing = self
    terminal.write(`${first}${up(drawn)}\r${text}${drawn > frame.length ? ERASE_BELOW : ''}`)
    drawn = frame.length
    shown = text
  }

  const timer = setInterval(draw, FRAME_MS)
  // The drawing never keeps the process alive: the command's end stops it.
  timer.unref()

  const self: Drawing = {
    above: (say) => {
      wipe()
      try { say() } finally { draw() }
    },
    stop: () => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      wipe()
      if (hidden) terminal.write(SHOW_CURSOR)
      if (drawing === self) drawing = null
    },
  }
  return self
}

/** A scrape as its stages tell it (scrapeStages): how far its octopus may go, and what its line says. */
function scrapeTold(): { stage: (stage: ScrapeStage) => void; cap: () => number; refused: () => boolean; doing: () => string | null } {
  const seen = new Set<CrawlStage>()
  let robots: Extract<ScrapeStage, { stage: 'robots' }> | null = null
  return {
    stage: (stage) => { if (stage.stage === 'robots') { robots = stage; seen.add('robots') } else seen.add('page') },
    cap: () => crawlCap(seen, robots === null ? null : robots.allowed, false),
    refused: () => robots !== null && !robots.allowed,
    /** What the scrape is doing, from the last stage it reported; null before the first. */
    doing: () => robots === null ? (seen.has('page') ? stageLabel(seen, null) : null)
      : robots.overridden === true && !seen.has('page') ? stageText(robots)
      : stageLabel(seen, robots.allowed, robots.unreachable === true),
  }
}

const number = (n: number): string => n.toLocaleString('en-US')
const pages = (n: number): string => `${number(n)} ${n === 1 ? 'page' : 'pages'}`
/** How long something has run, for the end of its line: nothing in its first second. */
function elapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return seconds < 1 ? '' : seconds < 60 ? ` · ${seconds} s` : ` · ${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

/**
 * Start drawing for one command: a scrape or a map of `host`, a crawl from it (none when one is resumed), or a batch.
 * A scrape's octopus goes as far down the page as its stages say. A map reports no stages, so its octopus waits at
 * the top of the page until the answer; so does a scrape that starts in a browser, and a crawl, which cannot say how
 * many pages it will find. A batch's goes down by the share of its pages that are done. On a terminal too small for
 * the page, the line that says what the run is doing is drawn alone.
 */
export function startMotion(terminal: MotionTerminal, options: { command: 'scrape' | 'map' | 'crawl' | 'batch'; host?: string; color: MotionColor }): Motion {
  const startedAt = Date.now()
  const told = scrapeTold()
  let job: JobCount | null = null
  const host = options.host === undefined ? '' : ` ${options.host}`
  /** What the run is doing, from the last thing it reported. */
  const doing = (): string => {
    if (options.command === 'crawl') return `Crawling${host}${job === null ? '' : ` · ${pages(job.done)} fetched`}`
    if (options.command === 'batch') {
      if (job === null) return 'Starting the batch'
      return `${job.waitingForPerson === true ? 'Waiting for you in Chrome · ' : ''}${number(job.done)}${job.total === null ? '' : `/${number(job.total)}`} pages done`
    }
    return told.doing() ?? `${options.command === 'map' ? 'Mapping' : 'Reading'}${host}`
  }
  const drawn = canvas(terminal, options.color, (now) => {
    if (now - startedAt < FIRST_FRAME_MS) return null
    // How far the run has reported: a scrape's stages, or the share of a job's pages that are done when the job knows how many there are.
    const cap = job === null ? told.cap() : job.total === null || job.total <= 0 ? 0 : job.done / job.total
    return { lines: [`${doing()}${elapsed(now - startedAt)}`], octopus: { cap, refused: told.refused() } }
  })
  return { stage: told.stage, count: (count) => { job = count }, above: drawn.above, stop: drawn.stop }
}

/** A server's terminal while it runs (`octocrawl serve`): what it is doing for its callers, as the server tells it. */
export interface Board {
  /** What the server did (runApiServer's `onActivity`). */
  activity: (event: ServerActivity) => void
  /** Wipe the drawing and give the cursor back. */
  stop: () => void
}

/** The lines of work a board shows at once; the rest are counted in a line under them. */
const BOARD_LINES = 4

/** Who called, from the request's `origin`: an MCP server sends `mcp-<its client's name>@<version>`, an SDK `<name>@<version>`. The name alone is shown. */
function callerOf(origin: string | undefined): string | null {
  if (origin === undefined) return null
  const name = printable(origin).replace(/@.*$/, '').replace(/^mcp-(?=.)/, '')
  return name === '' ? null : name
}

/** Text from a request, as a terminal may show it: nothing but printable ASCII, so no request moves the cursor or colours the screen. */
function printable(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '?')
}

/**
 * Start a server's board. Idle, it is one line. While a scrape or a map call runs, the octopus is up on its page with
 * a line a call under it: who called (the request's origin), what, which site, the stage it has reported, how long.
 * The octopus follows the call that has run longest, as far as that call's stages say. A crawl or a batch gets a
 * line too, from its start to its end, with the pages it has recorded since (one the server took up again as it
 * started tells no start, and has no line). A call that answers within FIRST_FRAME_MS (a page
 * from the cache) is counted and never shown. Each line is its own call's: two calls at once never share one.
 */
export function startBoard(terminal: MotionTerminal, options: { color: MotionColor }): Board {
  const calls = new Map<number, { kind: 'scrape' | 'map'; host: string; who: string | null; startedAt: number; told: ReturnType<typeof scrapeTold> }>()
  const jobs = new Map<string, { kind: 'crawl' | 'batch'; pages: number; startedAt: number }>()
  let answered = 0
  const drawn = canvas(terminal, options.color, (now) => {
    const up = [...calls.values()].filter((call) => now - call.startedAt >= FIRST_FRAME_MS)
    if (up.length === 0 && jobs.size === 0) return { lines: [`Waiting for calls${answered === 0 ? '' : ` · ${number(answered)} answered so far`}`] }
    const lines = [
      ...up.map((call) => `${call.who === null ? '' : `${call.who} · `}${call.kind} ${call.host}${call.told.doing() === null ? '' : ` · ${call.told.doing()}`}${elapsed(now - call.startedAt)}`),
      ...[...jobs].map(([taskId, running]) => `${running.kind} ${printable(taskId).slice(0, 8)} · ${pages(running.pages)} so far${elapsed(now - running.startedAt)}`),
    ]
    const first = up[0]
    return {
      lines: lines.length <= BOARD_LINES ? lines : [...lines.slice(0, BOARD_LINES), `and ${lines.length - BOARD_LINES} more`],
      octopus: first === undefined ? { cap: 0, refused: false } : { cap: first.told.cap(), refused: first.told.refused() },
    }
  })
  return {
    activity: (event) => {
      switch (event.type) {
        case 'call_started':
          calls.set(event.id, { kind: event.kind, host: printable(URL.canParse(event.url) ? new URL(event.url).host : event.url), who: callerOf(event.origin), startedAt: Date.now(), told: scrapeTold() })
          break
        case 'call_stage': calls.get(event.id)?.told.stage(event.stage); break
        case 'call_ended': if (calls.delete(event.id)) answered++; break
        case 'job_started': jobs.set(event.taskId, { kind: event.kind, pages: 0, startedAt: Date.now() }); break
        // A page of a job that is not running here is not a job's line: a batch that has ended records pages again when
        // it is handed over to the person, and nothing would ever take such a line down.
        case 'job_page': { const running = jobs.get(event.taskId); if (running !== undefined) running.pages++; break }
        case 'job_ended': jobs.delete(event.taskId); break
      }
    },
    stop: drawn.stop,
  }
}
