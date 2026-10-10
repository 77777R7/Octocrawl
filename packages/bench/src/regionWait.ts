/**
 * The wait for the region a task needs (ADR 0007 §2, ROADMAP PA item 11). A request's task contract (`verify`, ADR
 * 0006) is run on a view of the live page: its text (`body.innerText`), the tables it shows and, with a `list` format's
 * `itemSelector` and `fields`, its records. The page is ready for the task when every check that view can judge passes
 * on two reads in a row with the same counts, or, for a contract that accepts an empty result, when the list shows no
 * record on a page that has stopped loading and changing. The wait is bounded; the page is read when it ends, ready or
 * not, and the trace says which (`region_wait`). The view only judges readiness: the task's verdict is still the
 * contract run on what was extracted.
 */

import type { FetchOptions, Lane, ListField, TraceEvent, VerificationCheck, VerifyContract } from '@w2l/contracts'
import { verify, type VerifyView } from '@w2l/runtime'
import { isNavigationError, LOADING_PROBE, type SettlePage } from './browserSettle.js'

/** How long the region a task needs is waited for at most, beyond the page's own settle (ADR 0007, Howard 2026-10-10). */
export const REGION_WAIT_MAX_MS = 10_000
/** Between two reads of the region. */
export const REGION_SAMPLE_MS = 500
/** At most this many records are read from the page per view: enough for any contract's minimum, bounded on a page of thousands. */
const MAX_VIEW_RECORDS = 2_000

/** What the wait judges: the request's task contract, and the list format's records when it names them. */
export interface RegionSpec {
  contract: VerifyContract
  list?: { itemSelector: string; fields: readonly ListField[] }
}

/** The region wait a request asks for: one with a task contract; its records only when the list format names its items and fields. */
export function regionSpecOf(options: Pick<FetchOptions, 'verify' | 'list'>): RegionSpec | undefined {
  if (options.verify === undefined) return undefined
  const list = options.list
  return list?.itemSelector !== undefined && list.fields !== undefined && list.fields.length > 0
    ? { contract: options.verify, list: { itemSelector: list.itemSelector, fields: list.fields } }
    : { contract: options.verify }
}

/** The attributes whose values are URLs, resolved against the page's base as the list format resolves them. */
const URL_ATTRIBUTES = ['href', 'src', 'data-src', 'data-href', 'poster', 'action', 'data-url', 'data-original']

/**
 * The view of the live page, as JSON: whether it shows a loading indicator, its text and its length, how many tables
 * it shows (a `<table>`, or an element with role table or grid, of at least two rows: a one-row table lays the page
 * out, as the extractor reads it) and, with a list, its records as the list format reads them (an item inside another
 * item is not one; a field is its selector's first match in the item, or the item; a value is the element's text, or
 * the attribute's, URLs resolved; an empty one is missing). The probe never fails the page: an error reads as `error`.
 */
export function regionViewExpression(list?: RegionSpec['list']): string {
  const listPart = list === undefined ? '' : `
    const itemSelector = ${JSON.stringify(list.itemSelector)}
    const fields = ${JSON.stringify(list.fields.map((field) => ({ name: field.name, selector: field.selector ?? null, attribute: field.attribute ?? null })))}
    const urlAttributes = ${JSON.stringify(URL_ATTRIBUTES)}
    const records = []
    for (const item of document.querySelectorAll(itemSelector)) {
      if (records.length >= ${MAX_VIEW_RECORDS}) break
      if (item.parentElement !== null && item.parentElement.closest(itemSelector) !== null) continue
      const values = {}
      const missing = []
      for (const field of fields) {
        const target = field.selector === null ? item : item.querySelector(field.selector)
        let value = null
        if (target !== null) {
          if (field.attribute === null) value = (target.innerText ?? target.textContent ?? '').replace(/\\s+/g, ' ').trim()
          else {
            const raw = target.getAttribute(field.attribute)
            value = raw === null ? null : raw.trim()
            if (value && urlAttributes.includes(field.attribute.toLowerCase())) { try { value = new URL(value, document.baseURI).href } catch {} }
          }
        }
        if (value === null || value === '') { values[field.name] = null; missing.push(field.name) } else values[field.name] = value
      }
      records.push({ values, missing })
    }
    view.list = { records }`
  return `(() => {
  try {
    const body = document.body
    const shown = (el) => {
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return false
      if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }
    const markdown = body === null ? '' : (body.innerText ?? '')
    let tableCount = 0
    for (const table of document.querySelectorAll('table')) if (table.rows.length >= 2 && shown(table)) tableCount++
    for (const grid of document.querySelectorAll('[role="table"], [role="grid"]')) if (grid.tagName !== 'TABLE' && grid.querySelectorAll('[role="row"]').length >= 2 && shown(grid)) tableCount++
    const view = { loading: ${LOADING_PROBE}, text: markdown.length, markdown, tableCount }${listPart}
    return JSON.stringify(view)
  } catch (error) {
    return JSON.stringify({ error: String(error && error.message || error).slice(0, 200) })
  }
})()`
}

/** One read of the region: the page's view as the expression returned it. */
interface RegionView {
  loading?: boolean
  text?: number
  markdown?: string
  tableCount?: number
  list?: { records: { values: Record<string, string | null>; missing: string[] }[] }
  error?: string
}

/** What the wait saw: whether the region was ready (or an accepted empty list), how long and how many reads, and the checks as last judged, by their counts. */
export interface RegionOutcome {
  ready: boolean
  /** The contract accepts an empty result and the list showed none on a page that had settled. */
  empty: boolean
  waitedMs: number
  reads: number
  /** The page still showed a loading indicator at the last read. */
  loading: boolean
  /** The page's text was the same length on the last two reads. */
  steady: boolean
  checks: readonly Pick<VerificationCheck, 'index' | 'type' | 'passed' | 'observedCount'>[]
}

/**
 * The region's state across reads, for a lane that reads the page in its own loop (the my-browser lane): `observe`
 * each view, `ready` once it holds, and `outcome` when the lane reads the page. `judgeable` is false when the view can
 * judge none of the contract's checks (a contract of `json` fields alone): nothing on the page to wait for.
 */
export class RegionTracker {
  private readonly started: number
  private reads = 0
  private viewsRead = 0
  private previousKey: string | null = null
  private previousText: number | undefined
  private last: RegionOutcome = { ready: false, empty: false, waitedMs: 0, reads: 0, loading: false, steady: false, checks: [] }
  judgeable = true

  constructor(private readonly spec: RegionSpec, private readonly now: () => number = Date.now) {
    this.started = now()
  }

  /** Judge one read; true once the region is ready. */
  observe(json: unknown): boolean {
    this.reads++
    let view: RegionView
    try { view = typeof json === 'string' ? JSON.parse(json) as RegionView : {} } catch { view = {} }
    if (view.error !== undefined || typeof view.markdown !== 'string') {
      this.previousKey = null
      this.last = { ...this.last, waitedMs: this.now() - this.started, reads: this.reads, ready: false, empty: false }
      return false
    }
    const verifyView: VerifyView = { status: 'success', markdown: view.markdown, tableCount: view.tableCount ?? 0, ...(view.list === undefined ? {} : { list: view.list }) }
    const verification = verify(this.spec.contract, verifyView, { partial: true })
    const checks = verification.status === 'not_requested' ? [] : verification.checks.map(({ index, type, passed, observedCount }) => ({ index, type, passed, ...(observedCount === undefined ? {} : { observedCount }) }))
    // The first view read decides whether the page can judge the contract at all.
    if (++this.viewsRead === 1 && checks.every((check) => check.passed === null)) this.judgeable = false
    const key = JSON.stringify(checks.map((check) => [check.passed, check.observedCount ?? null]))
    const steady = this.previousText !== undefined && this.previousText === view.text
    const loading = view.loading === true
    const empty = this.spec.contract.emptyOk === true && view.list !== undefined && view.list.records.length === 0 && !loading && steady
    const holds = (verification.status === 'passed' || empty) && key === this.previousKey
    this.previousKey = key
    this.previousText = view.text
    this.last = { ready: holds, empty: holds && empty && verification.status !== 'passed', waitedMs: this.now() - this.started, reads: this.reads, loading, steady, checks }
    return holds
  }

  outcome(): RegionOutcome {
    return { ...this.last, waitedMs: this.now() - this.started }
  }
}

/**
 * Wait for the region on a page a lane drives (browser_local, a provider's browser): read the view every
 * REGION_SAMPLE_MS until it is ready or `maxMs` has passed, at least once. Undefined when the view can judge none of
 * the contract's checks. A read that a navigation cut off starts the comparison afresh.
 */
export async function waitForRegion(page: SettlePage, spec: RegionSpec, options: { maxMs: number; sampleMs?: number; now?: () => number }): Promise<RegionOutcome | undefined> {
  const now = options.now ?? Date.now
  const tracker = new RegionTracker(spec, now)
  const expression = regionViewExpression(spec.list)
  const sampleMs = options.sampleMs ?? REGION_SAMPLE_MS
  const deadline = now() + Math.max(0, options.maxMs)
  for (;;) {
    let json: unknown
    try {
      json = await page.evaluate(expression)
    } catch (error) {
      if (!isNavigationError(error)) throw error
      json = undefined
    }
    const ready = tracker.observe(json)
    if (!tracker.judgeable) return undefined
    if (ready || now() >= deadline) return tracker.outcome()
    await page.waitForTimeout(Math.max(1, Math.min(sampleMs, deadline - now())))
  }
}

/** The trace event a region wait leaves: what it saw, by counts, never the page's text. */
export function regionWaitEvent(outcome: RegionOutcome | undefined, at: number, lane: Lane): TraceEvent | null {
  if (outcome === undefined) return null
  return { at, lane, event: 'region_wait', detail: { ready: outcome.ready, empty: outcome.empty, waitedMs: outcome.waitedMs, reads: outcome.reads, loading: outcome.loading, steady: outcome.steady, checks: outcome.checks } }
}
