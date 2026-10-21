/**
 * One table drawn as two, side by side: a narrow table of row names fixed at
 * the left and a wide table of their values that scrolls beside it (a "frozen
 * first column" layout, as sports standings and finance screens use). Read
 * apart, the names lose their values and the values their names. They are put
 * back together only when nothing says they are two tables: on the page as
 * received, the smallest element holding both holds nothing else but empty
 * div/span wrappers (no text, heading, image, icon, button or tab); their
 * header rows and body rows match one to one (by a row key both declare, or by
 * position when neither declares one); and the narrow one does not repeat in
 * the wide one. Nothing is matched by host.
 *
 * The pairs are found before cleaning, which removes the buttons, tabs and
 * icons that can be all that tells two tables apart; they are joined after
 * cleaning and the caller's exclusions, from what is left of them.
 */

import { commonAncestor, qsa, textOf } from './dom.js'

/** The most columns the fixed name table may have (a rank and a name). */
const MAX_NAME_COLUMNS = 2
/** Fewer body rows than this is too little to tell a split table from two small ones. */
const MIN_ROWS = 2
/** What may stand between the two halves: wrappers, when they hold no text. */
const WRAPPERS: ReadonlySet<string> = new Set(['div', 'span'])

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

const said = (row: Element, n: number): string => cells(row).slice(0, n).map((c) => squeeze(textOf(c))).join('|')

/** How the two halves' rows pair up, or null when they are not one table split in two. */
function plan(left: Element, right: Element): { head: Array<[Element, Element]>; body: Array<[Element, Element]> } | null {
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
  // A wide table that starts with the names, or with the name column's heading, is a table of its own (or the whole table, of which the narrow one is a fixed copy).
  if (l.body.every((row, i) => said(row, nameWidth) === said(values[i]!, nameWidth))) return null
  if (l.head.some((row, i) => said(row, nameWidth).replace(/\|/g, '') !== '' && said(row, nameWidth) === said(r.head[i]!, nameWidth))) return null
  if (left.querySelector('caption') !== null && right.querySelector('caption') !== null) return null
  return { head: l.head.map((row, i) => [row, r.head[i]!]), body: l.body.map((row, i) => [row, values[i]!]) }
}

/** Whether the smallest element holding both tables holds nothing else but empty div/span wrappers (a loop, not recursion). */
function adjacent(left: Element, right: Element): boolean {
  const shared = commonAncestor(left, right)
  if (shared === null) return false
  const stack: Node[] = Array.from(shared.childNodes)
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === left || node === right) continue
    if (node.nodeType === 3) {
      if ((node.textContent ?? '').trim() !== '') return false
      continue
    }
    if (node.nodeType !== 1) continue
    if (!WRAPPERS.has((node as Element).localName)) return false
    stack.push(...Array.from(node.childNodes))
  }
  return true
}

/** The joined table, its rows moved (not copied) from the two halves, so marks other passes left on cells stay on them. */
function join(doc: Document, left: Element, right: Element, rows: NonNullable<ReturnType<typeof plan>>): Element {
  const table = doc.createElement('table')
  const caption = left.querySelector('caption') ?? right.querySelector('caption')
  if (caption !== null) table.appendChild(caption)
  const section = (tag: string, pairs: Array<[Element, Element]>) => {
    if (pairs.length === 0) return
    const group = doc.createElement(tag)
    for (const [name, value] of pairs) {
      const row = doc.createElement('tr')
      for (const cell of [...cells(name), ...cells(value)]) row.appendChild(cell)
      group.appendChild(row)
    }
    table.appendChild(group)
  }
  section('thead', rows.head)
  section('tbody', rows.body)
  return table
}

/**
 * Finds, on the page as received, each pair of adjacent tables that is one
 * table split into a fixed name column and its scrolling values; the function
 * it returns joins them once the page is cleaned, from what is left of them
 * (a pair a caller's exclusion or cleaning broke stays apart).
 */
export function prepareSplitTables(doc: Document): () => void {
  const tables = qsa(doc, 'table').filter((t) => t.parentElement?.closest('table') == null)
  const pairs: Array<[Element, Element]> = []
  for (let i = 0; i + 1 < tables.length; i++) {
    const left = tables[i]!
    const right = tables[i + 1]!
    // The cheap structural checks first; the walk of what lies between only for a pair that passes them.
    if (plan(left, right) === null || !adjacent(left, right)) continue
    pairs.push([left, right])
    i++
  }
  return () => {
    for (const [left, right] of pairs) {
      if (!left.isConnected || !right.isConnected) continue
      const rows = plan(left, right)
      if (rows === null) continue
      const joined = join(doc, left, right, rows)
      left.replaceWith(joined)
      right.remove()
    }
  }
}
