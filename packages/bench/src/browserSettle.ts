import type { FetchResult, Lane, TraceEvent } from '@w2l/contracts'

export interface SettlePage {
  evaluate(expression: string): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
}

export interface SettleOptions {
  maxMs?: number
  minMs?: number
  sampleMs?: number
  /**
   * How long in all a page that still shows a loading indicator is waited for (LOADING_PROBE): past `maxMs`, until the
   * indicator is gone and the page is stable. Default `maxMs`: no longer than any other page.
   */
  loadingMaxMs?: number
}

/** What the wait saw: whether the page showed a loading indicator, whether it still did when the wait ended, and how long it took. */
export interface SettleOutcome {
  loadingSeen: boolean
  stillLoading: boolean
  waitedMs: number
}

/**
 * Whether a page with little text shows that its data is still on the way: a visible element marked busy
 * (`aria-busy="true"`, the page's own root aside), or a visible short text, not a button's or a link's, that is or ends in
 * a loading message ("Loading…", "Fetching results...", "Please wait", "Search Results Fetching..."). A page with more
 * text than LOADING_PAGE_TEXT_MAX is read for that text: a loader left on it (more comments, a feed's next page) is not its
 * data. Visible means a box of some size on the page that neither it nor an ancestor hides (`checkVisibility`, with
 * opacity). Progress bars and skeleton classes are not signs: rating histograms, language bars and button styles use
 * them on finished pages. The probe never fails the page: an error in it reads as not loading (ROADMAP PA item 4, where
 * a vendor page read in 1.5 s said "Inventory Search Results Fetching...").
 */
export const LOADING_PAGE_TEXT_MAX = 4_000

export const LOADING_PROBE = `(() => {
  try {
    const body = document.body
    if (body === null || (body.innerText ?? '').length > ${LOADING_PAGE_TEXT_MAX}) return false
    const shown = (el) => {
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1 || box.right <= 0 || box.bottom <= 0) return false
      if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }
    for (const el of body.querySelectorAll('[aria-busy="true"]')) if (shown(el)) return true
    const message = /^(?:(?:loading|fetching|please wait|one moment|searching|retrieving)(?:\\s+[\\w-]+){0,3}\\s*(?:\\.{2,3}|\\u2026)|loading|fetching|please wait)$/i
    const trailing = /\\b(?:loading|fetching)\\s*(?:\\.{2,3}|\\u2026)$/i
    // 4 is NodeFilter.SHOW_TEXT, named so that a page replacing NodeFilter cannot break the probe.
    const walker = document.createTreeWalker(body, 4)
    let seen = 0
    for (let node = walker.nextNode(); node !== null && seen < 20000; node = walker.nextNode(), seen++) {
      const text = (node.textContent ?? '').trim()
      if (text.length === 0 || text.length > 48 || !(message.test(text) || trailing.test(text))) continue
      const parent = node.parentElement
      if (parent !== null && parent.closest('button, a') === null && shown(parent)) return true
    }
    return false
  } catch {
    return false
  }
})()`

/**
 * Wait for a minimum observation window, then require two equal snapshots of
 * both rendered text and DOM size. A stable loading shell must not finish the
 * wait before the minimum window, while long-polling pages remain bounded.
 * A page that loads another document meanwhile (a script or a meta refresh
 * navigates) is observed afresh: within the same bound, or, for a caller that
 * waits for loading pages (`loadingMaxMs`), as still loading, within that one.
 */
export async function waitForRenderedStability(
  page: SettlePage,
  options: SettleOptions = {},
): Promise<SettleOutcome> {
  const maxMs = options.maxMs ?? 1_500
  const minMs = Math.min(options.minMs ?? 500, maxMs)
  const sampleMs = options.sampleMs ?? 100
  const started = Date.now()
  const deadline = started + maxMs
  // A page still showing a loading indicator is waited for longer, within this bound.
  const loadingDeadline = started + Math.max(maxMs, options.loadingMaxMs ?? maxMs)
  let observedSince = Date.now()
  let previous = ''
  let stableRounds = 0
  let loading = false
  let loadingSeen = false
  // Only a caller that asked for the longer wait has a loading page held past the usual bound, or kept from finishing early.
  const extends_ = loadingDeadline > deadline
  const outcome = (): SettleOutcome => ({ loadingSeen, stillLoading: loading, waitedMs: Date.now() - started })
  const bound = () => (extends_ && loading ? loadingDeadline : deadline)

  while (Date.now() < bound()) {
    let snapshot: unknown
    try {
      snapshot = await page.evaluate(`(() => {
        const root = document.documentElement
        const body = document.body
        return JSON.stringify({
          size: root?.outerHTML.length ?? 0,
          text: body?.innerText ?? '',
          loading: ${LOADING_PROBE},
        })
      })()`)
    } catch (error) {
      if (!isNavigationError(error)) throw error
      // The document went away mid-sample: the next one starts a new window. A page that replaces its document while it
      // loads (a client-side redirect) is still loading, for a caller that waits for one: the next document is waited for.
      observedSince = Date.now()
      previous = ''
      stableRounds = 0
      if (extends_) { loading = true; loadingSeen = true }
      await page.waitForTimeout(Math.min(sampleMs, Math.max(1, bound() - Date.now())))
      continue
    }
    const current = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
    loading = isLoading(current)
    loadingSeen ||= loading
    if (current === previous) stableRounds++
    else stableRounds = 0
    previous = current

    if (Date.now() - observedSince >= minMs && stableRounds >= 2 && !(extends_ && loading)) return outcome()
    await page.waitForTimeout(Math.min(sampleMs, Math.max(1, bound() - Date.now())))
  }
  return outcome()
}

/** How long a page still showing a loading indicator is waited for in all, before it is read anyway. */
export const LOADING_WAIT_MAX_MS = 8_000

/** The trace event a wait that saw a loading indicator leaves: how long it took, and whether the indicator went. */
export function loadingWaitEvent(outcome: SettleOutcome | undefined, at: number, lane: Lane): TraceEvent | null {
  if (outcome === undefined || !outcome.loadingSeen) return null
  return { at, lane, event: 'loading_wait', detail: { waitedMs: outcome.waitedMs, cleared: !outcome.stillLoading } }
}

/** A page read as content while it still showed a loading indicator says so: its data may not be in the answer. */
export function withStillLoadingWarning(result: FetchResult): FetchResult {
  if (result.status !== 'success' && result.status !== 'partial') return result
  const waited = result.trace.find((event) => event.event === 'loading_wait' && event.detail?.cleared === false)
  if (waited === undefined) return result
  const seconds = Math.round(Number(waited.detail?.waitedMs ?? 0) / 100) / 10
  const warning = { code: 'page_still_loading', message: `The page still showed a loading indicator when it was read, after ${seconds} s: its data may not be in this answer.` }
  return { ...result, warnings: [...(result.warnings ?? []), warning] }
}

function isLoading(snapshot: string): boolean {
  try { return (JSON.parse(snapshot) as { loading?: unknown }).loading === true } catch { return false }
}

/**
 * Playwright's error for an evaluation or a read the page's own navigation
 * cut off: the document it ran in was replaced while it ran.
 */
export function isNavigationError(error: unknown): boolean {
  return error instanceof Error && /Execution context was destroyed|because of a navigation|page is navigating and changing the content|Cannot find context with specified id/i.test(error.message)
}
