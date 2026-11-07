/**
 * Adaptive per-host pacing (AIMD) for crawls and batches: what in a page's
 * result counts as the site pushing back, and the numbers the frontier paces
 * a host by once it has. The frontier keeps the state (Frontier.noteResult)
 * and the task stores it (Task.pacing, HostPacing.adaptive), so a resumed run
 * and a hosted job's next slice start under the same pace.
 *
 * Signals come from results alone: a 429 or 503 (however the result ended), a
 * blocked result that is a challenge page or a rate limit, a page delivered in
 * place of the one asked for (`redirected_off_page`), a failed task contract.
 * A login wall or a geo block is not pacing's business. Two signals in a row
 * slow a host; one is not read as the site's rule, since a single odd page is
 * common (the IDS run of 2026-11-04 had 98 home-page redirects among 272).
 */

import type { FetchResult } from '@w2l/contracts'

export type SoftBlockSignal = 'rate_limited' | 'challenge' | 'redirected_off_page' | 'verification_failed'

/** Signals in a row before a host is slowed. */
export const SIGNALS_TO_SLOW = 2
/** Normal pages in a row before a slowed host's wait is halved. */
export const OK_PAGES_TO_RECOVER = 10
/** The first wait a slowdown sets, ms: the baseline doubled is too small to matter when it is 250 ms. */
export const FIRST_SLOW_DELAY_MS = 2_000
/** The longest wait a slowdown sets, ms. */
export const MAX_SLOW_DELAY_MS = 120_000
/**
 * How long a host that sent two pages up in a row is left alone, ms. A limit on rate answers that way for a while, whatever
 * is read: 45 s or so on www.english.ids-cologne.de (2026-11-07, eight times in 272 pages), where a read inside that time
 * came back the same, however often it was tried. One page sent up costs no such wait: it may be that page alone.
 */
export const BLOCK_HOLD_MS = 60_000
/**
 * The longest wait taken for a host's limit on rate, ms: www.english.ids-cologne.de never pushed back at it, in 272 pages. A
 * page that comes back is a sign of such a limit and no proof: a site that sends pages up at random gives the same sign, and
 * this is what that site pays, 450 pages an hour. A limit tighter than this is still waited out, one hold at a time.
 */
export const MAX_FLOOR_MS = 8_000
/**
 * The wait at which a signal that may have nothing to do with pace can stop counting, ms. A host slowed to it has had
 * more than a minute of slow reading. If a page read again still answers the same, the pace is not why, where a limit on rate clears
 * (www.english.ids-cologne.de, 2026-11-04: pages came back after about 40 s). Once settled the signal is not looked at
 * on that host: a limit that starts later goes unseen, and only `notServed` tells.
 */
export const SETTLE_DELAY_MS = 32_000
/** Signals a page itself can cause, whatever the pace: they can settle. A 429 or 503 is the site speaking of rate, and never does. */
export const SETTLING_SIGNALS: ReadonlySet<SoftBlockSignal> = new Set(['redirected_off_page', 'verification_failed'])
/** Signals a page is read again after (BatchRetry). A challenge page is not: it does not go away with a wait. */
export const RETRIED_SIGNALS: ReadonlySet<SoftBlockSignal> = new Set(['rate_limited', 'redirected_off_page', 'verification_failed'])

const CHALLENGE_REASONS = new Set(['cloudflare_challenge', 'captcha', 'bot_detected_generic'])

/**
 * Whether `finalUrl`'s path is shorter than `requestedUrl`'s. A limit on rate sends a page up, to the home page: 14 pages of
 * www.english.ids-cologne.de that read well at 18 pages a minute got a 302 to it at 100 a minute (2026-11-06). A script
 * that replaces a page with one as deep says something of that page, not of the pace: the same site's list took the place
 * of 39 of 60 exhibitors at any speed. That page is `redirected_off_page` all the same; it just says nothing of the pace.
 */
function shallower(finalUrl: string, requestedUrl: string): boolean {
  const depth = (url: string) => new URL(url).pathname.split('/').filter((segment) => segment.length > 0).length
  try { return depth(finalUrl) < depth(requestedUrl) } catch { return false }
}

/** What in `result` says the site is pushing back, or null for a page that counts as normal. */
export function softBlockSignal(result: FetchResult): SoftBlockSignal | null {
  const httpStatus = result.evidence.httpStatus
  if (httpStatus === 429 || httpStatus === 503) return 'rate_limited'
  if (result.status === 'blocked') {
    if (result.blockReason === 'rate_limit') return 'rate_limited'
    if (result.blockReason !== null && CHALLENGE_REASONS.has(result.blockReason)) return 'challenge'
    return null
  }
  if ((result.warnings ?? []).some((warning) => warning.code === 'redirected_off_page') && shallower(result.evidence.finalUrl, result.requestedUrl)) return 'redirected_off_page'
  // A page not read fails its contract without saying anything of the page: its own status tells what happened.
  if (result.verification?.status === 'failed' && result.verification.reason !== 'page_not_read') return 'verification_failed'
  return null
}
