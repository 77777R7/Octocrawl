/**
 * The list format: the records of a page. Every element the request's
 * `itemSelector` matches is a record, unless it sits inside another matched
 * one (then it is part of that record, not a record of its own); each field
 * is read from the record: the text of its first match within the record
 * (document order), or of the record itself without a selector, or one
 * attribute instead of the text. Read from the document as received (the
 * rendered DOM on a browser lane). Deterministic, no model. A value the
 * record does not have is null and named in `missing`: nothing is filled in.
 */

import { createHash } from 'node:crypto'
import type { ListColumn, ListDetection, ListExtraction, ListFormatRequest, ListRecord, ListSpec, ListTableText } from '@w2l/contracts'
import { detectFields, detectLists } from './detectList.js'
import { detachAll, parse, qsa } from './dom.js'
import { documentBaseUrl } from './links.js'
import { nonNegativeInteger, ownCells, ownRows, rowGroup } from './markdown.js'
import { namedBy } from './selectors.js'

/** The most records one list carries, and the most characters of values in all: past either, the list is cut and says so. */
export const MAX_LIST_RECORDS = 10_000
export const MAX_LIST_VALUE_CHARS = 5_000_000

/** Attributes whose value is a URL: made absolute against the page's URL, as `links` are. */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'src', 'data-src', 'data-href', 'srcset', 'poster', 'action', 'data-url', 'data-original'])

/**
 * The records of one page: its URL, and its number among the pages of a list
 * (1 when one page is read). At most `budget.records` records and
 * `budget.chars` characters of values; `cut` says when the page had more.
 * With `read.columns`, `columns` holds each kept record's table columns
 * (`rowColumns`), in record order, each naming the fields read under it, and
 * `tables` what their tables state about themselves, once per table.
 */
export function extractListRecords(html: string, url: string, spec: ListSpec, page = 1, budget: { records: number; chars: number } = { records: MAX_LIST_RECORDS, chars: MAX_LIST_VALUE_CHARS }, scope: { includeSelectors?: readonly string[]; excludeSelectors?: readonly string[] } = {}, read: { columns?: boolean } = {}): ListRecord[] & { cut?: boolean; itemText?: string; columns?: (ListColumn[] | null)[]; tables?: ListTableText[] } {
  const doc = parse(html)
  const document = doc.document
  // Links resolve as the page resolves them: against its <base href> when it has one.
  const base = documentBaseUrl(document, url) ?? url
  const place = new Map<Element, number>()
  for (const el of qsa(document, '*')) place.set(el, place.size)
  const order = (a: Element, b: Element) => (place.get(a) ?? 0) - (place.get(b) ?? 0)
  const matched = namedBy(document, [spec.itemSelector])
  // A record inside another record is part of it.
  const items = [...matched].filter((el) => !hasAncestorIn(el, matched)).sort(order)
  const fieldMatches = spec.fields.map((field) => (field.selector === undefined ? null : namedBy(document, [field.selector])))
  // Match against the original tree, so an item selector such as `main > .card`
  // keeps its context. A user's selection bounds records too; exclusions must
  // not come back as record fields after they were removed from the answer.
  const included = scope.includeSelectors?.length ? namedBy(document, scope.includeSelectors) : null
  const excluded = namedBy(document, scope.excludeSelectors ?? [])
  const kept = new Set(items.filter(item =>
    !excluded.has(item) && !hasAncestorIn(item, excluded) &&
    (included === null || included.has(item) || hasAncestorIn(item, included))))
  detachAll(excluded)
  const records: ListRecord[] & { cut?: boolean; itemText?: string; columns?: (ListColumn[] | null)[]; tables?: ListTableText[] } = []
  const columns: (ListColumn[] | null)[] = []
  const heads = new Map<Element, TableHead | null>()
  const tables: ListTableText[] = []
  // Column text is bounded apart from the values: a cell under many headers is repeated under each.
  const columnBudget = { left: budget.chars }
  // The whole text of every item, not only the fields asked for: what tells this page's records from another page's.
  Object.defineProperty(records, 'itemText', { value: items.filter(item => kept.has(item)).map((item) => textOf(item) ?? '').join('\u0000'), enumerable: false })
  let chars = 0
  for (const [index, item] of items.entries()) {
    // Keep the original match index as its evidence position, even when a
    // preceding record was outside the selection or explicitly excluded.
    if (!kept.has(item)) continue
    if (records.length >= budget.records) { records.cut = true; break }
    const descendants = qsa(item, '*')
    const values: Record<string, string | null> = {}
    const missing: string[] = []
    const found: { name: string; el: Element }[] = []
    spec.fields.forEach((field, i) => {
      const among = fieldMatches[i]
      const el = among === null ? item : descendants.find((candidate) => among!.has(candidate)) ?? null
      if (el !== null) found.push({ name: field.name, el })
      const value = el === null ? null : field.attribute === undefined ? textOf(el) : attributeValue(el, field.attribute, base)
      values[field.name] = value
      if (value === null) missing.push(field.name)
    })
    chars += Object.values(values).reduce((sum, value) => sum + (value?.length ?? 0), 0)
    if (chars > budget.chars) { records.cut = true; break }
    records.push({ values, missing, source: { url, page, index } })
    if (read.columns === true) columns.push(rowColumns(item, heads, columnBudget, found, tables))
  }
  doc.close()
  if (read.columns === true) {
    Object.defineProperty(records, 'columns', { value: columns, enumerable: false })
    Object.defineProperty(records, 'tables', { value: tables, enumerable: false })
  }
  return records
}

/** A table's one header row: each header's text and the columns it covers (1-based, inclusive), and what the table states about itself (`tableText`, read with the first row read). */
type TableHead = { row: Element; headers: { header: string; start: number; end: number }[]; text?: number | null }

/**
 * A table row's columns: each header of its table, with the text of the row's
 * cells the header covers, joined by a space. Null when the item is not a row
 * of a table, is its header row, or the table does not have exactly one header
 * row (the leading rows in its `<thead>` or made of `<th>` cells alone, as the
 * `tables` format counts them), or any of its cells spans rows, which would
 * move the cells under a header. A cell counts the columns its `colspan`
 * covers. The table's header is read once (`heads`). Null too once the
 * columns' text would pass `budget.left` characters, which it then stays.
 * A column names the fields of `read` whose element is in a cell under it,
 * and the index in `tables` of the table's own text (`tableText`) when it has
 * any, which is added there once and counts against the budget once.
 */
function rowColumns(item: Element, heads: Map<Element, TableHead | null>, budget: { left: number }, read: readonly { name: string; el: Element }[], tables: ListTableText[]): ListColumn[] | null {
  if (item.localName !== 'tr') return null
  let table: Element | null = item.parentElement
  while (table !== null && table.localName !== 'table') table = table.parentElement
  if (table === null) return null
  if (!heads.has(table)) heads.set(table, tableHead(table))
  const head = heads.get(table)!
  if (head === null || head.row === item) return null
  const cells: { text: string | null; start: number; end: number; fields: string[] }[] = []
  let next = 1
  for (const cell of ownCells(item)) {
    const span = spanOf(cell)
    cells.push({ text: textOf(cell), start: next, end: next + span - 1, fields: read.filter(({ el }) => cell === el || cell.contains(el)).map(({ name }) => name) })
    next += span
  }
  const unders = head.headers.map(({ start, end }) => cells.filter(cell => cell.start <= end && cell.end >= start && cell.text !== null).map(cell => cell.text!))
  // Measured before any text is joined.
  let chars = unders.reduce((sum, under) => sum + under.reduce((n, text) => n + text.length + 1, 0), 0)
  const text = head.text === undefined ? tableText(table) : null
  if (text !== null) chars += (text.caption?.length ?? 0) + text.before.reduce((n, block) => n + block.text.length + block.element.length, 0)
  if (chars > budget.left) { budget.left = -1; return null }
  budget.left -= chars
  if (head.text === undefined) head.text = text === null ? null : tables.push(text) - 1
  return head.headers.map(({ header, start, end }, i) => {
    const fields = cells.filter(cell => cell.start <= end && cell.end >= start).flatMap(cell => cell.fields)
    return {
      header, column: start, value: unders[i]!.length === 0 ? null : unders[i]!.join(' '),
      ...(fields.length === 0 ? {} : { fields: [...new Set(fields)] }),
      ...(typeof head.text === 'number' ? { table: head.text } : {}),
    }
  })
}

function tableHead(table: Element): TableHead | null {
  const rows = ownRows(table)
  let headerRows = 0
  for (const tr of rows) {
    const cells = ownCells(tr)
    if (cells.length === 0 || !(rowGroup(tr, table)?.localName === 'thead' || cells.every(el => el.localName === 'th'))) break
    headerRows++
  }
  if (headerRows !== 1) return null
  if (rows.some(tr => ownCells(tr).some(cell => (nonNegativeInteger(cell.getAttribute('rowspan')) ?? 1) !== 1))) return null
  const headers: TableHead['headers'] = []
  let next = 1
  for (const cell of ownCells(rows[0]!)) {
    const span = spanOf(cell)
    const header = textOf(cell)
    if (header !== null) headers.push({ header, start: next, end: next + span - 1 })
    next += span
  }
  return headers.length === 0 ? null : { row: rows[0]!, headers }
}

/** The most blocks, and the longest one, read before a table: past them the text is the page's, not the table's. */
const BEFORE_BLOCKS = 4
const BEFORE_CHARS = 200
const HEADING = /^h[1-6]$/
/** Content that stands between a table and what introduces it: text before it is about something else. */
const OTHER_CONTENT = 'table, ul, ol, dl, form, nav'

/**
 * What a table states about itself (ListTableText): its caption, and the
 * blocks just before it back to the heading that introduces it, each at most
 * BEFORE_CHARS characters, at most BEFORE_BLOCKS of them. A longer block, a
 * list, a form or another table ends them. A table that is the first element
 * of its wrappers is introduced by what stands before them (three levels up).
 * Null when it states neither.
 */
function tableText(table: Element): ListTableText | null {
  const captionEl = Array.from(table.children).find(child => child.localName === 'caption')
  const captionText = captionEl === undefined ? null : textOf(captionEl)
  const caption = captionText !== null && captionText.length <= BEFORE_CHARS ? captionText : null
  let at = table
  for (let up = 0; up < 3 && previousBlock(at) === null; up++) {
    const parent = at.parentElement
    if (parent === null || parent.localName === 'body' || parent.localName === 'html') break
    at = parent
  }
  const before: { text: string; element: string; distance: number }[] = []
  for (let el = previousBlock(at); el !== null && before.length < BEFORE_BLOCKS; el = previousBlock(el)) {
    if (el.matches(OTHER_CONTENT) || qsa(el, OTHER_CONTENT).length > 0) break
    const text = textOf(el)
    if (text === null) continue
    if (text.length > BEFORE_CHARS) break
    before.push({ text, element: elementName(el), distance: before.length + 1 })
    if (HEADING.test(el.localName) || qsa(el, 'h1, h2, h3, h4, h5, h6').length > 0) break
  }
  return caption === null && before.length === 0 ? null : { caption, before }
}

/** The element before this one that a reader can see text in: scripts and styles skipped. */
function previousBlock(el: Element): Element | null {
  let prev = el.previousElementSibling
  while (prev !== null && NOT_TEXT.has(prev.localName)) prev = prev.previousElementSibling
  return prev
}

/** An element as a locator names it: its tag with its id, or else its first class (`span.ratesTimestamp`). */
function elementName(el: Element): string {
  const id = el.getAttribute('id')?.trim()
  if (id) return `${el.localName}#${id}`
  const first = el.getAttribute('class')?.trim().split(/\s+/)[0]
  return first ? `${el.localName}.${first}` : el.localName
}

/** The columns a cell covers, as browsers read `colspan`: an invalid value or 0 is 1, at most 1000. */
function spanOf(cell: Element): number {
  return Math.min(nonNegativeInteger(cell.getAttribute('colspan')) || 1, 1000)
}

/**
 * The list a request names, read on the page when it leaves the items or
 * their fields to W2L: `detected` then says what was chosen (null `spec`
 * when the page has no list). One page's choice is every page's: a paginate
 * step's pages are read with what its first page gave.
 */
export function resolveListSpec(html: string, request: ListFormatRequest): { spec: ListSpec | null; detected?: ListDetection } {
  if (request.itemSelector !== undefined && request.fields !== undefined) return { spec: { type: 'list', itemSelector: request.itemSelector, fields: request.fields } }
  // A lane asks twice of one page (is it content, then its records): the second answer is the first.
  if (lastResolved !== null && lastResolved.html === html && lastResolved.request === request) return lastResolved.resolved
  const resolved = detectSpec(html, request)
  lastResolved = { html, request, resolved }
  return resolved
}

let lastResolved: { html: string; request: ListFormatRequest; resolved: { spec: ListSpec | null; detected?: ListDetection } } | null = null

function detectSpec(html: string, request: ListFormatRequest): { spec: ListSpec | null; detected?: ListDetection } {
  if (request.itemSelector !== undefined) {
    const fields = detectFields(html, request.itemSelector) ?? []
    return { spec: { type: 'list', itemSelector: request.itemSelector, fields }, detected: { fields, alternatives: [] } }
  }
  const [best, ...rest] = detectLists(html)
  if (best === undefined) return { spec: null, detected: { fields: [], alternatives: [] } }
  return { spec: { type: 'list', itemSelector: best.itemSelector, fields: best.fields }, detected: { fields: best.fields, alternatives: rest.map((list) => ({ itemSelector: list.itemSelector, count: list.count })) } }
}

/** The list of one or more pages' records: CSV with the fields, then source_url, page and index. `truncated` when a limit cut it. A null `spec`: no list was found. */
export function listExtraction(spec: ListSpec | null, records: readonly ListRecord[], pages: number, truncated = false, detected?: ListDetection): ListExtraction {
  const fields = (spec?.fields ?? []).map((field) => field.name)
  const rows = [[...fields, 'source_url', 'page', 'index'], ...records.map((record) => [...fields.map((name) => record.values[name] ?? ''), record.source.url, String(record.source.page), String(record.source.index)])]
  const csv = csvOf(rows)
  return {
    itemSelector: spec?.itemSelector ?? null,
    fields,
    ...(detected === undefined ? {} : { detected }),
    records: [...records],
    pages,
    incomplete: records.filter((record) => record.missing.length > 0).length,
    truncated,
    csv,
    csvSha256: createHash('sha256').update(csv, 'utf8').digest('hex'),
  }
}

function hasAncestorIn(el: Element, set: ReadonlySet<Element>): boolean {
  for (let up = el.parentElement; up !== null; up = up.parentElement) if (set.has(up)) return true
  return false
}

/** Elements whose content is not text a reader sees. */
// An SVG's text (a rating's 4.5) is seen; its title and description are not.
const NOT_TEXT: ReadonlySet<string> = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'script', 'style', 'title', 'desc', 'TITLE', 'DESC'])
/** Elements that start a new line of text, so the text of two of them does not run together. */
const BLOCK: ReadonlySet<string> = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL', 'OPTION', 'BUTTON', 'LABEL'])

/** The element's text as a reader sees it: scripts and styles left out, blocks apart, whitespace collapsed; null when it has none. */
export function textOf(el: Element): string | null {
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === 3) { parts.push(node.nodeValue ?? ''); return }
    if (node.nodeType !== 1) return
    const name = (node as Element).tagName
    if (NOT_TEXT.has(name)) return
    const block = BLOCK.has(name.toUpperCase())
    if (block) parts.push(' ')
    for (const child of Array.from(node.childNodes)) walk(child)
    if (block) parts.push(' ')
  }
  for (const child of Array.from(el.childNodes)) walk(child)
  const text = parts.join('').replace(/\s+/g, ' ').trim()
  return text === '' ? null : text
}

/** An attribute matched by name case-insensitively, as HTML does; a URL one made absolute. Null when absent or empty. */
function attributeValue(el: Element, name: string, base: string): string | null {
  let value = el.getAttribute(name)
  if (value === null) {
    const lower = name.toLowerCase()
    for (const attr of Array.from(el.attributes)) if (attr.name.toLowerCase() === lower) value = attr.value
  }
  if (value === null || value.trim() === '') return null
  const trimmed = value.trim()
  if (!URL_ATTRIBUTES.has(name.toLowerCase()) || name.toLowerCase() === 'srcset') return trimmed
  try {
    return new URL(trimmed, base).href
  } catch {
    return trimmed
  }
}

/** RFC 4180 CSV: CRLF line ends, a field quoted when it holds a comma, a quote, CR or LF, a quote doubled inside it. */
function csvOf(rows: readonly (readonly string[])[]): string {
  const field = (value: string): string => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return rows.map((row) => row.map(field).join(',')).join('\r\n') + '\r\n'
}
