/**
 * The octopus on the terminal while a scrape or a map runs: the one the website's crawl window draws (@w2l/octopus),
 * crawling down a page of glyphs as far as the run has reported and no further. It is drawn on stderr only, for a
 * person watching a terminal, and wiped when the run ends: nothing of it stays in the scrollback, and stdout and the
 * lines the command says on stderr are what they are without it.
 */

import type { ScrapeStage } from '@w2l/api'
import { crawlCap, octopusFrame, octopusPose, SPRITE_H, SPRITE_W, stageLabel, type CrawlStage, type OctopusTone } from '@w2l/octopus'

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

export interface Motion {
  /** A stage of the scrape, as it is reported (scrapeStages). */
  stage: (stage: ScrapeStage) => void
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

/** The motion whose drawing is on the terminal now, for a process that exits without ending its command (stopMotion). */
let drawing: Motion | null = null

/** Wipe whatever is drawn and give the cursor back: for the process's exit, where a second Ctrl-C leaves at once. */
export function stopMotion(): void {
  drawing?.stop()
}

/**
 * Start drawing for one scrape or map of `host`. A map reports no stages, so its octopus waits at the top of the
 * page until the answer; so does a scrape that starts in a browser. On a terminal too small for the page, the line
 * that says what the run is doing is drawn alone.
 */
export function startMotion(terminal: MotionTerminal, options: { command: 'scrape' | 'map'; host: string; color: MotionColor }): Motion {
  const startedAt = Date.now()
  const seen = new Set<CrawlStage>()
  let robots: Extract<ScrapeStage, { stage: 'robots' }> | null = null
  let depth = 0
  let lastAt = startedAt
  /** How many lines of the drawing are on the terminal, the cursor on the line under them. */
  let drawn = 0
  let hidden = false
  let stopped = false

  const paint = (text: string, tone: OctopusTone | 'page'): string => options.color === 'none' ? text : `\x1b[${SGR[options.color][tone]}m${text}\x1b[0m`

  const label = (now: number): string => {
    const doing = robots === null ? (seen.has('page') ? stageLabel(seen, null) : `${options.command === 'map' ? 'Mapping' : 'Reading'} ${options.host}`)
      : robots.overridden === true && !seen.has('page') ? `${robots.unreachable === true ? 'robots.txt could not be read' : 'robots.txt disallows it'} · fetching it anyway (robots_overridden)`
      : stageLabel(seen, robots.allowed, robots.unreachable === true)
    const seconds = Math.floor((now - startedAt) / 1000)
    return `${doing}${seconds >= 1 ? ` · ${seconds} s` : ''}`
  }

  const lines = (now: number): string[] => {
    // A terminal that does not say its size (or says 0) is taken for the usual 80 by 24.
    const size = terminal.size()
    const columns = size.columns !== undefined && size.columns > 0 ? size.columns : 80
    const rows = size.rows !== undefined && size.rows > 0 ? size.rows : 24
    // One column is left free, so a full line never wraps; the page needs a row to spare under it and its label.
    const width = Math.max(0, columns - 1)
    const status = `${INDENT}${label(now)}`.slice(0, width)
    if (width < INDENT.length + PAGE_W || rows < PAGE.length + 3) return [status]
    const refused = robots !== null && !robots.allowed
    const pose = octopusPose({ now, failed: refused })
    const frame = octopusFrame(pose)
    const head = Math.round(depth * (PAGE.length - SPRITE_H)) + pose.rowOffset
    const out = PAGE.map((text, row) => {
      const sprite = frame[row - head]
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
    return [...out, status]
  }

  const wipe = (): void => {
    if (drawn === 0) return
    terminal.write(`${up(drawn)}\r${ERASE_BELOW}`)
    drawn = 0
  }

  const draw = (): void => {
    const now = Date.now()
    if (stopped || now - startedAt < FIRST_FRAME_MS) return
    // Toward how far the run has reported, slower as it nears it (the crawl window's pace), and never past it.
    const cap = crawlCap(seen, robots === null ? null : robots.allowed, false)
    depth += (cap - depth) * (1 - Math.exp(-(now - lastAt) / (cap < depth ? 300 : 1400)))
    lastAt = now
    const frame = lines(now)
    const first = hidden ? '' : HIDE_CURSOR
    hidden = true
    drawing = motion
    terminal.write(`${first}${up(drawn)}\r${frame.map((line) => `${line}${ERASE_LINE}\n`).join('')}${drawn > frame.length ? ERASE_BELOW : ''}`)
    drawn = frame.length
  }

  const timer = setInterval(draw, FRAME_MS)
  // The drawing never keeps the process alive: the command's end stops it.
  timer.unref()

  const motion: Motion = {
    stage: (stage) => {
      if (stage.stage === 'robots') { robots = stage; seen.add('robots') } else seen.add('page')
    },
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
      if (drawing === motion) drawing = null
    },
  }
  return motion
}
