/**
 * What the ladder should do after one rung's page (PA F4, shadow mode).
 *
 * One pure function over what the ladder already knows about the page: the
 * routing failure class, its readiness (ADR 0007), the contract's verdict
 * (ADR 0006), the time left and the rung it came from. The ladder records the
 * decision as `ladder_action_decision` beside what it actually did; nothing
 * here drives the loop yet.
 *
 * The eight actions:
 * - `next_rung`: the access was refused (a gate, a 403 without one) or the page
 *   did not serve the region; a stronger rung may.
 * - `wait_same_session`: delivered but still loading, on a browser rung that can
 *   wait longer in the same page and still capture before the deadline.
 * - `reextract`: the region is there but its extraction missed what the contract
 *   asks; the captured page is read again, free, before anything is paid.
 * - `stop`: the source's own failure (404, 5xx, DNS), the budget, a passed page,
 *   or nothing left to try.
 * - `handoff`: a login wall, with an authorised session or a person to take it;
 *   without either the run stops. A handoff is assisted and counted apart.
 * - `wait_retry_after`: a 429 or a Retry-After: wait, never another identity.
 * - `keep_591_fallback`: the exact initial headers timeout of #591 with at least
 *   30 s left, which keeps its one bounded local browser fallback.
 * - `paginate_or_incomplete`: the final projection lost content the contract
 *   needs; page through it (cursor, full artifact reference) or answer
 *   incomplete under the same contract, never with the passed of before the cut.
 *
 * Hard rules: a `not_extracted` page never sends the run to a paid rung (a paid
 * rung reads the same page); `region_unjudged` is first read as `not_served`,
 * as the ladder's contractReadiness does; `wait_same_session` is only for a
 * browser rung's `not_loaded` page that has waited less than the default
 * 10 s and can still be captured before the deadline.
 */
import type { FetchResult, Readiness, ReadinessState } from '@w2l/contracts'
import { ESCALATABLE_FAILURE_CLASS, VENDOR_LEVEL_FAILURE_CLASS, type RoutingFailureClass } from '@w2l/http-core'
import type { Channel } from './ladder.js'

export const LADDER_ACTION = [
  'next_rung',
  'wait_same_session',
  'reextract',
  'stop',
  'handoff',
  'wait_retry_after',
  'keep_591_fallback',
  'paginate_or_incomplete',
] as const
export type LadderAction = (typeof LADDER_ACTION)[number]

/** The longest a page waits in the same session by default: the browser's region wait (regionWait.ts). */
export const SAME_SESSION_WAIT_MAX_MS = 10_000
/** Time kept before the deadline for the final capture and extraction (browserLocal's CAPTURE_RESERVE_MS). */
export const FINAL_CAPTURE_RESERVE_MS = 1_000
/** The time #591's local fallback needs left (ladder.ts HEADERS_TIMEOUT_FALLBACK_MS). */
export const HEADERS_TIMEOUT_FALLBACK_MIN_MS = 30_000

type RungRef = Pick<Channel, 'id' | 'vendorId' | 'waitsFor'>

export interface DecideNextInput {
  result: FetchResult
  failureClass: RoutingFailureClass | null
  /** The page's readiness as readinessOf gives it; null when there is no contract to judge it by. */
  readiness: Readiness | ReadinessState | null
  /** The contract's verdict on this page (ladder's contractVerdict); null without a contract or when unjudged. */
  verdict: 'passed' | 'failed' | null
  /** Milliseconds to the caller's deadline; null without one. */
  remainingMs: number | null
  channel: RungRef
  /** The rung the ladder would try next, or null when none is left. */
  next?: RungRef | null
  /** How long this rung already waited for the page's region in the same session. */
  waitedMs?: number
  /** The rung's failure is #591's initial headers timeout (ladder.ts initialHeadersTimeout). */
  headersTimeout?: boolean
  /** Who can take a login wall: an authorised session (a grant's), a person, or nobody. */
  handoff?: 'authorized_session' | 'person' | null
  /** The captured page was already read again for this contract (candidateExtraction). */
  reextracted?: boolean
  /** The final projection (an MCP budget cut, a page limit) dropped content the contract needs; `continuation` when a cursor or full artifact can deliver it. */
  projection?: { lostRequired: boolean; continuation: boolean } | null
}

export interface ActionDecision {
  action: LadderAction
  /** A code for why, stable for the trace. */
  reason: string
  /** A handoff is assisted, not unattended: counted apart (Evidence Record access.completion). */
  assisted?: true
}

const BROWSER_RUNGS: ReadonlySet<string> = new Set(['browser_local', 'installed_chrome', 'hosted_chrome', 'authed_session'])
const isPaid = (rung: RungRef | null | undefined): boolean => rung?.vendorId !== undefined

/** The readiness the ladder acts on: a `not_extracted` page whose region no live read judged is `not_served` (contractReadiness). */
export function actionableReadiness(readiness: DecideNextInput['readiness']): ReadinessState | null {
  if (readiness === null) return null
  if (typeof readiness === 'string') return readiness
  return readiness.state === 'not_extracted' && readiness.basis.includes('region_unjudged') ? 'not_served' : readiness.state
}

function stepUp(input: DecideNextInput, why: string, state: ReadinessState | null): ActionDecision {
  if (input.next === null || input.next === undefined) return { action: 'stop', reason: `${why}:no_rung_left` }
  // A paid rung reads the same page: a page that was there but not extracted never goes to one.
  if (state === 'not_extracted' && isPaid(input.next)) return { action: 'stop', reason: `${why}:paid_rung_reads_same_page` }
  return { action: 'next_rung', reason: why }
}

export function decideNext(input: DecideNextInput): ActionDecision {
  const { result, failureClass, verdict, remainingMs, channel } = input
  const state = actionableReadiness(input.readiness)
  if (input.projection?.lostRequired === true) {
    return { action: 'paginate_or_incomplete', reason: input.projection.continuation ? 'projection_cut:continuation' : 'projection_cut:incomplete' }
  }
  if (verdict === 'passed') return { action: 'stop', reason: 'contract_passed' }
  if (failureClass === 'rate_limited' || result.retryAt !== undefined || result.evidence.httpStatus === 429) {
    return { action: 'wait_retry_after', reason: result.retryAt !== undefined ? 'retry_after' : 'rate_limited' }
  }
  if (failureClass === 'login_required' || result.blockReason === 'login_wall') {
    if (input.handoff === 'authorized_session' || input.handoff === 'person') return { action: 'handoff', reason: `login_wall:${input.handoff}`, assisted: true }
    return { action: 'stop', reason: 'login_wall:no_authorization' }
  }
  if (input.headersTimeout === true) {
    return remainingMs === null || remainingMs >= HEADERS_TIMEOUT_FALLBACK_MIN_MS
      ? { action: 'keep_591_fallback', reason: 'initial_headers_timeout' }
      : { action: 'stop', reason: 'initial_headers_timeout:budget' }
  }
  if (result.usage.deadlineExceeded === true || (remainingMs !== null && remainingMs <= 0)) return { action: 'stop', reason: 'budget' }
  if (verdict === 'failed') {
    if (state === 'not_extracted') {
      if (input.reextracted !== true) return { action: 'reextract', reason: 'not_extracted' }
      return stepUp(input, 'not_extracted', state)
    }
    if (state === 'not_loaded') {
      const browser = channel.waitsFor === true || BROWSER_RUNGS.has(channel.id)
      const waited = input.waitedMs ?? (typeof input.readiness === 'object' && input.readiness !== null ? input.readiness.waitedMs : undefined) ?? 0
      if (browser && waited < SAME_SESSION_WAIT_MAX_MS && (remainingMs === null || remainingMs > FINAL_CAPTURE_RESERVE_MS)) {
        return { action: 'wait_same_session', reason: 'not_loaded' }
      }
      return stepUp(input, 'not_loaded', state)
    }
    return stepUp(input, state ?? 'contract_failed', state)
  }
  if (failureClass !== null && (ESCALATABLE_FAILURE_CLASS.has(failureClass) || VENDOR_LEVEL_FAILURE_CLASS.has(failureClass))) {
    return stepUp(input, failureClass, state)
  }
  if (result.status === 'failed') {
    const status = result.evidence.httpStatus
    // A 403 or 405 without a recognised gate is often a bot defence (ladder.ts strongerRungMayAnswer).
    if (result.failureReason === 'http_error' && (status === 403 || status === 405)) return stepUp(input, `http_${status}`, state)
    return { action: 'stop', reason: `source:${result.failureReason ?? 'failed'}` }
  }
  return { action: 'stop', reason: 'delivered' }
}

/** The ladder's `ladder_action_decision` entry: the shadow decision beside the action the ladder took. */
export function ladderActionDecisionEvent(
  at: number,
  channel: string,
  decision: ActionDecision,
  actual: LadderAction,
): { at: number; event: 'ladder_action_decision'; channel: string; detail: Record<string, unknown> } {
  return {
    at,
    event: 'ladder_action_decision',
    channel,
    detail: { shadow: decision.action, reason: decision.reason, actual, differs: decision.action !== actual, ...(decision.assisted ? { assisted: true } : {}) },
  }
}
