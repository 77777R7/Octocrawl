/**
 * Tables a page draws with ARIA roles instead of `<table>` (AG Grid and other data grids: `role="grid"`, `"treegrid"` or
 * `"table"` holding `role="row"` and its cells), rewritten as `<table>` elements before the page is converted, so the
 * Markdown and the tables format read them as they read a table. Eurostat's data browser draws its tables so
 * (ROADMAP PA item 4, T055).
 *
 * A grid that splits a row across containers (AG Grid's pinned columns beside its scrolled ones, each with its own
 * header) is put back together by `aria-rowindex` and `aria-colindex`; without them, rows and cells go in document
 * order. Only what is in the page is read: a grid that renders the rows and columns in view alone gives those.
 */

const GRID = '[role="grid"],[role="treegrid"],[role="table"]'
const CELL_ROLES: ReadonlySet<string> = new Set(['gridcell', 'cell', 'columnheader', 'rowheader'])

function index(el: Element, attribute: string): number | null {
  const value = Number(el.getAttribute(attribute))
  return Number.isInteger(value) && value > 0 ? value : null
}

/** The grid an element belongs to: its closest grid, or `<table>`, above it. */
function ownerOf(el: Element): Element | null {
  return el.parentElement?.closest(`table,${GRID}`) ?? null
}

/** Rewrites each outermost ARIA grid of two rows or more, with text, as a `<table>`; returns how many it rewrote. */
export function tablesFromAriaGrids(document: Document): number {
  let rewritten = 0
  for (const grid of Array.from(document.querySelectorAll(GRID))) {
    // A <table> is read as one already; a grid inside a table or another grid is that one's cell content.
    if (grid.tagName === 'TABLE' || ownerOf(grid) !== null) continue
    const rows = Array.from(grid.querySelectorAll('[role="row"]')).filter((row) => ownerOf(row) === grid || row.parentElement?.closest(GRID) === grid)
    if (rows.length < 2) continue
    const byRowIndex = rows.every((row) => index(row, 'aria-rowindex') !== null)
    const merged = new Map<number, Element[]>()
    rows.forEach((row, order) => {
      const key = byRowIndex ? index(row, 'aria-rowindex')! : order
      const cells = Array.from(row.querySelectorAll('[role]')).filter((cell) => CELL_ROLES.has(cell.getAttribute('role') ?? '') && cell.parentElement?.closest('[role="row"]') === row)
      merged.set(key, [...(merged.get(key) ?? []), ...cells])
    })
    const ordered = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells).filter((cells) => cells.length > 0)
    const all = ordered.flat()
    if (ordered.length < 2 || all.every((cell) => (cell.textContent ?? '').trim() === '')) continue
    const byColumn = all.every((cell) => index(cell, 'aria-colindex') !== null)
    const columns = byColumn ? [...new Set(all.map((cell) => index(cell, 'aria-colindex')!))].sort((a, b) => a - b) : null
    const width = columns?.length ?? Math.max(...ordered.map((cells) => cells.length))
    const table = document.createElement('table')
    const head = document.createElement('thead')
    const body = document.createElement('tbody')
    // The leading rows of column headers alone are the table's head.
    let inHead = true
    for (const cells of ordered) {
      inHead &&= cells.every((cell) => cell.getAttribute('role') === 'columnheader')
      const tr = document.createElement('tr')
      const slots: (Element | null)[] = columns === null
        ? Array.from({ length: width }, (_, i) => cells[i] ?? null)
        : columns.map((column) => cells.find((cell) => index(cell, 'aria-colindex') === column) ?? null)
      for (const cell of slots) {
        const role = cell?.getAttribute('role')
        const out = document.createElement(role === 'columnheader' || role === 'rowheader' ? 'th' : 'td')
        // The cell's own content, links and all, moves into the table: the grid it came from is replaced.
        while (cell?.firstChild) out.appendChild(cell.firstChild)
        tr.appendChild(out)
      }
      ;(inHead ? head : body).appendChild(tr)
    }
    if (head.childNodes.length > 0) table.appendChild(head)
    table.appendChild(body)
    grid.parentNode?.replaceChild(table, grid)
    rewritten++
  }
  return rewritten
}
