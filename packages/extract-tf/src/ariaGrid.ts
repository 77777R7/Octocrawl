/**
 * Tables a page draws with ARIA roles instead of `<table>` (AG Grid and other data grids: `role="grid"`, `"treegrid"` or
 * `"table"` holding `role="row"` and its cells), rewritten as `<table>` elements before the page is converted, so the
 * Markdown and the tables format read them as they read a table. Eurostat's data browser draws its tables so
 * (ROADMAP PA item 4, T055).
 *
 * A grid that splits a row across containers (AG Grid's pinned columns beside its scrolled ones, each with its own
 * header) is put back together by `aria-rowindex` and `aria-colindex`; without them, rows and cells go in document
 * order. Only what is in the page is read: a grid that renders the rows and columns in view alone gives those.
 *
 * Each cell element moves into its table cell whole, so what it is stays: a link keeps its address, a button or an
 * element the page hides is still not content. A grid left as it is: one the page hides, one whose rows are links
 * themselves, one whose cells are all controls or hold no text, one of fewer than two rows, and one inside a table or
 * another grid, which is that one's cell content.
 */

const GRID_ROLES: ReadonlySet<string> = new Set(['grid', 'treegrid', 'table'])
const GRID = '[role="grid"],[role="treegrid"],[role="table"]'
const CELL_ROLES: ReadonlySet<string> = new Set(['gridcell', 'cell', 'columnheader', 'rowheader'])

export interface AriaGridOptions {
  /** Tags the Markdown never shows (a button, a select): a cell of one is not content. */
  skipTags: ReadonlySet<string>
  /** The attribute a browser capture sets where the page's CSS hides an element. */
  hiddenMarker: string
}

interface Row { el: Element; cells: Element[] }

function index(el: Element, attribute: string): number | null {
  const value = Number(el.getAttribute(attribute))
  return Number.isInteger(value) && value > 0 ? value : null
}

const tagOf = (el: Element): string => el.tagName.toLowerCase()

/** Whether the Markdown would show any text of the element: text outside the tags it never shows and what the page hides. */
function readable(el: Element, options: AriaGridOptions): boolean {
  const stack: Node[] = [el]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.nodeType === 3) { if ((node.textContent ?? '').trim() !== '') return true; continue }
    if (node.nodeType !== 1) continue
    const element = node as Element
    if (options.skipTags.has(tagOf(element)) || element.hasAttribute(options.hiddenMarker)) continue
    for (const child of Array.from(element.childNodes)) stack.push(child)
  }
  return false
}

/**
 * The grid's own rows and their own cells, in document order, from one walk: it does not go into a table or a grid
 * inside, nor into a cell (what is in a cell is its content), nor into what the page hides.
 */
function rowsOf(grid: Element, hiddenMarker: string): Row[] {
  const rows: Row[] = []
  const stack: { el: Element; row: Row | null }[] = Array.from(grid.children).reverse().map((el) => ({ el, row: null }))
  while (stack.length > 0) {
    const { el, row } = stack.pop()!
    const role = el.getAttribute('role') ?? ''
    if (el.hasAttribute(hiddenMarker) || tagOf(el) === 'table' || GRID_ROLES.has(role)) continue
    if (row !== null && CELL_ROLES.has(role)) { row.cells.push(el); continue }
    const own = row === null && role === 'row' ? { el, cells: [] } : null
    if (own !== null) rows.push(own)
    const children = Array.from(el.children)
    for (let i = children.length - 1; i >= 0; i--) stack.push({ el: children[i]!, row: own ?? row })
  }
  return rows
}

/** Rewrites each outermost ARIA grid that reads as a table as a `<table>`; returns how many it rewrote. */
export function tablesFromAriaGrids(document: Document, options: AriaGridOptions): number {
  let rewritten = 0
  for (const grid of Array.from(document.querySelectorAll(GRID))) {
    if (tagOf(grid) === 'table' || grid.parentElement?.closest(`table,${GRID}`) != null || grid.hasAttribute(options.hiddenMarker)) continue
    const rows = rowsOf(grid, options.hiddenMarker)
    // Rows that are links themselves (a list of issues drawn as a grid) would lose their address in a table.
    if (rows.some((row) => tagOf(row.el) === 'a')) continue
    const byRowIndex = rows.every((row) => index(row.el, 'aria-rowindex') !== null)
    const merged = new Map<number, Element[]>()
    rows.forEach((row, order) => {
      const key = byRowIndex ? index(row.el, 'aria-rowindex')! : order
      const cells = merged.get(key)
      if (cells === undefined) merged.set(key, [...row.cells])
      else cells.push(...row.cells)
    })
    const ordered = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells).filter((cells) => cells.length > 0)
    const all = ordered.flat()
    // A grid of controls (a toolbar, a date picker's buttons) or of no text is not a table of content.
    if (ordered.length < 2 || !all.some((cell) => readable(cell, options))) continue
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
      const byIndex = columns === null ? null : new Map<number, Element>()
      if (byIndex !== null) for (const cell of cells) { const column = index(cell, 'aria-colindex')!; if (!byIndex.has(column)) byIndex.set(column, cell) }
      const slots: (Element | undefined)[] = byIndex === null ? Array.from({ length: width }, (_, i) => cells[i]) : columns!.map((column) => byIndex.get(column))
      const tr = document.createElement('tr')
      for (const cell of slots) {
        const role = cell?.getAttribute('role')
        const out = document.createElement(role === 'columnheader' || role === 'rowheader' ? 'th' : 'td')
        // The cell itself moves in: a link keeps its address, a control or a part the page hides is still not content.
        if (cell !== undefined) out.appendChild(cell)
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
