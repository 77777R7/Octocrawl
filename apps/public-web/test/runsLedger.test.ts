// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountLedger, type LedgerRun } from '../src/runsLedger'

// The Recent runs ledger (src/runsLedger.ts) in a browser-like window (happy-dom): what a row holds, that rows are
// kept and written in place, and that a run still out counts its time up.
const run = (id: number, extra: Partial<LedgerRun> = {}): LedgerRun => ({
  id, label: `example.test/page-${id}`, type: 'Web page', status: { text: 'Page read', tone: 'success' }, time: '1.20 s', since: 0, started: '12:00 PM', output: 'Markdown · JSON', ...extra,
})
const out = (id: number): LedgerRun => run(id, { status: { text: 'Extracting…', tone: 'loading' }, time: null, output: '—' })

let grid: HTMLElement
let selected: number[]
let reduce = true
beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="grid"></div>'
  grid = document.querySelector<HTMLElement>('#grid')!
  selected = []
  reduce = true
  // The rows' printing (windowBuild.ts) needs a real page; with less motion asked for, a row is simply written.
  window.matchMedia = ((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => { vi.useRealTimers() })

const texts = (row: Element): string[] => [...row.querySelectorAll('.run-url, .run-field')].map((cell) => cell.textContent ?? '')

describe('the Recent runs ledger', () => {
  it('writes a row for each run, in order: its page, then a cell under each column, each named for a screen reader', () => {
    const ledger = mountLedger(grid, (id) => selected.push(id))
    ledger.render([run(2), run(1, { status: { text: 'Login required', tone: 'error' }, output: 'JSON' })], 2)
    const rows = [...grid.querySelectorAll<HTMLButtonElement>('.run-card')]
    expect(rows.map((row) => row.dataset.run)).toEqual(['2', '1'])
    expect(texts(rows[0]!)).toEqual(['example.test/page-2', 'Type: Web page', 'Status: Page read', 'Total time: 1.20 s', 'Started: 12:00 PM', 'Output: Markdown · JSON'])
    expect(rows[0]!.querySelector('.run-glyph')!.textContent).toBe('E')
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    // The status is one element whose text is the status alone, toned.
    expect(rows[1]!.querySelectorAll('.run-status')).toHaveLength(1)
    expect(rows[1]!.querySelector('.run-status')!.textContent).toBe('Login required')
    expect(rows[1]!.querySelector('.run-status')!.className).toBe('run-status tone-error')
    rows[1]!.click()
    expect(selected).toEqual([1])
  })

  it('keeps a run’s row and writes it in place, so the row that has the focus keeps it', () => {
    const ledger = mountLedger(grid, () => {})
    ledger.render([out(1)], 1)
    const row = grid.querySelector<HTMLButtonElement>('.run-card')!
    row.focus()
    ledger.render([run(1)], 1)
    expect(grid.querySelector('.run-card')).toBe(row)
    expect(document.activeElement).toBe(row)
    expect(row.querySelector('.run-status')!.textContent).toBe('Page read')
    expect(row.classList.contains('is-out')).toBe(false)
    // A newer run goes above it; a run that is no longer kept loses its row.
    ledger.render([out(2), run(1)], 2)
    expect([...grid.children].map((child) => (child as HTMLElement).dataset.run)).toEqual(['2', '1'])
    expect(grid.children[1]).toBe(row)
    expect(document.activeElement).toBe(row)
    ledger.render([out(2)], 2)
    expect(grid.querySelectorAll('.run-card')).toHaveLength(1)
    expect(row.isConnected).toBe(false)
  })

  it('counts up the time of a run that is still out, and stops at its result', () => {
    reduce = false
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    const ledger = mountLedger(grid, () => {})
    ledger.render([out(1)].map((row) => ({ ...row, since: 1000 })), 1)
    const time = grid.querySelector('.run-time')!
    expect(time.textContent).toBe('0.0 s')
    now.mockReturnValue(2350)
    vi.advanceTimersByTime(100)
    expect(time.textContent).toBe('1.4 s')
    // The final time is not written over a run that is still out.
    ledger.setTime(1, '9.99 s')
    expect(time.textContent).toBe('1.4 s')
    ledger.render([run(1, { time: '1.41 s', since: 1000 })], 1)
    now.mockReturnValue(5000)
    vi.advanceTimersByTime(500)
    expect(time.textContent).toBe('1.41 s')
    ledger.setTime(1, '1.43 s')
    expect(time.textContent).toBe('1.43 s')
    now.mockRestore()
  })

  it('shows no count for a visitor who asked for less motion', () => {
    const ledger = mountLedger(grid, () => {})
    ledger.render([out(1)], 1)
    vi.advanceTimersByTime(500)
    expect(grid.querySelector('.run-time')!.textContent).toBe('—')
  })

  it('moves along the rows with the arrow keys, Home and End', () => {
    const ledger = mountLedger(grid, () => {})
    ledger.render([run(3), run(2), run(1)], 3)
    const rows = [...grid.querySelectorAll<HTMLButtonElement>('.run-card')]
    const press = (key: string): void => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) }
    rows[0]!.focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(rows[1])
    press('End')
    expect(document.activeElement).toBe(rows[2])
    press('ArrowDown')
    expect(document.activeElement).toBe(rows[2])
    press('Home')
    expect(document.activeElement).toBe(rows[0])
    press('ArrowUp')
    expect(document.activeElement).toBe(rows[0])
  })
})
