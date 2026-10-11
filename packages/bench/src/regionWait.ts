/**
 * The wait for the region a task needs (ADR 0007 §2, ROADMAP PA item 11). A request's task contract (`verify`, ADR
 * 0006) is run on a view of the live page: its text (`body.innerText`), the tables it shows and, with a `list` format's
 * `itemSelector` and `fields`, its records read as the list format reads them. The page is ready for the task when
 * every check that view can judge passes on two reads in a row with the same counts, or, for a contract that accepts
 * an empty result, when the list shows no record on three reads in a row of a page that has stopped loading and
 * changing. The wait is bounded; the page is read when it ends, ready or not, and the trace says which (`region_wait`).
 * A view that can judge none of the checks is not waited on: its one read is recorded too, with why (`unjudged`).
 * The view only judges readiness: the task's verdict is still the contract run on what was extracted.
 */

import type { FetchOptions, Lane, ListField, TraceEvent, VerificationCheck, VerifyContract } from '@w2l/contracts'
import { htmlToMarkdown } from '@w2l/extract-tf'
import { contractSha256, verify, type VerifyView } from '@w2l/runtime'
import { isNavigationError, LOADING_PROBE, type SettlePage } from './browserSettle.js'

/** How long the region a task needs is waited for at most, beyond the page's own settle (ADR 0007, Howard 2026-10-10). */
export const REGION_WAIT_MAX_MS = 10_000
/** Between two reads of the region. */
export const REGION_SAMPLE_MS = 500
/** Records read per view, at least: more when a list check asks for more, so a contract's own minimum is always reachable. */
const MIN_VIEW_RECORDS = 2_000
/** Reads in a row an empty list must show, on a settled page, to count as the page's explicit empty state. */
const EMPTY_READS = 3
/** The largest live page whose Markdown the view converts; past it, the Markdown checks are not judged on the live page. */
const MAX_VIEW_HTML = 5_000_000
/** The checks that read the Markdown: on the live page, they read the page's whole HTML converted as the result's Markdown is. */
const MARKDOWN_CHECKS: ReadonlySet<string> = new Set(['markdownIncludes', 'markdownMatches', 'markdownCountMin'])

/** What the wait judges: the request's task contract, and the list format's records when it names them. */
export interface RegionSpec {
  contract: VerifyContract
  list?: { itemSelector: string; fields: readonly ListField[] }
}

/**
 * The region wait a request asks for: one with a task contract; its records only when the list format names its items
 * and fields. None after a paginate step: the lane then holds the last page while the result reads every page's
 * records, so the live page cannot judge what the result will hold.
 */
export function regionSpecOf(options: Pick<FetchOptions, 'verify' | 'list' | 'actions'>): RegionSpec | undefined {
  if (options.verify === undefined) return undefined
  if ((options.actions ?? []).some((action) => action.type === 'paginate')) return undefined
  const list = options.list
  return list?.itemSelector !== undefined && list.fields !== undefined && list.fields.length > 0
    ? { contract: options.verify, list: { itemSelector: list.itemSelector, fields: list.fields } }
    : { contract: options.verify }
}

/** The attributes whose values are URLs, resolved against the page's base as the list format resolves them (srcset kept as written). */
const URL_ATTRIBUTES = ['href', 'src', 'data-src', 'data-href', 'srcset', 'poster', 'action', 'data-url', 'data-original']
/** The list format's elements whose text is not text, and those that start a new line (packages/extract-tf/src/list.ts). */
const NOT_TEXT = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'DESC']
const BLOCK = ['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL', 'OPTION', 'BUTTON', 'LABEL']

/** The most records a contract's list checks ask for: the view reads at least that many. */
function recordsAsked(contract: VerifyContract): number {
  return contract.checks.reduce((most, check) => check.type === 'listRecordsMin' || check.type === 'recordFields' ? Math.max(most, check.min) : most, 0)
}

/**
 * The view of the live page, as JSON: whether it shows a loading indicator, the length of its text, with `withHtml` its
 * address and whole HTML (the Markdown checks read it converted to Markdown: a pattern written for Markdown, a link's
 * `](https://`, does not match the page's plain text), how many tables it shows (a `<table>`, or an element with role table or grid, of at least two rows: a one-row table lays the page
 * out, as the extractor reads it) and, with a list, its records as the list format reads them
 * (packages/extract-tf/src/list.ts): an item inside another item is not one; a field is its selector's first match in
 * the item, or the item; a value is the element's text, script, style, template, an SVG's title and description left
 * out and whatever CSS hides kept, or the attribute's, case-insensitive, URLs resolved; an empty one is missing. A
 * selector the browser does not take leaves the list out of the view, so its checks are not judged. The probe never
 * fails the page: an error reads as `error`.
 */
export function regionViewExpression(list?: RegionSpec['list'], maxRecords = MIN_VIEW_RECORDS, withHtml = false): string {
  const listPart = list === undefined ? '' : `
    try {
      const itemSelector = ${JSON.stringify(list.itemSelector)}
      const fields = ${JSON.stringify(list.fields.map((field) => ({ name: field.name, selector: field.selector ?? null, attribute: field.attribute ?? null })))}
      const urlAttributes = ${JSON.stringify(URL_ATTRIBUTES)}
      const notText = new Set(${JSON.stringify(NOT_TEXT)})
      const block = new Set(${JSON.stringify(BLOCK)})
      const textOf = (el) => {
        const parts = []
        const walk = (node) => {
          if (node.nodeType === 3) { parts.push(node.nodeValue || ''); return }
          if (node.nodeType !== 1) return
          const name = String(node.tagName).toUpperCase()
          if (notText.has(name)) return
          const isBlock = block.has(name)
          if (isBlock) parts.push(' ')
          for (const child of node.childNodes) walk(child)
          if (isBlock) parts.push(' ')
        }
        for (const child of el.childNodes) walk(child)
        const text = parts.join('').replace(/\\s+/g, ' ').trim()
        return text === '' ? null : text
      }
      const attributeOf = (el, name) => {
        let value = el.getAttribute(name)
        if (value === null) for (const attr of el.attributes) if (attr.name.toLowerCase() === name.toLowerCase()) value = attr.value
        if (value === null || value.trim() === '') return null
        const trimmed = value.trim()
        const lower = name.toLowerCase()
        if (!urlAttributes.includes(lower) || lower === 'srcset') return trimmed
        try { return new URL(trimmed, document.baseURI).href } catch { return trimmed }
      }
      const records = []
      for (const item of document.querySelectorAll(itemSelector)) {
        if (records.length >= ${maxRecords}) break
        if (item.parentElement !== null && item.parentElement.closest(itemSelector) !== null) continue
        const values = {}
        const missing = []
        for (const field of fields) {
          const target = field.selector === null ? item : item.querySelector(field.selector)
          const value = target === null ? null : field.attribute === null ? textOf(target) : attributeOf(target, field.attribute)
          values[field.name] = value
          if (value === null) missing.push(field.name)
        }
        records.push({ values, missing })
      }
      view.list = { records }
    } catch {}`
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
    const text = body === null ? '' : (body.innerText ?? '')
    let tableCount = 0
    for (const table of document.querySelectorAll('table')) if (table.rows.length >= 2 && shown(table)) tableCount++
    // A grid drawn with ARIA roles (AG Grid's treegrid), as the extractor reads it: the outermost one, not one inside a table or another grid.
    const GRIDS = '[role="table"], [role="grid"], [role="treegrid"]'
    for (const grid of document.querySelectorAll(GRIDS)) if (grid.tagName !== 'TABLE' && grid.parentElement?.closest('table, ' + GRIDS) == null && grid.querySelectorAll('[role="row"]').length >= 2 && shown(grid)) tableCount++
    const view = { loading: ${LOADING_PROBE}, text: text.length, tableCount }${withHtml ? `
    // The page's HTML for the Markdown checks, not sent past MAX_VIEW_HTML: those checks are then not judged.
    const html = document.documentElement ? document.documentElement.outerHTML : ''
    view.href = location.href
    view.html = html.length > ${MAX_VIEW_HTML} ? null : html` : ''}${listPart}
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
  href?: string
  html?: string | null
  tableCount?: number
  list?: { records: { values: Record<string, string | null>; missing: string[] }[] }
  error?: string
}

/**
 * Why the live page could judge none of the contract's checks: its HTML was over MAX_VIEW_HTML for the Markdown checks
 * (the page sends none past it), or no check reads the live page at all (a `field` on `json`, a list check without the
 * list format's items and fields).
 */
export type RegionUnjudged = 'html_too_large' | 'checks_not_on_page'

/** What the wait saw: whether the region was ready (or an accepted empty list), how long and how many reads, and the checks as last judged, by their counts. */
export interface RegionOutcome {
  ready: boolean
  /** The contract accepts an empty result and the list showed none on a page that had settled. */
  empty: boolean
  waitedMs: number
  reads: number
  /** Reads whose view could be judged (a read a navigation cut off, or a probe that failed, is not). */
  judged: number
  /** The page still showed a loading indicator at the last judged read. */
  loading: boolean
  /** Whether the page's text was the same length on the last two judged reads; null when fewer than two were judged in a row. */
  steady: boolean | null
  /** The SHA-256 of the contract it judged (ADR 0006's contractSha256), so a stored result is read against its own contract. */
  contractSha256: string
  checks: readonly Pick<VerificationCheck, 'index' | 'type' | 'passed' | 'observedCount'>[]
  /** Set when the first judged view could judge none of the checks: the wait stopped at that read, and why. */
  unjudged?: RegionUnjudged
}

/**
 * The region's state across reads, for a lane that reads the page in its own loop (the my-browser lane): `observe`
 * each view, `ready` once it holds, and `outcome` when the lane reads the page. `judgeable` is false when the first
 * judged view can judge none of the contract's checks (a contract of `json` fields alone): nothing on the page to wait for,
 * and `unjudged` says why.
 */
export class RegionTracker {
  private readonly started: number
  private readonly sha: string
  private reads = 0
  private judged = 0
  private sameReads = 0
  private previousKey: string | null = null
  private previousText: number | undefined
  private readonly needsMarkdown: boolean
  /** The last HTML converted and its Markdown: a page that did not change is not converted again. */
  private converted: { html: string; markdown: string } | null = null
  private last: Omit<RegionOutcome, 'waitedMs' | 'reads' | 'judged' | 'contractSha256'> = { ready: false, empty: false, loading: false, steady: null, checks: [] }
  judgeable = true
  unjudged: RegionUnjudged | undefined

  constructor(private readonly spec: RegionSpec, private readonly now: () => number = Date.now) {
    this.started = now()
    this.sha = contractSha256(spec.contract)
    this.needsMarkdown = spec.contract.checks.some((check) => MARKDOWN_CHECKS.has(check.type))
  }

  /** The expression a lane reads the view with: enough records for the contract's own minimum. */
  expression(): string {
    return regionViewExpression(this.spec.list, Math.max(MIN_VIEW_RECORDS, recordsAsked(this.spec.contract)), this.needsMarkdown)
  }

  /** Judge one read; true once the region is ready. A read with no view (cut off, or the probe failed) breaks the run of reads. */
  observe(json: unknown): boolean {
    this.reads++
    let view: RegionView
    try { view = typeof json === 'string' ? JSON.parse(json) as RegionView : {} } catch { view = {} }
    if (view.error !== undefined || typeof view.text !== 'number') {
      this.previousKey = null
      this.previousText = undefined
      this.sameReads = 0
      this.last = { ...this.last, ready: false, empty: false, steady: null }
      return false
    }
    this.judged++
    const markdown = this.markdownOf(view)
    const verifyView: VerifyView = { status: 'success', tableCount: view.tableCount ?? 0, ...(markdown === undefined ? {} : { markdown }), ...(view.list === undefined ? {} : { list: view.list }) }
    const verification = verify(this.spec.contract, verifyView, { partial: true })
    const checks = verification.status === 'not_requested' ? [] : verification.checks.map(({ index, type, passed, observedCount }) => ({ index, type, passed, ...(observedCount === undefined ? {} : { observedCount }) }))
    // The first judged view decides whether the page can judge the contract at all.
    if (this.judged === 1 && checks.every((check) => check.passed === null)) {
      this.judgeable = false
      // The Markdown checks went unjudged because the page's HTML was too large to send or convert: the page had one.
      const tooLarge = this.needsMarkdown && (view.html === null || (typeof view.html === 'string' && view.html.length > MAX_VIEW_HTML))
      this.unjudged = tooLarge ? 'html_too_large' : 'checks_not_on_page'
    }
    const key = JSON.stringify(checks.map((check) => [check.passed, check.observedCount ?? null]))
    const steady = this.previousText === undefined ? null : this.previousText === view.text
    const loading = view.loading === true
    // Reads in a row with the same counts and the same text, this one included.
    this.sameReads = key === this.previousKey && steady === true ? this.sameReads + 1 : 1
    const passed = verification.status === 'passed' && key === this.previousKey
    const emptyList = this.spec.contract.emptyOk === true && view.list !== undefined && view.list.records.length === 0 && !loading
    // An empty list is the page's empty state only on a page that has settled: the same text and counts on EMPTY_READS reads.
    const empty = !passed && emptyList && this.sameReads >= EMPTY_READS
    this.previousKey = key
    this.previousText = view.text
    this.last = { ready: passed || empty, empty, loading, steady, checks }
    return passed || empty
  }

  /** The live page's whole Markdown, converted as the result's is; undefined when no check reads it or the page is too large. */
  private markdownOf(view: RegionView): string | undefined {
    if (!this.needsMarkdown || typeof view.html !== 'string' || view.html.length > MAX_VIEW_HTML) return undefined
    if (this.converted?.html !== view.html) this.converted = { html: view.html, markdown: htmlToMarkdown(view.html, { baseUrl: view.href }) }
    return this.converted.markdown
  }

  outcome(): RegionOutcome {
    return { ...this.last, waitedMs: this.now() - this.started, reads: this.reads, judged: this.judged, contractSha256: this.sha, ...(this.unjudged === undefined ? {} : { unjudged: this.unjudged }) }
  }
}

/**
 * Wait for the region on a page a lane drives (browser_local, a provider's browser): read the view every
 * REGION_SAMPLE_MS until it is ready or `maxMs` has passed, at least once. A view that can judge none of the contract's
 * checks ends it at that read, with `unjudged`. A read that a navigation cut off starts the comparison afresh.
 */
export async function waitForRegion(page: SettlePage, spec: RegionSpec, options: { maxMs: number; sampleMs?: number; now?: () => number }): Promise<RegionOutcome> {
  const now = options.now ?? Date.now
  const tracker = new RegionTracker(spec, now)
  const expression = tracker.expression()
  const sampleMs = options.sampleMs ?? REGION_SAMPLE_MS
  const deadline = now() + Math.max(0, options.maxMs)
  for (;;) {
    const readStarted = now()
    let json: unknown
    try {
      json = await page.evaluate(expression)
    } catch (error) {
      if (!isNavigationError(error)) throw error
      json = undefined
    }
    const ready = tracker.observe(json)
    if (!tracker.judgeable) return tracker.outcome()
    // A read takes what the last one took (a large page's HTML, its Markdown): none is begun that would end past the bound.
    const readMs = now() - readStarted
    const pause = Math.max(1, Math.min(sampleMs, deadline - now()))
    if (ready || now() + pause + readMs > deadline) return tracker.outcome()
    await page.waitForTimeout(pause)
  }
}

/** The trace event a region wait leaves: what it saw, by counts, never the page's text. */
export function regionWaitEvent(outcome: RegionOutcome | undefined, at: number, lane: Lane): TraceEvent | null {
  if (outcome === undefined) return null
  const { ready, empty, waitedMs, reads, judged, loading, steady, contractSha256: sha, checks, unjudged } = outcome
  return { at, lane, event: 'region_wait', detail: { ready, empty, waitedMs, reads, judged, loading, steady, contractSha256: sha, checks, ...(unjudged === undefined ? {} : { unjudged }) } }
}
