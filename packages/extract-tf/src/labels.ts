/**
 * Label/value pairs a page states in its main content: two-cell table rows
 * (a `<th>` label and a `<td>` value) and definition-list pairs (one `<dt>`
 * and one `<dd>`). JSON extraction matches the labels to schema keys, so a
 * pair is kept only where the page itself says which label a value has:
 * rows of data cells, header rows and terms sharing descriptions are not.
 */

import type { LabelledValue } from '@w2l/contracts'
import { qsa, tagOf } from './dom.js'

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** The element itself when it matches, then its matching descendants. */
function selfAndBelow(root: Element, selector: string): Element[] {
  return [...(root.matches(selector) ? [root] : []), ...qsa(root, selector)]
}

function tableRows(table: Element, index: number): LabelledValue[] {
  const pairs: LabelledValue[] = []
  const rows = qsa(table, 'tr').filter((tr) => tr.closest('table') === table)
  for (const [r, row] of rows.entries()) {
    const cells = Array.from(row.children).filter((cell) => tagOf(cell) === 'th' || tagOf(cell) === 'td')
    if (cells.length !== 2 || tagOf(cells[0]!) !== 'th' || tagOf(cells[1]!) !== 'td') continue
    const label = textOf(cells[0]!)
    const value = textOf(cells[1]!)
    if (label.length > 0 && value.length > 0) pairs.push({ label, value, path: `table[${index}] tr[${r}]` })
  }
  return pairs
}

function listPairs(dl: Element, index: number): LabelledValue[] {
  // Terms and descriptions are children of the dl or of div groups inside it.
  const items = Array.from(dl.children)
    .flatMap((child) => (tagOf(child) === 'div' ? Array.from(child.children) : [child]))
    .filter((item) => tagOf(item) === 'dt' || tagOf(item) === 'dd')
  const pairs: LabelledValue[] = []
  let term = -1
  for (const [i, item] of items.entries()) {
    if (tagOf(item) !== 'dt') continue
    term++
    // One term with exactly one description: not a term that shares its
    // description with the one before, nor one with several descriptions.
    const before = items[i - 1]
    const next = items[i + 1]
    const after = items[i + 2]
    if (before !== undefined && tagOf(before) === 'dt') continue
    if (next === undefined || tagOf(next) !== 'dd' || (after !== undefined && tagOf(after) === 'dd')) continue
    const label = textOf(item)
    const value = textOf(next)
    if (label.length > 0 && value.length > 0) pairs.push({ label, value, path: `dl[${index}] dt[${term}]` })
  }
  return pairs
}

/** Every label/value pair in the main content: table rows first, then definition lists. */
export function collectLabelledValues(main: Element): LabelledValue[] {
  return [
    ...selfAndBelow(main, 'table').flatMap((table, t) => tableRows(table, t)),
    ...selfAndBelow(main, 'dl').flatMap((dl, d) => listPairs(dl, d)),
  ]
}
