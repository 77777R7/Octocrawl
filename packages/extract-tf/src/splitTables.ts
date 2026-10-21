/**
 * One table drawn as two, side by side: a narrow table of row names fixed at
 * the left and a wide table of their values that scrolls beside it (a "frozen
 * first column" layout, as sports standings and finance screens use). Read
 * apart, the names lose their values and the values their names. They are put
 * back together only when nothing says they are two tables: they are adjacent
 * with no text between them, their header rows and body rows match one to one
 * (by a row key both declare, or by position when neither declares one), and
 * the narrow one does not repeat in the wide one. Nothing is matched by host.
 *
 * Runs on the cleaned page, after the caller's exclusions are removed: an
 * excluded half is gone, and its other half stays as it was.
 */

import { commonAncestor, qsa, textOf } from './dom.js'

/** The most columns the fixed name table may have (a rank and a name). */
const MAX_NAME_COLUMNS = 2
/** Fewer body rows than this is too little to tell a split table from two small ones. */
const MIN_ROWS = 2

const squeeze = (s: string): string => s.replace(/\s+/g, '')

interface Parts { head: Element[]; body: Element[] }

/** A table's own rows, header rows (in a thead) apart from body rows; null when it nests a table or spans cells. */
function parts(table: Element): Parts | null {
  if (table.querySelector('table,[rowspan],[colspan]') !== null) return null
  const rows = qsa(table, 'tr').filter((tr) => tr.closest('table') === table)
  const head = rows.filter((tr) => tr.parentElement?.localName === 'thead')
  return { head, body: rows.filter((tr) => !head.includes(tr)) }
}

const cells = (row: Element): Element[] => Array.from(row.children).filter((c) => c.localName === 'td' || c.localName === 'th')

/** Every row's cell count when all rows have the same, else null. */
function width(rows: readonly Element[]): number | null {
  const counts = new Set(rows.map((r) => cells(r).length))
  return counts.size === 1 ? [...counts][0]! : null
}

/**
 * The value table's body rows in the name table's order: by a `data-*` row
 * key both tables put on every body row (unique within each, the same set in
 * both), else by position. Null when a key both declare does not match.
 */
function aligned(names: readonly Element[], values: readonly Element[]): Element[] | null {
  const keyNames = names[0]!.getAttributeNames().filter((a) => a.startsWith('data-') &&
    [...names, ...values].every((r) => r.hasAttribute(a)))
  if (keyNames.length === 0) return [...values]
  for (const key of keyNames) {
    const byKey = new Map(values.map((r) => [r.getAttribute(key)!, r]))
    const keys = names.map((r) => r.getAttribute(key)!)
    if (byKey.size === values.length && new Set(keys).size === names.length && keys.every((k) => byKey.has(k))) return keys.map((k) => byKey.get(k)!)
  }
  return null
}

/** The joined table, or null when the two are not one table split in two. */
function join(doc: Document, left: Element, right: Element): Element | null {
  const shared = commonAncestor(left, right)
  // Adjacent: the smallest element holding both holds nothing else that reads.
  if (shared === null || squeeze(textOf(shared)) !== squeeze(textOf(left)) + squeeze(textOf(right))) return null
  const l = parts(left)
  const r = parts(right)
  if (l === null || r === null || l.head.length !== r.head.length || l.body.length !== r.body.length || l.body.length < MIN_ROWS) return null
  const nameWidth = width([...l.head, ...l.body])
  const valueWidth = width([...r.head, ...r.body])
  if (nameWidth === null || valueWidth === null || nameWidth > MAX_NAME_COLUMNS || valueWidth <= nameWidth) return null
  // Every row has a name.
  if (l.body.some((row) => cells(row).some((c) => textOf(c).trim() === ''))) return null
  const values = aligned(l.body, r.body)
  if (values === null) return null
  // A wide table that already starts with the names is the whole table; the narrow one is its fixed copy.
  const said = (row: Element, n: number) => cells(row).slice(0, n).map((c) => squeeze(textOf(c))).join('|')
  if (l.body.every((row, i) => said(row, nameWidth) === said(values[i]!, nameWidth))) return null
  if (left.querySelector('caption') !== null && right.querySelector('caption') !== null) return null

  const table = doc.createElement('table')
  const caption = left.querySelector('caption') ?? right.querySelector('caption')
  if (caption !== null) table.appendChild(caption.cloneNode(true))
  const section = (tag: string, pairs: Array<[Element, Element]>) => {
    if (pairs.length === 0) return
    const group = doc.createElement(tag)
    for (const [name, value] of pairs) {
      const row = doc.createElement('tr')
      for (const cell of [...cells(name), ...cells(value)]) row.appendChild(cell.cloneNode(true))
      group.appendChild(row)
    }
    table.appendChild(group)
  }
  section('thead', l.head.map((row, i) => [row, r.head[i]!]))
  section('tbody', l.body.map((row, i) => [row, values[i]!]))
  return table
}

/** Joins each pair of adjacent tables that is one table split into a fixed name column and its scrolling values. */
export function joinSplitTables(doc: Document): void {
  const tables = qsa(doc, 'table').filter((t) => t.parentElement?.closest('table') == null)
  for (let i = 0; i + 1 < tables.length; i++) {
    const left = tables[i]!
    const right = tables[i + 1]!
    const joined = join(doc, left, right)
    if (joined === null) continue
    left.replaceWith(joined)
    right.remove()
    i++
  }
}
