/**
 * Whether a page was ready for its task when it was read (ADR 0007, ROADMAP PA item 11), from the result's own
 * signals: its status and reason, its warnings and its trace. Without a task contract only the page-wide signals
 * speak. With one, the result's verification (ADR 0006) and the browser lane's wait for the region (`region_wait`)
 * tell the three apart: a region that held on the live page but not in what was extracted was not extracted; one that
 * never held on a page still loading or changing had not loaded; one that never held on a settled page was not served.
 */

import type { FetchResult, Readiness } from '@w2l/contracts'

/**
 * A rendered page with no main content and no more visible text than this is read as one whose content had not come
 * (a client-rendered shell, as OECD's Data Explorer reads before its data arrives); past it, as one whose content the
 * extractor missed. The text is the extractor's count of the page's visible characters once it has set aside what it
 * prunes, navigation among it (`textChars` on the lane's `extract` event). The browser's loading probe draws its line
 * at the same length (LOADING_PAGE_TEXT_MAX in @w2l/bench), on the page's whole `innerText`.
 */
export const SHELL_TEXT_MAX = 4_000

/** Failures where the page came but could not be read: no other route mends them. */
const NOT_EXTRACTED: ReadonlySet<string> = new Set([
  'body_too_large', 'decompressed_too_large', 'unsupported_content_type', 'unsupported_content_encoding', 'parse_error',
])

/** Lanes that read a page as received, without running its scripts: what they cannot find may not have come yet. */
const UNRENDERED_LANES: ReadonlySet<string> = new Set(['http'])

/** The page-wide signals that a page was read before what it shows had come, in a fixed order. */
function notLoadedSignals(result: FetchResult): string[] {
  const warnings = new Set((result.warnings ?? []).map((warning) => warning.code))
  const signals: string[] = []
  // A failed result carries no warning: its lane's wait is read from the trace.
  if (warnings.has('page_still_loading') || result.trace.some((event) => event.event === 'loading_wait' && event.detail?.cleared === false)) signals.push('page_still_loading')
  if (warnings.has('page_still_changing') || result.trace.some((event) => event.event === 'steady_wait' && event.detail?.steady === false)) signals.push('page_still_changing')
  if (warnings.has('client_rendered_suspected')) signals.push('client_rendered_suspected')
  if (result.trace.some((event) => event.event === 'wait_for' && event.detail?.cutShortBy !== undefined)) signals.push('wait_cut_short')
  if (result.usage.deadlineExceeded === true) signals.push('deadline_exceeded')
  if ((result.actions?.lists ?? []).some((list) => list.stoppedBy === 'deadline')) signals.push('list_not_exhausted')
  return signals
}

/** The page's visible characters as the lane's extractor counted them, or undefined when the lane did not record it. */
function pageTextChars(result: FetchResult): number | undefined {
  for (let i = result.trace.length - 1; i >= 0; i--) {
    const event = result.trace[i]!
    if (event.event !== 'extract') continue
    const chars = event.detail?.textChars
    return typeof chars === 'number' && Number.isFinite(chars) && chars >= 0 ? chars : undefined
  }
  return undefined
}

/** Whether the page answered with a success status: one the deadline then ended while it was being read had come in part. */
function answered(result: FetchResult): boolean {
  const status = result.evidence.httpStatus
  return typeof status === 'number' && status >= 200 && status < 300
}

/** How long the lane waited for the page: its last settle wait (loading_wait, steady_wait) and its last region wait, together. */
function waitedOf(result: FetchResult): number | undefined {
  const last = (names: readonly string[]): number | undefined => {
    for (let i = result.trace.length - 1; i >= 0; i--) {
      const event = result.trace[i]!
      if (!names.includes(event.event)) continue
      const waited = Number(event.detail?.waitedMs)
      if (Number.isFinite(waited) && waited >= 0) return Math.round(waited)
    }
    return undefined
  }
  const settle = last(['loading_wait', 'steady_wait'])
  const region = last(['region_wait'])
  return settle === undefined && region === undefined ? undefined : (settle ?? 0) + (region ?? 0)
}

function readiness(state: Readiness['state'], basis: readonly string[], result: FetchResult): Readiness {
  const waitedMs = waitedOf(result)
  return waitedMs === undefined ? { state, basis } : { state, basis, waitedMs }
}

/** The lane's last wait for the region the task needs, as the trace records it, when it judged this contract on at least one read. */
function regionWaitOf(result: FetchResult, sha: string): { ready: boolean; empty: boolean; loading: boolean; steady: boolean | null } | undefined {
  for (let i = result.trace.length - 1; i >= 0; i--) {
    const event = result.trace[i]!
    if (event.event !== 'region_wait') continue
    const detail = event.detail ?? {}
    // A stored page (the cache) may carry another request's wait: it says nothing of this contract's region.
    if (detail.contractSha256 !== sha || !(Number(detail.judged) > 0)) return undefined
    return { ready: detail.ready === true, empty: detail.empty === true, loading: detail.loading === true, steady: typeof detail.steady === 'boolean' ? detail.steady : null }
  }
  return undefined
}

/** The result's readiness: see Readiness in @w2l/contracts and ADR 0007's table. */
export function readinessOf(result: FetchResult): Readiness {
  const verification = result.verification
  if (verification !== undefined && verification.status !== 'not_requested') {
    const verified = verifiedReadiness(result, verification)
    if (verified !== undefined) return verified
  }
  return signalReadiness(result)
}

/**
 * With a task contract: the verification, and the region wait where a browser lane judged this contract on the live
 * page. Undefined when the page was not read, for the page's own signals to tell.
 */
function verifiedReadiness(result: FetchResult, verification: Exclude<NonNullable<FetchResult['verification']>, { status: 'not_requested' }>): Readiness | undefined {
  if (verification.status === 'passed') return readiness('ready', ['verified'], result)
  if (verification.reason === 'page_not_read') return undefined
  // A page proven empty that the contract does not accept: what the task needs was not served.
  if (verification.reason === 'empty_not_allowed') return readiness('not_served', ['empty_not_allowed'], result)
  const region = regionWaitOf(result, verification.contractSha256)
  if (region !== undefined) {
    if (region.ready && !region.empty) return readiness('not_extracted', ['checks_failed', 'region_ready'], result)
    // The list showed none on a settled page: the site served no records (or the selector names none).
    if (region.empty) return readiness('not_served', ['checks_failed', 'region_empty'], result)
    if (region.loading) return readiness('not_loaded', ['checks_failed', 'region_not_ready', 'page_still_loading'], result)
    if (region.steady === false) return readiness('not_loaded', ['checks_failed', 'region_not_ready', 'page_still_changing'], result)
    // One judged read, nothing to compare it with: whether the page had settled is not known.
    if (region.steady === null) return readiness('not_loaded', ['checks_failed', 'region_not_ready', 'steady_unknown'], result)
    return readiness('not_served', ['checks_failed', 'region_absent'], result)
  }
  // Read without its scripts, a page whose checks failed may hold its data once a browser runs them.
  if (UNRENDERED_LANES.has(result.lane)) return readiness('not_loaded', ['checks_failed', 'not_rendered'], result)
  // No live page judged this contract (a contract of json fields alone, a wait that had no time): the page's own
  // signals tell whether it had come, and the basis says the contract failed where nothing on the page was judged. A
  // page that had come by every signal, its contract failed on what was extracted from it, was not extracted: ready
  // is the contract passing.
  const signals = signalReadiness(result)
  return { ...signals, state: signals.state === 'ready' ? 'not_extracted' : signals.state, basis: [...signals.basis, 'checks_failed', 'region_unjudged'] }
}

/** Without a task contract, or for a page not read: the page-wide signals. */
function signalReadiness(result: FetchResult): Readiness {
  switch (result.status) {
    case 'success':
    case 'partial': {
      const signals = notLoadedSignals(result)
      return readiness(signals.length > 0 ? 'not_loaded' : 'ready', signals, result)
    }
    case 'empty_verified':
    case 'duplicate':
      return readiness('ready', [result.status], result)
    case 'blocked':
      return readiness('not_served', [result.blockReason ?? 'blocked'], result)
    case 'budget_exceeded':
      return readiness('not_served', [result.budgetExceeded ?? 'budget_exceeded'], result)
    // Stopped before the page was in: what it would have shown was not read.
    case 'cancelled':
      return readiness('not_loaded', ['cancelled'], result)
    case 'failed':
      return failedReadiness(result)
  }
}

function failedReadiness(result: FetchResult): Readiness {
  const reason = result.failureReason
  const signals = notLoadedSignals(result)
  switch (reason) {
    case 'empty_unverified': {
      if (signals.length > 0) return readiness('not_loaded', [...signals, reason], result)
      // A file with no text to read (a PDF without a text layer): it came, and no route reads more of it.
      if (result.file !== undefined) return readiness('not_extracted', [reason], result)
      // Read without its scripts, a page with no main content may be one they fill in: a browser reads it (ADR 0007).
      if (UNRENDERED_LANES.has(result.lane)) return readiness('not_loaded', [reason, 'not_rendered'], result)
      const text = pageTextChars(result)
      if (text === undefined) return readiness('not_loaded', [reason, 'text_unknown'], result)
      return text > SHELL_TEXT_MAX ? readiness('not_extracted', [reason], result) : readiness('not_loaded', [reason, 'little_text'], result)
    }
    // The ladder marks every timeout its deadline ended (`deadline_exceeded`): a wait it cut short, or a page that had
    // answered and was still being read, had not come; a site that never answered in time did not serve it.
    case 'timeout': {
      const waits = signals.filter((signal) => signal !== 'deadline_exceeded')
      return waits.length > 0 || answered(result) ? readiness('not_loaded', [...signals, reason], result) : readiness('not_served', [...signals, reason], result)
    }
    // The request's own step did not reach the region it acts on.
    case 'action_failed':
      return readiness('not_loaded', [...signals, reason], result)
    default:
      if (reason !== null && NOT_EXTRACTED.has(reason)) return readiness('not_extracted', [reason], result)
      // Every other failure: the route, the access or the region did not serve the page (http_error, policy_denied, a
      // network failure, provider_error, cache_miss), or nothing arrived at all (internal_error: the scrape threw).
      return readiness('not_served', [reason ?? 'failed'], result)
  }
}
