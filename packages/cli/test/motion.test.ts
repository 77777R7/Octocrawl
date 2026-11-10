import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionColor, motionTerminal, motionWanted, startMotion, stopMotion, type MotionColor } from '../src/motion.js'

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
const start = (term: ReturnType<typeof terminal>, command: 'scrape' | 'map' = 'scrape', color: MotionColor = '256') => startMotion(term, { command, host: 'example.com', color })

beforeEach(() => { vi.useFakeTimers() })
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
    expect(term.writes.length).toBeGreaterThan(5)
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
    expect(shown(term.writes.at(-1)!).at(-1)).toBe('  Page received · checking it · 60 s')
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
    // The frame after that goes up over the frame under the line, not over the line.
    vi.advanceTimersByTime(80)
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
