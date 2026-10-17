import { parseHTML } from 'linkedom'

/** A bounded live read, located by element-child indexes below document.body. */
export interface CapturedShadowTable {
  hostPath: readonly number[]
  hostTag: string
  rows: readonly (readonly string[])[]
}

/**
 * One parse for the conversion copy, only when the browser captured a table.
 * Structural paths cannot mistake a script string or inert example template
 * for the live component. Raw evidence keeps the native shadow templates.
 */
export function materializeShadowTables(html: string, captures: readonly CapturedShadowTable[]): string | null {
  if (html.length > 1_000_000 || captures.length === 0 || captures.length > 32) return null
  let cells = 0
  let characters = 0
  let rows = 0
  for (const capture of captures) {
    if (capture.hostPath.length === 0 || capture.hostPath.length > 128 || capture.hostPath.some(index => !Number.isInteger(index) || index < 0 || index > 100_000)) return null
    if (capture.rows.length < 2 || (rows += capture.rows.length - 1) > 2_000) return null
    const columns = capture.rows[0]!.length
    if (columns < 2 || columns > 64) return null
    for (const row of capture.rows) {
      if (row.length !== columns) return null
      for (const value of row) {
        if (typeof value !== 'string' || ++cells > 20_000 || (characters += value.length) > 1_000_000) return null
      }
    }
  }
  const { document } = parseHTML(html)
  for (const capture of captures) {
    let host: Element | undefined = document.body
    for (const index of capture.hostPath) host = host?.children[index]
    if (host === undefined || host.localName !== capture.hostTag || host.children.length !== 1) return null
    const template = host.children[0]!
    if (template.localName !== 'template' || template.getAttribute('shadowrootmode') !== 'open') return null
    const sourceTables = Array.from((template as HTMLTemplateElement).content.querySelectorAll('[role="table"]'))
    if (sourceTables.length !== 1) return null
    const sourceRows = Array.from(sourceTables[0]!.querySelectorAll('[role="row"]'))
    if (sourceRows.length !== capture.rows.length) return null
    for (let index = 0; index < sourceRows.length; index++) {
      const row = sourceRows[index]!
      const sourceCells = Array.from(row.querySelectorAll('[role="cell"],[role="columnheader"],[role="rowheader"]'))
      if (sourceCells.length !== capture.rows[index]!.length) return null
      if (index === 0 && row.getAttribute('part')?.split(/\s+/).includes('table-header-row') !== true && !sourceCells.every(cell => cell.getAttribute('role') === 'columnheader')) return null
      for (let column = 0; column < sourceCells.length; column++) {
        const cell = sourceCells[column]!
        if (cell.closest('[role="row"]') !== row || cell.childElementCount !== 0 || (cell.textContent ?? '').replace(/\s+/g, ' ').trim() !== capture.rows[index]![column]) return null
      }
    }
    const table = document.createElement('table')
    for (let index = 0; index < capture.rows.length; index++) {
      const tr = document.createElement('tr')
      for (const value of capture.rows[index]!) {
        const cell = document.createElement(index === 0 ? 'th' : 'td')
        cell.textContent = value
        tr.appendChild(cell)
      }
      table.appendChild(tr)
    }
    template.replaceWith(table)
  }
  return document.toString()
}
