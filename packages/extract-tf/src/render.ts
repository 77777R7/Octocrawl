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

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Signals that only exist before `cleanTree` removes their carriers. */
export function rawSignals(doc: Document): RawRenderSignals {
  const markers = new Set<RenderMarker>()
  let scriptChars = 0
  let hydration = false
  for (const script of qsa(doc, 'script')) {
    const text = script.textContent ?? ''
    if (script.getAttribute('src') === null) scriptChars += text.length
    const type = (script.getAttribute('type') ?? '').toLowerCase()
    if (script.id === '__NEXT_DATA__' || (type === 'application/json' && text.length >= HYDRATION_MIN_CHARS)) hydration = true
    else if (text.length >= 64 && HYDRATION_SCRIPT.test(text)) hydration = true
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

  return { scriptChars, markers: Array.from(markers) }
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
export function detectRenderSignals(raw: RawRenderSignals, cleaned: Document): RenderSignals {
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
  else if (has('hydration_state') && textChars < 1_500 && raw.scriptChars > textChars * 2) reason = 'hydration_shell'
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
