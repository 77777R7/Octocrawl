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
 * Whether the page shows that its data is still on the way: a visible element marked busy (`aria-busy="true"`) or a
 * progress bar, a visible element whose short text is a loading message ("Loading…", "Fetching results...", "Please
 * wait") or ends in one ("Search Results Fetching..."), or three visible skeleton placeholders. A page captured then holds the placeholder, not the data (a vendor
 * page read in 1.5 s said "Inventory Search Results Fetching...", ROADMAP PA item 4).
 */
export const LOADING_PROBE = `(() => {
  const shown = (el) => {
    const box = el.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) return false
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }
  for (const el of document.querySelectorAll('[aria-busy="true"], [role="progressbar"]')) if (shown(el)) return true
  const message = /^(?:(?:loading|fetching|please wait|one moment|searching|retrieving)(?:\\s+[\\w-]+){0,3}\\s*(?:\\.{2,3}|\\u2026)|loading|fetching|please wait)$/i
  const trailing = /\\b(?:loading|fetching)\\s*(?:\\.{2,3}|\\u2026)$/i
  const root = document.body ?? document.documentElement
  if (root !== null) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let seen = 0
    for (let node = walker.nextNode(); node !== null && seen < 20000; node = walker.nextNode(), seen++) {
      const text = (node.textContent ?? '').trim()
      if (text.length === 0 || text.length > 48 || !(message.test(text) || trailing.test(text))) continue
      const parent = node.parentElement
      if (parent !== null && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName) && shown(parent)) return true
    }
  }
  let skeletons = 0
  for (const el of document.querySelectorAll('[class*="skeleton" i], [class*="shimmer" i]')) if (shown(el) && ++skeletons >= 3) return true
  return false
})()`

/**
 * Wait for a minimum observation window, then require two equal snapshots of
 * both rendered text and DOM size. A stable loading shell must not finish the
 * wait before the minimum window, while long-polling pages remain bounded.
 * A page that loads another document meanwhile (a script or a meta refresh
 * navigates) is observed afresh, within the same bound.
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
  const outcome = (): SettleOutcome => ({ loadingSeen, stillLoading: loading, waitedMs: Date.now() - started })
  const bound = () => (loading ? loadingDeadline : deadline)

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
      // The document went away mid-sample: the next one starts a new window.
      observedSince = Date.now()
      previous = ''
      stableRounds = 0
      await page.waitForTimeout(Math.min(sampleMs, Math.max(1, bound() - Date.now())))
      continue
    }
    const current = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
    loading = isLoading(current)
    loadingSeen ||= loading
    if (current === previous) stableRounds++
    else stableRounds = 0
    previous = current

    if (Date.now() - observedSince >= minMs && stableRounds >= 2 && !loading) return outcome()
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
