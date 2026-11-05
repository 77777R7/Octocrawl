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

const CHALLENGE_REASONS = new Set(['cloudflare_challenge', 'captcha', 'bot_detected_generic'])

/** What in `result` says the site is pushing back, or null for a page that counts as normal. */
export function softBlockSignal(result: FetchResult): SoftBlockSignal | null {
  const httpStatus = result.evidence.httpStatus
  if (httpStatus === 429 || httpStatus === 503) return 'rate_limited'
  if (result.status === 'blocked') {
    if (result.blockReason === 'rate_limit') return 'rate_limited'
    if (result.blockReason !== null && CHALLENGE_REASONS.has(result.blockReason)) return 'challenge'
    return null
  }
  if ((result.warnings ?? []).some((warning) => warning.code === 'redirected_off_page')) return 'redirected_off_page'
  if (result.verification?.status === 'failed') return 'verification_failed'
  return null
}
