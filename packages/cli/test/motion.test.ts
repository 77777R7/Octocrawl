import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionColor, motionTerminal, motionWanted, startBoard, startMotion, stopMotion, type MotionColor } from '../src/motion.js'
import { screen } from './screen.js'

const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'
/** A frame's text as a terminal shows it: its lines, with no escape sequence. */
const shown = (write: string): string[] => write.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '').split('\n').slice(0, -1)
/** The row the octopus's mantle starts on in a frame. */
const headRow = (write: string): number => shown(write).findIndex((line) => line.includes(',=####=,'))

function terminal(columns = 100, rows = 30) {
  const writes: string[] = []
  return { writes, write: (text: string) => { writes.push(text) }, size: () => ({ columns, rows }) }
}
const start = (term: ReturnType<typeof terminal>, command: 'scrape' | 'map' | 'crawl' | 'batch' = 'scrape', color: MotionColor = '256') => startMotion(term, { command, ...(command === 'batch' ? {} : { host: 'example.com' }), color })

// One clock for every run: the octopus's stride and blink follow the time of day.
beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-11-10T00:00:00Z') }) })
afterEach(() => { stopMotion(); vi.useRealTimers() })

describe('the octopus on the terminal', () => {
  it('draws nothing for a call that answers at once, and nothing after it is stopped', () => {
    const term = terminal()
    const motion = start(term)
    vi.advanceTimersByTime(100)
    motion.stop()
    vi.advanceTimersByTime(1_000)
    expect(term.writes).toEqual([])
  })

  it('hides the cursor once, redraws in place, and on stop wipes the drawing and gives the cursor back', () => {
    const term = terminal()
    const motion = start(term)
    // A frame every 80 ms: the last of these is at 1,040 ms.
    vi.advanceTimersByTime(1_040)
    // A frame is written when it differs from the last: the stride changes every 240 ms.
    expect(term.writes.length).toBeGreaterThan(2)
    expect(term.writes[0]!.startsWith(`${HIDE}\r`)).toBe(true)
    expect(term.writes.join('').split(HIDE)).toHaveLength(2)
    // The page and the line under it: every later frame goes back up over the one before, and no line is as wide as the terminal.
    expect(shown(term.writes[0]!)).toHaveLength(15)
    for (const write of term.writes.slice(1)) expect(write.startsWith('\x1b[15A\r')).toBe(true)
    for (const line of shown(term.writes.at(-1)!)) expect(line.length).toBeLessThan(100)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Reading example.com · 1 s')
    const before = term.writes.length
    motion.stop()
    expect(term.writes.slice(before)).toEqual(['\x1b[15A\r\x1b[J', SHOW])
    motion.stop()
    stopMotion()
    vi.advanceTimersByTime(1_000)
    expect(term.writes).toHaveLength(before + 2)
  })

  it('goes no further down the page than the scrape has reported', () => {
    const term = terminal()
    const motion = start(term)
    vi.advanceTimersByTime(20_000)
    // Nothing reported: it waits at the top, however long.
    expect(headRow(term.writes.at(-1)!)).toBe(0)
    motion.stage({ stage: 'robots', allowed: true })
    vi.advanceTimersByTime(20_000)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  robots.txt allows it · fetching the page · 40 s')
    expect(headRow(term.writes.at(-1)!)).toBe(2)
    motion.stage({ stage: 'page' })
    vi.advanceTimersByTime(20_000)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Page received · checking it · 1 min 0 s')
    // The foot of the page is the result's alone, and the result ends the drawing.
    expect(headRow(term.writes.at(-1)!)).toBe(5)
  })

  it('stays at the door when robots.txt refuses the page, and says an override when the page is fetched all the same', () => {
    const refused = terminal()
    const motion = start(refused)
    motion.stage({ stage: 'robots', allowed: false })
    vi.advanceTimersByTime(5_040)
    expect(shown(refused.writes.at(-1)!).at(-1)).toBe('  robots.txt disallows this page · 5 s')
    expect(headRow(refused.writes.at(-1)!)).toBe(0)
    motion.stop()

    const unreachable = terminal()
    const second = start(unreachable)
    second.stage({ stage: 'robots', allowed: false, unreachable: true })
    vi.advanceTimersByTime(500)
    expect(shown(unreachable.writes.at(-1)!).at(-1)).toBe('  robots.txt could not be read · not fetching')
    second.stop()

    const overridden = terminal()
    const third = start(overridden)
    third.stage({ stage: 'robots', allowed: true, overridden: true })
    vi.advanceTimersByTime(500)
    expect(shown(overridden.writes.at(-1)!).at(-1)).toBe('  robots.txt disallows it · fetching it anyway (robots_overridden)')
    third.stage({ stage: 'page' })
    vi.advanceTimersByTime(560)
    expect(shown(overridden.writes.at(-1)!).at(-1)).toBe('  Page received · checking it · 1 s')
  })

  it('has two states for a map, which reports no stages', () => {
    const term = terminal()
    start(term, 'map')
    vi.advanceTimersByTime(3_040)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Mapping example.com · 3 s')
    expect(headRow(term.writes.at(-1)!)).toBe(0)
  })

  it('counts a crawl\'s pages as they are fetched, and waits at the top: a crawl does not know how many it will find', () => {
    const term = terminal()
    const motion = start(term, 'crawl')
    vi.advanceTimersByTime(400)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Crawling example.com')
    motion.count({ done: 1, total: null })
    vi.advanceTimersByTime(80)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Crawling example.com · 1 page fetched')
    motion.count({ done: 1_204, total: null })
    vi.advanceTimersByTime(80 * 1_000)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Crawling example.com · 1,204 pages fetched · 1 min 20 s')
    expect(headRow(term.writes.at(-1)!)).toBe(0)
    // A resumed crawl names no site.
    const resumed = terminal()
    startMotion(resumed, { command: 'crawl', color: 'none' }).count({ done: 3, total: null })
    vi.advanceTimersByTime(400)
    expect(shown(resumed.writes.at(-1)!).at(-1)).toBe('  Crawling · 3 pages fetched')
  })

  it('goes down the page by the share of a batch\'s pages that are done, and says when the batch waits for the person', () => {
    const term = terminal()
    const motion = start(term, 'batch')
    vi.advanceTimersByTime(400)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Starting the batch')
    expect(headRow(term.writes.at(-1)!)).toBe(0)
    motion.count({ done: 0, total: 20, waitingForPerson: true })
    vi.advanceTimersByTime(80)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Waiting for you in Chrome · 0/20 pages done')
    motion.count({ done: 10, total: 20 })
    vi.advanceTimersByTime(20_000)
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  10/20 pages done · 20 s')
    expect(headRow(term.writes.at(-1)!)).toBe(3)
    motion.count({ done: 20, total: 20 })
    vi.advanceTimersByTime(20_000)
    expect(headRow(term.writes.at(-1)!)).toBe(6)
    // A count that makes no share (nothing asked for, more done than asked for) moves it nowhere it should not be.
    motion.count({ done: 3, total: 0 })
    vi.advanceTimersByTime(20_000)
    expect(headRow(term.writes.at(-1)!)).toBe(0)
    motion.count({ done: 30, total: 20 })
    vi.advanceTimersByTime(20_000)
    expect(headRow(term.writes.at(-1)!)).toBe(6)
  })

  it('leaves on the screen only the lines written beside it, in order, whatever it drew between them', () => {
    const written: string[] = []
    const stream = { write: (text: string): boolean => { written.push(text); return true }, columns: 100, rows: 30 }
    const motion = startMotion(motionTerminal(stream), { command: 'batch', color: '256' })
    stream.write('octocrawl batch: task 1\n')
    vi.advanceTimersByTime(400)
    // With the drawing up, the screen holds it under the line.
    expect(screen(written)).toHaveLength(16)
    stream.write('a line of the engine\'s log\n')
    motion.count({ done: 2, total: 4 })
    vi.advanceTimersByTime(3_000)
    stream.write('two lines\nin one write\n')
    vi.advanceTimersByTime(3_000)
    expect(screen(written).slice(0, 4)).toEqual(['octocrawl batch: task 1', 'a line of the engine\'s log', 'two lines', 'in one write'])
    expect(screen(written).at(-1)).toBe('  2/4 pages done · 6 s')
    motion.stop()
    stream.write('octocrawl batch: completed\n')
    expect(screen(written)).toEqual(['octocrawl batch: task 1', 'a line of the engine\'s log', 'two lines', 'in one write', 'octocrawl batch: completed'])
  })

  it('draws the octopus in colour, and with NO_COLOR in none: only the cursor moves and lines are erased', () => {
    const coloured = terminal()
    start(coloured, 'scrape', 'truecolor')
    vi.advanceTimersByTime(400)
    expect(coloured.writes.at(-1)).toContain('\x1b[38;2;243;104;61m')
    const plain = terminal()
    start(plain, 'scrape', 'none')
    vi.advanceTimersByTime(400)
    expect(plain.writes.join('')).not.toMatch(/\x1b\[[0-9;]*m/)
    expect(shown(plain.writes.at(-1)!)).toEqual(shown(coloured.writes.at(-1)!))
  })

  it('draws the line alone on a terminal too small for the page, cut to its width', () => {
    for (const [columns, rows] of [[40, 30], [100, 12]] as const) {
      const term = terminal(columns, rows)
      const motion = start(term)
      vi.advanceTimersByTime(400)
      expect(shown(term.writes.at(-1)!)).toEqual(['  Reading example.com'])
      motion.stop()
      expect(term.writes.slice(-2)).toEqual(['\x1b[1A\r\x1b[J', SHOW])
    }
    const narrow = terminal(12, 30)
    start(narrow)
    vi.advanceTimersByTime(400)
    expect(shown(narrow.writes.at(-1)!)).toEqual(['  Reading e'])
    // A terminal that does not know its size is taken for 80 by 24: the page fits.
    const unknown = { writes: [] as string[], write(text: string) { this.writes.push(text) }, size: () => ({ columns: 0 }) }
    startMotion(unknown, { command: 'scrape', host: 'example.com', color: 'none' })
    vi.advanceTimersByTime(400)
    expect(shown(unknown.writes.at(-1)!)).toHaveLength(15)
  })

  it('lets a line through above the drawing: wiped first, drawn again under it', () => {
    const term = terminal()
    const motion = start(term)
    vi.advanceTimersByTime(400)
    const before = term.writes.length
    motion.above(() => term.write('octocrawl scrape: a line\n'))
    const after = term.writes.slice(before)
    expect(after[0]).toBe('\x1b[15A\r\x1b[J')
    expect(after[1]).toBe('octocrawl scrape: a line\n')
    // The frame after the line starts where the cursor is: nothing above it is gone over.
    expect(after[2]!.startsWith('\r')).toBe(true)
    expect(shown(after[2]!)).toHaveLength(15)
    expect(after).toHaveLength(3)
    // Before the first frame there is nothing to wipe, and the line is all that is written.
    const early = terminal()
    start(early).above(() => early.write('early\n'))
    expect(early.writes).toEqual(['early\n'])
  })

  it('keeps every other write to the process\'s stderr above the drawing, and ends the drawing at a write that does not end its line', () => {
    const written: string[] = []
    const stream = { write: (text: string): boolean => { written.push(text); return true }, columns: 100, rows: 30 }
    const term = motionTerminal(stream)
    expect(term.size()).toEqual({ columns: 100, rows: 30 })
    // Nothing drawn yet: a write goes straight through.
    startMotion(term, { command: 'scrape', host: 'example.com', color: 'none' })
    stream.write('octocrawl: a notice\n')
    expect(written).toEqual(['octocrawl: a notice\n'])
    vi.advanceTimersByTime(400)
    // The engine's log line (console.error) and the command's own lines come this way: wiped, the line, drawn again under it.
    let before = written.length
    expect(stream.write('{"event":"my_browser_approval","step":"allowed"}\n')).toBe(true)
    expect(written.slice(before, before + 2)).toEqual(['\x1b[15A\r\x1b[J', '{"event":"my_browser_approval","step":"allowed"}\n'])
    expect(written[before + 2]!.startsWith('\r')).toBe(true)
    expect(shown(written[before + 2]!)).toHaveLength(15)
    expect(written).toHaveLength(before + 3)
    // The next frame that differs (the octopus's stride, every 240 ms) goes up over the frame under the line, not over the line.
    vi.advanceTimersByTime(320)
    expect(written.at(-1)!.startsWith('\x1b[15A\r')).toBe(true)
    // Bytes count as text; a write that leaves the cursor mid-line ends the drawing, and is written whole.
    before = written.length
    stream.write(Buffer.from('bytes\n') as never)
    expect(written.slice(before, before + 2)).toEqual(['\x1b[15A\r\x1b[J', Buffer.from('bytes\n')])
    before = written.length
    stream.write('no line end')
    expect(written.slice(before)).toEqual(['\x1b[15A\r\x1b[J', SHOW, 'no line end'])
    vi.advanceTimersByTime(1_000)
    stream.write('after\n')
    expect(written.slice(before + 3)).toEqual(['after\n'])
  })

  it('gives the cursor back when the process leaves with a drawing up', () => {
    const term = terminal()
    start(term)
    vi.advanceTimersByTime(400)
    stopMotion()
    expect(term.writes.slice(-2)).toEqual(['\x1b[15A\r\x1b[J', SHOW])
  })
})

describe('a server\'s board', () => {
  /** The lines under the page in the last frame (the whole frame when no page is drawn). */
  const linesOf = (write: string): string[] => { const all = shown(write); return all.length > 14 ? all.slice(14) : all }

  it('is one line while the server is idle, written once, and wiped when the server stops', () => {
    const term = terminal()
    const board = startBoard(term, { color: '256' })
    vi.advanceTimersByTime(60_000)
    expect(term.writes).toHaveLength(1)
    expect(term.writes[0]!.startsWith(HIDE)).toBe(true)
    expect(shown(term.writes[0]!)).toEqual(['  Waiting for calls'])
    board.stop()
    expect(term.writes.slice(1)).toEqual(['\x1b[1A\r\x1b[J', SHOW])
  })

  it('gives each call at once its own line, with who called, what, the site and its own stage, and the octopus to the call that has run longest', () => {
    const term = terminal()
    const board = startBoard(term, { color: 'none' })
    board.activity({ type: 'call_started', id: 1, kind: 'scrape', url: 'https://example.com/pricing', origin: 'mcp-claude-code@2.1.301' })
    vi.advanceTimersByTime(1_040)
    board.activity({ type: 'call_started', id: 2, kind: 'map', url: 'https://docs.example.org/', origin: 'js-sdk@0.8.11' })
    board.activity({ type: 'call_started', id: 3, kind: 'scrape', url: 'https://shop.example.net/item?id=1' })
    board.activity({ type: 'call_stage', id: 1, stage: { stage: 'robots', allowed: true } })
    board.activity({ type: 'call_stage', id: 3, stage: { stage: 'robots', allowed: false } })
    vi.advanceTimersByTime(20_000)
    expect(linesOf(term.writes.at(-1)!)).toEqual([
      '  claude-code · scrape example.com · robots.txt allows it · fetching the page · 21 s',
      '  js-sdk · map docs.example.org · 20 s',
      '  scrape shop.example.net · robots.txt disallows this page · 20 s',
    ])
    // The octopus is the first call's: as far as robots.txt allowed takes it.
    expect(headRow(term.writes.at(-1)!)).toBe(2)
    board.activity({ type: 'call_ended', id: 1 })
    vi.advanceTimersByTime(20_000)
    // The first call is gone, its line with it; the octopus is now the map's, which reports no stages.
    expect(linesOf(term.writes.at(-1)!)).toEqual(['  js-sdk · map docs.example.org · 40 s', '  scrape shop.example.net · robots.txt disallows this page · 40 s'])
    expect(headRow(term.writes.at(-1)!)).toBe(0)
    board.activity({ type: 'call_ended', id: 2 })
    board.activity({ type: 'call_ended', id: 3 })
    board.activity({ type: 'call_ended', id: 3 })
    vi.advanceTimersByTime(80)
    expect(shown(term.writes.at(-1)!)).toEqual(['  Waiting for calls · 3 answered so far'])
  })

  it('counts a call that answers at once and never shows it', () => {
    const term = terminal()
    const board = startBoard(term, { color: 'none' })
    vi.advanceTimersByTime(400)
    board.activity({ type: 'call_started', id: 1, kind: 'scrape', url: 'https://example.com/' })
    vi.advanceTimersByTime(80)
    board.activity({ type: 'call_ended', id: 1 })
    vi.advanceTimersByTime(1_000)
    expect(term.writes.map((write) => shown(write))).toEqual([['  Waiting for calls'], ['  Waiting for calls · 1 answered so far']])
  })

  it('gives a crawl or a batch a line from its start to its end, with the pages it has recorded', () => {
    const term = terminal()
    const board = startBoard(term, { color: 'none' })
    board.activity({ type: 'job_started', taskId: 'a755271e-5516-43b8-9182-e4059ef8ce1d', kind: 'batch' })
    board.activity({ type: 'job_page', taskId: 'a755271e-5516-43b8-9182-e4059ef8ce1d', kind: 'batch' })
    board.activity({ type: 'job_started', taskId: '762dbb30-f5b3-4207-b8d9-60276057c2fa', kind: 'crawl' })
    board.activity({ type: 'job_page', taskId: '762dbb30-f5b3-4207-b8d9-60276057c2fa', kind: 'crawl' })
    board.activity({ type: 'job_page', taskId: '762dbb30-f5b3-4207-b8d9-60276057c2fa', kind: 'crawl' })
    vi.advanceTimersByTime(2_000)
    expect(linesOf(term.writes.at(-1)!)).toEqual(['  batch a755271e · 1 page so far · 2 s', '  crawl 762dbb30 · 2 pages so far · 2 s'])
    // No call is up: the octopus waits at the top.
    expect(headRow(term.writes.at(-1)!)).toBe(0)
    board.activity({ type: 'job_ended', taskId: 'a755271e-5516-43b8-9182-e4059ef8ce1d' })
    board.activity({ type: 'job_ended', taskId: '762dbb30-f5b3-4207-b8d9-60276057c2fa' })
    vi.advanceTimersByTime(80)
    expect(shown(term.writes.at(-1)!)).toEqual(['  Waiting for calls'])
    // A page of a job that has ended (a batch handed over to the person records them) or never started here brings no line
    // back: nothing would take it down again. The board stays idle and writes nothing.
    const before = term.writes.length
    board.activity({ type: 'job_page', taskId: 'a755271e-5516-43b8-9182-e4059ef8ce1d', kind: 'batch' })
    board.activity({ type: 'job_page', taskId: '00000000-0000-4000-8000-000000000000', kind: 'crawl' })
    vi.advanceTimersByTime(10_000)
    expect(term.writes).toHaveLength(before)
  })

  it('shows four lines of work and counts the rest, and on a small terminal draws the lines alone', () => {
    const term = terminal()
    const board = startBoard(term, { color: 'none' })
    for (let id = 1; id <= 6; id++) board.activity({ type: 'call_started', id, kind: 'map', url: `https://site${id}.example/` })
    vi.advanceTimersByTime(400)
    expect(linesOf(term.writes.at(-1)!)).toEqual(['  map site1.example', '  map site2.example', '  map site3.example', '  map site4.example', '  and 2 more'])
    const small = terminal(100, 12)
    const second = startBoard(small, { color: 'none' })
    second.activity({ type: 'call_started', id: 1, kind: 'map', url: 'https://example.com/' })
    vi.advanceTimersByTime(400)
    expect(shown(small.writes.at(-1)!)).toEqual(['  map example.com'])
  })

  it('shows of a request only printable text: no call moves the cursor or colours the terminal', () => {
    const term = terminal()
    const board = startBoard(term, { color: 'none' })
    board.activity({ type: 'call_started', id: 1, kind: 'scrape', url: 'https://example.com/', origin: 'mcp-evil\x1b[2J\x07name@1' })
    board.activity({ type: 'call_started', id: 2, kind: 'scrape', url: 'not a url \x1b[31m', origin: 'mcp@0.8.11' })
    board.activity({ type: 'job_started', taskId: '\x1b[1A\x1b[2K', kind: 'crawl' })
    vi.advanceTimersByTime(400)
    const frame = term.writes.at(-1)!
    expect(linesOf(frame)).toEqual(['  evil?[2J?name · scrape example.com', '  mcp · scrape not a url ?[31m', '  crawl ?[1A?[2K · 0 pages so far'])
    // The only escape sequences in the frame are the drawing's own: hide the cursor, go up, erase to the end of the line.
    expect(frame.replace(/\x1b\[\?25l|\x1b\[\d+A|\x1b\[K/g, '')).not.toContain('\x1b')
    expect(frame).not.toContain('\x07')
  })
})

describe('whether to draw', () => {
  it('is switched off by the flag, OCTOCRAWL_NO_MOTION, CI and a dumb terminal, and not by NO_COLOR', () => {
    expect(motionWanted({}, false)).toBe(true)
    expect(motionWanted({ NO_COLOR: '1', TERM: 'xterm-256color' }, false)).toBe(true)
    expect(motionWanted({}, true)).toBe(false)
    expect(motionWanted({ OCTOCRAWL_NO_MOTION: '1' }, false)).toBe(false)
    expect(motionWanted({ CI: 'true' }, false)).toBe(false)
    expect(motionWanted({ TERM: 'dumb' }, false)).toBe(false)
    for (const off of ['', '0', 'false']) expect(motionWanted({ OCTOCRAWL_NO_MOTION: off, CI: off }, false)).toBe(true)
  })

  it('takes the colour from NO_COLOR and COLORTERM', () => {
    expect(motionColor({})).toBe('256')
    expect(motionColor({ COLORTERM: 'truecolor' })).toBe('truecolor')
    expect(motionColor({ COLORTERM: '24bit' })).toBe('truecolor')
    expect(motionColor({ NO_COLOR: '1', COLORTERM: 'truecolor' })).toBe('none')
    expect(motionColor({ NO_COLOR: '' })).toBe('256')
  })
})
