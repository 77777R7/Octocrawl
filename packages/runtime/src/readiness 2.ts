/**
 * Whether a page was ready for its task when it was read (ADR 0007, ROADMAP PA item 11), from the result's own
 * signals: its status and reason, its warnings and its trace. Without a task contract only the page-wide signals
 * speak; a contract's checks run on the page (ADR 0006) refine `not_extracted` and `not_served` later.
 */

import type { FetchResult, Readiness } from '@w2l/contracts'

/**
 * A page with no main content and no more text than this is read as one whose content had not come (a client-rendered
 * shell, as OECD's Data Explorer reads before its data arrives); past it, as one whose content the extractor missed.
 * The browser's loading probe draws the line at the same length (LOADING_PAGE_TEXT_MAX in @w2l/bench).
 */
export const SHELL_TEXT_MAX = 4_000

/** Failures where the route, the access or the region did not serve the page. */
const NOT_SERVED: ReadonlySet<string> = new Set([
  'dns_error', 'connection_error', 'tls_error', 'http_error', 'redirect_limit', 'redirect_loop', 'loop_detected',
  'policy_denied', 'provider_error', 'identity_compromised', 'cache_miss',
])

/** Failures where the page came but could not be read: no other route mends them. */
const NOT_EXTRACTED: ReadonlySet<string> = new Set([
  'body_too_large', 'decompressed_too_large', 'unsupported_content_type', 'unsupported_content_encoding', 'parse_error',
  'internal_error',
])

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

/** How long the lane waited for the page to settle: its last recorded wait. */
function waitedOf(result: FetchResult): number | undefined {
  for (let i = result.trace.length - 1; i >= 0; i--) {
    const event = result.trace[i]!
    if (event.event !== 'loading_wait' && event.event !== 'steady_wait') continue
    const waited = Number(event.detail?.waitedMs)
    if (Number.isFinite(waited) && waited >= 0) return Math.round(waited)
  }
  return undefined
}

function readiness(state: Readiness['state'], basis: readonly string[], result: FetchResult): Readiness {
  const waitedMs = waitedOf(result)
  return waitedMs === undefined ? { state, basis } : { state, basis, waitedMs }
}

/** The result's readiness: see Readiness in @w2l/contracts and ADR 0007's table. */
export function readinessOf(result: FetchResult): Readiness {
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
      // The whole page is kept as evidence when the extractor found no main content: a page with text it missed, or a shell.
      const text = result.markdown?.length ?? 0
      return text > SHELL_TEXT_MAX ? readiness('not_extracted', [reason], result) : readiness('not_loaded', [reason, 'little_text'], result)
    }
    // A wait the deadline cut short, or a deadline the page ran into, did not see the page come; a site that never answered in time did not serve it.
    case 'timeout':
      return signals.length > 0 ? readiness('not_loaded', [...signals, reason], result) : readiness('not_served', [reason], result)
    // The request's own step did not reach the region it acts on.
    case 'action_failed':
      return readiness('not_loaded', [...signals, reason], result)
    default:
      if (reason !== null && NOT_EXTRACTED.has(reason)) return readiness('not_extracted', [reason], result)
      if (reason !== null && NOT_SERVED.has(reason)) return readiness('not_served', [reason], result)
      return readiness('not_served', [reason ?? 'failed'], result)
  }
}
