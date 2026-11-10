import { buildWindow } from './windowBuild'

/** Recent runs as a ledger: one row for each extraction of this visit, newest first, under the names of its columns
 * (page.ts). A row is a button that selects its run. Rows are kept and written in place, so a row that has the focus
 * keeps it, and each prints itself the way the result window does (windowBuild.ts) when it first comes on screen and
 * again when its result arrives. A run that is still out counts its time up. */

export interface LedgerRun {
  id: number
  /** The page's address as the row shows it. */
  label: string
  type: string
  status: { text: string; tone: 'loading' | 'success' | 'partial' | 'error' }
  /** The run's total time; null while it is still out, when the row counts up from `since`. */
  time: string | null
  /** When the run was sent (performance.now). */
  since: number
  started: string
  output: string
}

export interface Ledger {
  /** Shows these runs in this order, the selected one marked. */
  render(runs: readonly LedgerRun[], selectedId: number): void
  /** Writes a finished run's time again (the browser's own measurement comes a frame after the result). */
  setTime(id: number, time: string): void
}

interface Row {
  element: HTMLButtonElement
  glyph: HTMLElement
  url: HTMLElement
  type: HTMLElement
  status: HTMLElement
  time: HTMLElement
  started: HTMLElement
  output: HTMLElement
  /** The run was still out when the row was last written, and since when. */
  out: boolean
  since: number
}

/** How long a row takes to print, and how often a running one's time is written. */
const PRINT_MS = 240
const TICK_MS = 100

const span = (className: string, text = ''): HTMLElement => {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}
const write = (element: HTMLElement, text: string): void => {
  if (element.textContent !== text) element.textContent = text
}

export function mountLedger(grid: HTMLElement, select: (id: number) => void): Ledger {
  const rows = new Map<number, Row>()
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let ticking = 0

  /** A cell under one of the ledger's column names. The name is read out with it: the header row is only for the eye,
   * since the row is a button. */
  function field(key: string, kind: string, valueClass: string): { cell: HTMLElement; value: HTMLElement } {
    const cell = span(`run-field ${kind}`)
    const value = span(valueClass)
    cell.append(span('visually-hidden', `${key}: `), value)
    return { cell, value }
  }

  function create(id: number): Row {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'run-card'
    element.dataset.run = String(id)
    const glyph = span('run-glyph')
    glyph.setAttribute('aria-hidden', 'true')
    const url = span('run-url')
    const page = span('run-page')
    page.append(glyph, url)
    const type = field('Type', 'run-type', 'run-value')
    const status = field('Status', 'run-state', 'run-status')
    const time = field('Total time', 'run-num', 'run-time')
    const started = field('Started', 'run-num run-started', 'run-value')
    const output = field('Output', 'run-output', 'run-value')
    // What a click does: the run's result is shown below.
    const go = span('run-go', '↓')
    go.setAttribute('aria-hidden', 'true')
    element.append(page, type.cell, status.cell, time.cell, started.cell, output.cell, go)
    element.addEventListener('click', () => select(id))
    return { element, glyph, url, type: type.value, status: status.value, time: time.value, started: started.value, output: output.value, out: false, since: 0 }
  }

  /** The time a run has been out, as the crawl window's foot counts it. */
  const elapsed = (row: Row): string => `${(Math.max(0, performance.now() - row.since) / 1000).toFixed(1)} s`

  function tick(): void {
    ticking = 0
    let any = false
    for (const row of rows.values()) {
      if (!row.out) continue
      any = true
      write(row.time, elapsed(row))
    }
    if (any) ticking = window.setTimeout(tick, TICK_MS)
  }

  function render(runs: readonly LedgerRun[], selectedId: number): void {
    const kept = new Set<number>()
    runs.forEach((run, index) => {
      kept.add(run.id)
      let row = rows.get(run.id)
      const fresh = !row
      if (!row) {
        row = create(run.id)
        rows.set(run.id, row)
      }
      const landed = row.out && run.time !== null
      row.out = run.time === null
      row.since = run.since
      row.element.classList.toggle('is-out', row.out)
      write(row.glyph, run.label.charAt(0).toUpperCase())
      write(row.url, run.label)
      write(row.type, run.type)
      write(row.status, run.status.text)
      row.status.className = `run-status tone-${run.status.tone}`
      // A run that is out counts its time up, unless the visitor asked for less motion.
      write(row.time, run.time ?? (motion.matches ? '—' : elapsed(row)))
      write(row.started, run.started)
      write(row.output, run.output)
      row.element.setAttribute('aria-pressed', String(run.id === selectedId))
      if (grid.children[index] !== row.element) grid.insertBefore(row.element, grid.children[index] ?? null)
      // A new row prints itself; so does a row whose result has just arrived. Its monospaced cells decode.
      if (fresh || landed) buildWindow(row.element, row.out ? [row.started] : [row.time, row.started, row.output], PRINT_MS)
    })
    for (const [id, row] of rows) {
      if (kept.has(id)) continue
      row.element.remove()
      rows.delete(id)
    }
    if (!ticking && !motion.matches && [...rows.values()].some((row) => row.out)) ticking = window.setTimeout(tick, TICK_MS)
  }

  // Up and Down move along the rows, Home and End to the first and last.
  grid.addEventListener('keydown', (event) => {
    const list = [...grid.querySelectorAll<HTMLElement>('.run-card')]
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    const next = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1
    if (next < 0 || next >= list.length || next === at) return
    event.preventDefault()
    list[next]!.focus()
  })

  return {
    render,
    setTime(id, time) {
      const row = rows.get(id)
      if (row && !row.out) write(row.time, time)
    },
  }
}
