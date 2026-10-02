/**
 * The attributes format: for each CSS selector a request names, the values
 * of one HTML attribute on every element it matches, read from the document
 * as received (the rendered DOM on a browser lane). Deterministic, no model.
 * The values are as written in the HTML, not resolved: `links` and `images`
 * carry the resolved forms. includeTags, excludeTags and onlyMainContent do
 * not apply.
 */

import type { AttributeExtraction, AttributeSelector } from '@w2l/contracts'
import { parse, qsa } from './dom.js'
import { namedBy } from './selectors.js'

/**
 * One entry per selector, in request order, each with the attribute's values
 * in document order; an element without the attribute is skipped, and a
 * selector that matches nothing gives `[]`. The selectors are matched by
 * `namedBy`, in time proportional to the page: one the API refused
 * (`invalidSelector`) names nothing.
 */
export function extractAttributes(html: string, selectors: readonly AttributeSelector[]): AttributeExtraction[] {
  if (selectors.length === 0) return []
  const doc = parse(html)
  const document = doc.document
  // Every element's place in document order, read once for all the selectors.
  const place = new Map<Element, number>()
  for (const el of qsa(document, '*')) place.set(el, place.size)
  const out = selectors.map(({ selector, attribute }) => {
    const named = [...namedBy(document, [selector])].sort((a, b) => (place.get(a) ?? 0) - (place.get(b) ?? 0))
    const values: string[] = []
    for (const el of named) {
      const value = attributeOf(el, attribute)
      if (value !== null) values.push(value)
    }
    return { selector, attribute, values }
  })
  doc.close()
  return out
}

/** An attribute matched by name case-insensitively, as HTML does; linkedom keeps the source's case. */
function attributeOf(el: Element, name: string): string | null {
  const value = el.getAttribute(name)
  if (value !== null) return value
  const lower = name.toLowerCase()
  for (const attr of Array.from(el.attributes)) if (attr.name.toLowerCase() === lower) return attr.value
  return null
}
