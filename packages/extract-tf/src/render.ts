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
   * The text of the page's hydration JSON blocks, unparsed: recordLists and
   * hydrationShown read them only for a page that can use the answer.
   */
  hydrationJson: readonly string[]
}

const APP_ROOT_SELECTOR = '#root, #app, #__next, #__nuxt, #___gatsby, [data-reactroot], [ng-app], [ng-version], [data-server-rendered]'
// Not `no-js`: Modernizr puts it on <html> of every page that uses it.
const JS_FALLBACK_CLASS = /(^|[\s_-])(hide-if-js|hide-if-js-enabled|js-disabled|js-only|requires-js|needs-js)([\s_-]|$)/i
// State a page's scripts render from: `window.__STATE__ =`, `window._INITIAL_DATA =`, and a bare lower-case data or
// state object (`window.__data =`, the World Bank's indicator pages). Longer lower- and camel-case names are not read:
// they name a router's or an analytics tag's own data on pages whose content is all there (Substack's
// `window.__staticRouterHydrationData`, Chartbeat's `window._sf_async_config`).
const HYDRATION_SCRIPT = /window\.__[A-Za-z0-9_]+__\s*=|window\._[A-Za-z0-9_]*(?:STATE|CONFIG|DATA)\s*=|window\.__(?:data|state)\s*=|__NEXT_DATA__|__NUXT__/
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
/**
 * A listing page whose hydration JSON lists more records than its markup
 * shows (a Walmart category page draws 9 of the 49 products in its
 * __NEXT_DATA__ on the server, and its scripts draw the rest). A list counts
 * when it holds LIST_MIN_RECORDS distinct names long enough to identify one
 * record in the page's text, at least LIST_MIN_SHOWN of which the markup
 * shows: that ties the list to this page's listing rather than a menu or
 * facets the page carries for its scripts.
 */
const LIST_MIN_RECORDS = 10
const LIST_NAME_MIN_CHARS = 12
const LIST_MIN_SHOWN = 3
const LIST_MAX_NAMES = 500
const LIST_MAX_LISTS = 50

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The passages of text in parsed hydration JSON (see hydrationShown), walked without recursion. */
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

/** A record's name or title, when it is long enough to identify the record in the page's text. */
function recordName(item: unknown): string | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
  const record = item as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name : typeof record.title === 'string' ? record.title : null
  if (name === null) return null
  const text = collapsed(name).toLowerCase()
  return text.length >= LIST_NAME_MIN_CHARS ? text : null
}

/** The lists of named records in parsed hydration JSON, walked without recursion. */
function collectRecordLists(data: unknown, out: string[][]): void {
  const stack: unknown[] = [data]
  while (stack.length > 0 && out.length < LIST_MAX_LISTS) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      const names = new Set<string>()
      for (const item of node) {
        if (typeof item === 'object' && item !== null) stack.push(item)
        const name = names.size < LIST_MAX_NAMES ? recordName(item) : null
        if (name !== null) names.add(name)
      }
      if (names.size >= LIST_MIN_RECORDS) out.push([...names])
    } else if (typeof node === 'object' && node !== null) {
      for (const value of Object.values(node)) if (typeof value === 'object' && value !== null) stack.push(value)
    }
  }
}

/**
 * Whether the page shows every passage of text its hydration JSON holds
 * (HYDRATION_TEXT_MIN_CHARS or more, in words): its scripts then draw
 * nothing the HTML lacks. False when the JSON holds no such passage. `doc` is
 * the cleaned page, before any of it is cut as recommendations; a passage
 * only in its navigation or footer, which cleaning removed, counts as not
 * shown. Parsing a large blob costs, so extract.ts asks only on a page whose
 * buy box the router found.
 */
export function hydrationShown(raw: RawRenderSignals, doc: Document): boolean {
  const passages: string[] = []
  for (const text of raw.hydrationJson) {
    try {
      hydrationPassages(JSON.parse(text), passages)
    } catch {
      // Malformed JSON holds no passages to look for.
    }
  }
  if (passages.length === 0 || doc.body === null) return false
  const seen = collapsed(textOf(doc.body))
  return passages.every((passage) => seen.includes(passage))
}

/**
 * The lists of named records in the page's hydration JSON (see
 * collectRecordLists). Parsing a large blob costs, so detectRenderSignals
 * asks only on a page routed as a listing or collection.
 */
export function recordLists(raw: RawRenderSignals): string[][] {
  const lists: string[][] = []
  for (const text of raw.hydrationJson) {
    try {
      collectRecordLists(JSON.parse(text), lists)
    } catch {
      // Malformed JSON lists no records.
    }
  }
  return lists
}

/** Signals that only exist before `cleanTree` removes their carriers. */
export function rawSignals(doc: Document): RawRenderSignals {
  const markers = new Set<RenderMarker>()
  let scriptChars = 0
  let hydration = false
  const hydrationJson: string[] = []
  for (const script of qsa(doc, 'script')) {
    const text = script.textContent ?? ''
    if (script.getAttribute('src') === null) scriptChars += text.length
    const type = (script.getAttribute('type') ?? '').toLowerCase()
    if (script.id === '__NEXT_DATA__' || (type === 'application/json' && text.length >= HYDRATION_MIN_CHARS)) {
      hydration = true
      if (text.length <= HYDRATION_MAX_JSON_CHARS) hydrationJson.push(text)
    } else if (text.length >= 64 && HYDRATION_SCRIPT.test(text)) hydration = true
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

  return { scriptChars, markers: Array.from(markers), hydrationJson }
}

/**
 * The messages by which a page says its data is still on the way, read as the browser lane reads them (LOADING_PROBE
 * in the bench's browserSettle) but only in the forms that say so outright: an element's whole text that is or ends in
 * a loading message with its ellipsis ("Loading...", "Fetching results…", "Quotes loading…"), or "Please wait". A bare
 * "Loading" is as often a skeleton's label for screen readers, which the browser lane sees is not shown and this
 * reading cannot.
 */
const LOADING_MESSAGE = /^(?:(?:loading|fetching|please wait|one moment|searching|retrieving)(?:\s+[\w-]+){0,3}\s*(?:\.{2,3}|\u2026)|please wait)$/i
const LOADING_TRAILING = /\b(?:loading|fetching)\s*(?:\.{2,3}|\u2026)$/i
const LOADING_TEXT_MAX_CHARS = 48
/**
 * A page with more text than this is not read for loading messages, as in the browser lane (LOADING_PAGE_TEXT_MAX): a
 * loader left on a full page (more comments, a feed's next page) is not its data.
 */
const LOADING_PAGE_MAX_TEXT = 4_000
/** Classes that keep an element's text for screen readers only: `sr-only`, `visually-hidden`, `ScreenReaderOnly_srOnly…`. */
const SCREEN_READER_ONLY = /(?:^|[\s_-])(?:sr-only|visually-?hidden|screen-?reader-(?:only|text))(?:$|[\s_-])|sronly|screenreaderonly/i

/**
 * Whether a region of the cleaned page shows a loading message (LOADING_MESSAGE) in its own text: not a button's or a
 * link's, and not inside an element no reader sees (`hidden`, `aria-hidden="true"`, a class for screen readers only).
 * Cleaning has already taken out scripts, styles, templates, noscript and svg.
 */
export function hasLoadingText(region: Element): boolean {
  const stack: Node[] = [region]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').trim()
      if (text.length === 0 || text.length > LOADING_TEXT_MAX_CHARS || !(LOADING_MESSAGE.test(text) || LOADING_TRAILING.test(text))) continue
      if (node.parentElement?.closest('button, a') == null) return true
    } else if (node.nodeType === 1) {
      const el = node as Element
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true' || SCREEN_READER_ONLY.test(el.getAttribute('class') ?? '')) continue
      for (const child of Array.from(el.childNodes)) stack.push(child)
    }
  }
  return false
}

/** A table whose rows carry no data cells at all. */
export function countEmptyTables(doc: Document): number {
  let empty = 0
  for (const table of qsa(doc, 'table')) {
    if (qsa(table, 'td,th').length === 0) empty++
  }
  return empty
}

/** What the extraction found of the page, weighed beside its signals. */
export interface RenderContext {
  /**
   * The page is a product page found by its visible buy box, and its region
   * shows the title, the price and a description (extract.ts, the same test
   * as its confidence floor).
   */
  productShown?: boolean
  /** The page shows every passage of text its hydration JSON holds (hydrationShown). */
  hydrationShown?: boolean
  /**
   * The extracted region shows the product the page declares in its own
   * markup (see extract.ts): a page of little text beside its scripts is then
   * a small page, not a shell.
   */
  contentShown?: boolean
  /**
   * The page was routed as a listing or collection: only there is a
   * hydration list that outnumbers the shown records the page's content.
   */
  listing?: boolean
  /** The extracted region shows a loading message (hasLoadingText). */
  loadingShown?: boolean
}

/**
 * The hydration list that most outnumbers the records the visible text
 * shows, when the text shows at least LIST_MIN_SHOWN of them and at most
 * half; null when no list does.
 */
function partialRecordList(lists: readonly (readonly string[])[], visible: string): { declared: number; shown: number } | null {
  let partial: { declared: number; shown: number } | null = null
  for (const names of lists) {
    const shown = names.filter((name) => visible.includes(name)).length
    if (shown < LIST_MIN_SHOWN || shown * 2 > names.length) continue
    if (partial === null || names.length - shown > partial.declared - partial.shown) partial = { declared: names.length, shown }
  }
  return partial
}

/**
 * Decide whether the page's data is most likely rendered client-side.
 * Every rule pairs a structural gap with script presence, so a static page
 * with an empty table or a "loading" word never trips it. `context.listing`
 * says the page was routed as a listing or collection: only there is a
 * hydration list that outnumbers the shown records the page's content (an
 * article's data often lists more related posts than it shows).
 */

export function detectRenderSignals(raw: RawRenderSignals, cleaned: Document, context: RenderContext = {}): RenderSignals {
  const visible = cleaned.body ? collapsed(textOf(cleaned.body)) : ''
  const textChars = visible.length
  const emptyTables = countEmptyTables(cleaned)
  const markers = raw.markers
  const has = (m: RenderMarker) => markers.includes(m)

  let reason: RenderReason | null = null
  if (emptyTables > 0 && raw.scriptChars >= 1_000) reason = 'empty_table_with_scripts'
  else if (has('app_root_empty') && raw.scriptChars >= 500) reason = 'empty_app_root'
  else if (textChars < 300 && raw.scriptChars >= 2_000 && context.contentShown !== true) reason = 'script_shell'
  else if (has('js_fallback_marker') && raw.scriptChars > textChars) reason = 'js_fallback'
  else if (has('noscript_notice') && raw.scriptChars > textChars && (textChars < NOTICE_MAX_TEXT || has('hydration_state'))) reason = 'js_fallback'
  // A product page that shows its buy box and description, and all its
  // hydration data's text, is no shell however thin what its extraction kept
  // once its recommendations were cut. Any other thin page with hydration
  // state still is: its data may arrive by a later fetch the JSON never held.
  else if (has('hydration_state') && textChars < 1_500 && raw.scriptChars > textChars * 2 && !(context.productShown === true && context.hydrationShown === true)) reason = 'hydration_shell'
  else if (has('aria_busy') && raw.scriptChars >= 1_000) reason = 'aria_busy'
  // A short page whose content still says "Loading..." beside its scripts: the data is theirs to fetch (WSJ's market
  // data, every table of which reads "Loading..." over HTTP).
  else if (context.loadingShown === true && textChars <= LOADING_PAGE_MAX_TEXT && raw.scriptChars >= 1_000) reason = 'loading_text'
  const listRecords = reason === null && context.listing === true && raw.hydrationJson.length > 0 ? partialRecordList(recordLists(raw), visible.toLowerCase()) : null
  if (listRecords !== null) reason = 'hydration_list_partial'

  return {
    textChars,
    scriptChars: raw.scriptChars,
    emptyTables,
    markers,
    ...(listRecords === null ? {} : { listRecords }),
    clientRendered: reason !== null,
    reason,
  }
}
