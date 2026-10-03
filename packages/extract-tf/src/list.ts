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
import type { ListExtraction, ListFormatRequest, ListRecord } from '@w2l/contracts'
import { parse, qsa } from './dom.js'
import { namedBy } from './selectors.js'

/** Attributes whose value is a URL: made absolute against the page's URL, as `links` are. */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'src', 'data-src', 'data-href', 'srcset', 'poster', 'action', 'data-url', 'data-original'])

/** The records of one page: its URL, and its number among the pages of a list (1 when one page is read). */
export function extractListRecords(html: string, url: string, spec: ListFormatRequest, page = 1): ListRecord[] {
  const doc = parse(html)
  const document = doc.document
  const place = new Map<Element, number>()
  for (const el of qsa(document, '*')) place.set(el, place.size)
  const order = (a: Element, b: Element) => (place.get(a) ?? 0) - (place.get(b) ?? 0)
  const matched = namedBy(document, [spec.itemSelector])
  // A record inside another record is part of it.
  const items = [...matched].filter((el) => !hasAncestorIn(el, matched)).sort(order)
  const fieldMatches = spec.fields.map((field) => (field.selector === undefined ? null : namedBy(document, [field.selector])))
  const records = items.map((item, index): ListRecord => {
    const descendants = qsa(item, '*')
    const values: Record<string, string | null> = {}
    const missing: string[] = []
    spec.fields.forEach((field, i) => {
      const among = fieldMatches[i]
      const el = among === null ? item : descendants.find((candidate) => among!.has(candidate)) ?? null
      const value = el === null ? null : field.attribute === undefined ? textOf(el) : attributeValue(el, field.attribute, url)
      values[field.name] = value
      if (value === null) missing.push(field.name)
    })
    return { values, missing, source: { url, page, index } }
  })
  doc.close()
  return records
}

/** The list of one or more pages' records: CSV with the fields, then source_url, page and index. */
export function listExtraction(spec: ListFormatRequest, records: readonly ListRecord[], pages: number): ListExtraction {
  const fields = spec.fields.map((field) => field.name)
  const rows = [[...fields, 'source_url', 'page', 'index'], ...records.map((record) => [...fields.map((name) => record.values[name] ?? ''), record.source.url, String(record.source.page), String(record.source.index)])]
  const csv = csvOf(rows)
  return {
    itemSelector: spec.itemSelector,
    fields,
    records: [...records],
    pages,
    incomplete: records.filter((record) => record.missing.length > 0).length,
    csv,
    csvSha256: createHash('sha256').update(csv, 'utf8').digest('hex'),
  }
}

function hasAncestorIn(el: Element, set: ReadonlySet<Element>): boolean {
  for (let up = el.parentElement; up !== null; up = up.parentElement) if (set.has(up)) return true
  return false
}

/** The element's text, whitespace collapsed; null when it has none. */
function textOf(el: Element): string | null {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
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
