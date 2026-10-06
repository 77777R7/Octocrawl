/**
 * Client-side rendering signals, read from the server HTML.
 *
 * The HTTP lane sees the page before any script runs. When the data a
 * reader wants is filled in by JavaScript (a data grid loaded over XHR, a
 * chart's table tab, a single-page app), the server HTML is a shell: a
 * `<table>` with no cells, an empty app root, or a fallback that says to
 * enable JavaScript. These signals let the HTTP lane say "this looks like a
 * shell" so the ladder can try the browser, instead of reporting the shell
 * as a confident success.
 *
 * `rawSignals` runs on the document before cleaning (scripts are still in
 * the tree); `detectRenderSignals` combines it with the cleaned document's
 * visible text.
 */

import type { RenderMarker, RenderReason, RenderSignals } from '@w2l/contracts'
import { qsa, textOf } from './dom.js'

export interface RawRenderSignals {
  /** Characters of inline script in the raw document. */
  scriptChars: number
  /** Markers found, in a fixed order: hydration state, app root, noscript notice, js-fallback class, aria-busy. */
  markers: readonly RenderMarker[]
  /**
   * Whether the page as received shows every passage of text its hydration
   * JSON holds (HYDRATION_TEXT_MIN_CHARS or more, in words): its scripts then
   * draw nothing the HTML lacks. False when the JSON holds no such passage.
   */
  hydrationShown: boolean
}

const APP_ROOT_SELECTOR = '#root, #app, #__next, #__nuxt, #___gatsby, [data-reactroot], [ng-app], [ng-version], [data-server-rendered]'
// Not `no-js`: Modernizr puts it on <html> of every page that uses it.
const JS_FALLBACK_CLASS = /(^|[\s_-])(hide-if-js|hide-if-js-enabled|js-disabled|js-only|requires-js|needs-js)([\s_-]|$)/i
const HYDRATION_SCRIPT = /window\.__[A-Za-z0-9_]+__\s*=|window\._[A-Za-z0-9_]*(?:STATE|CONFIG|DATA)\s*=|__NEXT_DATA__|__NUXT__/
const APP_ROOT_MAX_TEXT = 200
const HYDRATION_MIN_CHARS = 2_000
/**
 * A `noscript` notice alone is weak evidence: static sites carry a generic
 * "enable JavaScript" line beside analytics and cookie widgets (GOV.UK, for
 * one). It counts only on a thin page or beside hydration state.
 */
const NOTICE_MAX_TEXT = 1_500
/** A passage of text in hydration JSON: this many characters at least, in eight or more words. */
const HYDRATION_TEXT_MIN_CHARS = 80
const HYDRATION_TEXT_MIN_SPACES = 8
const HYDRATION_MAX_JSON_CHARS = 5_000_000
const HYDRATION_MAX_PASSAGES = 200

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The passages of text in parsed hydration JSON (see RawRenderSignals.hydrationShown), walked without recursion. */
function hydrationPassages(data: unknown, out: string[]): void {
  const stack: unknown[] = [data]
  while (stack.length > 0 && out.length < HYDRATION_MAX_PASSAGES) {
    const node = stack.pop()
    if (typeof node === 'string') {
      const text = collapsed(node)
      if (text.length >= HYDRATION_TEXT_MIN_CHARS && (text.match(/ /g) ?? []).length >= HYDRATION_TEXT_MIN_SPACES) out.push(text)
    } else if (Array.isArray(node)) {
      for (const item of node) stack.push(item)
    } else if (typeof node === 'object' && node !== null) {
      for (const value of Object.values(node)) stack.push(value)
    }
  }
}

/** The text a reader sees in the page as received: the body's, without scripts, styles and templates. */
function visibleText(doc: Document): string {
  const parts: string[] = []
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) parts.push(child.textContent ?? '')
      else if (child.nodeType === 1 && !['script', 'style', 'noscript', 'template'].includes((child as Element).tagName.toLowerCase())) walk(child)
    }
  }
  if (doc.body) walk(doc.body)
  return collapsed(parts.join(' '))
}

/** Signals that only exist before `cleanTree` removes their carriers. */
export function rawSignals(doc: Document): RawRenderSignals {
  const markers = new Set<RenderMarker>()
  let scriptChars = 0
  let hydration = false
  const passages: string[] = []
  for (const script of qsa(doc, 'script')) {
    const text = script.textContent ?? ''
    if (script.getAttribute('src') === null) scriptChars += text.length
    const type = (script.getAttribute('type') ?? '').toLowerCase()
    if (script.id === '__NEXT_DATA__' || (type === 'application/json' && text.length >= HYDRATION_MIN_CHARS)) {
      hydration = true
      if (text.length <= HYDRATION_MAX_JSON_CHARS) {
        try {
          hydrationPassages(JSON.parse(text), passages)
        } catch {
          // Malformed JSON holds no passages to look for.
        }
      }
    } else if (text.length >= 64 && HYDRATION_SCRIPT.test(text)) hydration = true
  }
  let hydrationShown = false
  if (passages.length > 0) {
    const seen = visibleText(doc)
    hydrationShown = passages.every((passage) => seen.includes(passage))
  }
  if (hydration) markers.add('hydration_state')

  for (const root of qsa(doc, APP_ROOT_SELECTOR)) {
    if (collapsed(textOf(root)).length < APP_ROOT_MAX_TEXT) {
      markers.add('app_root_empty')
      break
    }
  }

  for (const noscript of qsa(doc, 'noscript')) {
    if (/javascript|\bjs\b/i.test(textOf(noscript))) {
      markers.add('noscript_notice')
      break
    }
  }

  for (const el of qsa(doc, '[class]')) {
    if (JS_FALLBACK_CLASS.test(el.getAttribute('class') ?? '')) {
      markers.add('js_fallback_marker')
      break
    }
  }

  if (qsa(doc, '[aria-busy="true"]').length > 0) markers.add('aria_busy')

  return { scriptChars, markers: Array.from(markers), hydrationShown }
}

/** A table whose rows carry no data cells at all. */
export function countEmptyTables(doc: Document): number {
  let empty = 0
  for (const table of qsa(doc, 'table')) {
    if (qsa(table, 'td,th').length === 0) empty++
  }
  return empty
}

/**
 * Decide whether the page's data is most likely rendered client-side.
 * Every rule pairs a structural gap with script presence, so a static page
 * with an empty table or a "loading" word never trips it.
 */
/** What the extraction found of the page, weighed beside its signals. */
export interface RenderContext {
  /**
   * The page is a product page found by its visible buy box, and its region
   * shows the title, the price and a description (extract.ts, the same test
   * as its confidence floor).
   */
  productShown?: boolean
}

export function detectRenderSignals(raw: RawRenderSignals, cleaned: Document, context: RenderContext = {}): RenderSignals {
  const textChars = cleaned.body ? collapsed(textOf(cleaned.body)).length : 0
  const emptyTables = countEmptyTables(cleaned)
  const markers = raw.markers
  const has = (m: RenderMarker) => markers.includes(m)

  let reason: RenderReason | null = null
  if (emptyTables > 0 && raw.scriptChars >= 1_000) reason = 'empty_table_with_scripts'
  else if (has('app_root_empty') && raw.scriptChars >= 500) reason = 'empty_app_root'
  else if (textChars < 300 && raw.scriptChars >= 2_000) reason = 'script_shell'
  else if (has('js_fallback_marker') && raw.scriptChars > textChars) reason = 'js_fallback'
  else if (has('noscript_notice') && raw.scriptChars > textChars && (textChars < NOTICE_MAX_TEXT || has('hydration_state'))) reason = 'js_fallback'
  // A product page that shows its buy box and description, and all its
  // hydration data's text, is no shell however thin what its extraction kept
  // once its recommendations were cut. Any other thin page with hydration
  // state still is: its data may arrive by a later fetch the JSON never held.
  else if (has('hydration_state') && textChars < 1_500 && raw.scriptChars > textChars * 2 && !(context.productShown === true && raw.hydrationShown)) reason = 'hydration_shell'
  else if (has('aria_busy') && raw.scriptChars >= 1_000) reason = 'aria_busy'

  return {
    textChars,
    scriptChars: raw.scriptChars,
    emptyTables,
    markers,
    clientRendered: reason !== null,
    reason,
  }
}
