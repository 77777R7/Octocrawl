import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { decideNext, ladderActionDecisionEvent, type DecideNextInput, type LadderAction } from '../src/routing/decideNext.js'

const page = (over: Partial<FetchResult> = {}, http: number | null = 200): FetchResult => ({
  requestedUrl: 'https://site.example/a', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
  lane: 'http', escalations: [], markdown: '# A', links: [], truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: 'https://site.example/a', httpStatus: http, redirectChain: [], contentType: 'text/html', rawBodySha256: 'x', artifacts: [] },
  usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null }, trace: [],
  ...over,
})
const failed = (failureReason: FetchResult['failureReason'], http: number | null, over: Partial<FetchResult> = {}) => page({ status: 'failed', failureReason, markdown: null, ...over }, http)
const blocked = (blockReason: NonNullable<FetchResult['blockReason']>, http: number | null, over: Partial<FetchResult> = {}) => page({ status: 'blocked', blockReason, markdown: null, ...over }, http)

const http = { id: 'http' }
const browser = { id: 'browser_local', waitsFor: true }
const steel = { id: 'provider', vendorId: 'steel' }
const base: DecideNextInput = { result: page(), failureClass: null, readiness: null, verdict: null, remainingMs: 60_000, channel: http, next: browser }

const rows: ReadonlyArray<[string, Partial<DecideNextInput>, LadderAction, string]> = [
  // next_rung: the access was refused, or the page did not serve the region.
  ['a bot gate on http', { result: blocked('cloudflare_challenge', 403), failureClass: 'bot_gate' }, 'next_rung', 'bot_gate'],
  ['a 403 without a gate', { result: failed('http_error', 403) }, 'next_rung', 'http_403'],
  ['a page that did not serve the region', { verdict: 'failed', readiness: { state: 'not_served', basis: ['checks_failed'] } }, 'next_rung', 'not_served'],
  ['a vendor error goes to the next vendor', { result: failed('provider_error', null), failureClass: 'provider_error', channel: steel, next: { id: 'provider', vendorId: 'other' } }, 'next_rung', 'provider_error'],
  // wait_same_session: delivered but loading, on a browser rung.
  ['a browser page still loading', { channel: browser, next: steel, verdict: 'failed', readiness: { state: 'not_loaded', basis: ['loading_text'] }, waitedMs: 2_000 }, 'wait_same_session', 'not_loaded'],
  // reextract: captured, not extracted.
  ['a region there but not extracted', { verdict: 'failed', readiness: { state: 'not_extracted', basis: ['checks_failed'] } }, 'reextract', 'not_extracted'],
  // stop: the source's own failure, the budget, a passed page, nothing left.
  ['a 404', { result: failed('http_error', 404) }, 'stop', 'source:http_error'],
  ['a DNS failure', { result: failed('dns_error', null) }, 'stop', 'source:dns_error'],
  ['the deadline', { result: failed('timeout', null, { usage: { ...page().usage, deadlineExceeded: true } }) }, 'stop', 'budget'],
  ['a passed contract', { verdict: 'passed', readiness: 'ready' }, 'stop', 'contract_passed'],
  ['a delivered page without a contract', {}, 'stop', 'delivered'],
  ['a gate with no rung left', { result: blocked('captcha', 403), failureClass: 'captcha_required', next: null }, 'stop', 'captcha_required:no_rung_left'],
  // handoff: a login wall with an authorised session or a person; none, stop.
  ['a login wall with a granted session', { result: blocked('login_wall', 200), failureClass: 'login_required', handoff: 'authorized_session' }, 'handoff', 'login_wall:authorized_session'],
  ['a login wall with a person', { result: blocked('login_wall', 200), failureClass: 'login_required', handoff: 'person' }, 'handoff', 'login_wall:person'],
  ['a login wall and nobody to take it', { result: blocked('login_wall', 200), failureClass: 'login_required', handoff: null }, 'stop', 'login_wall:no_authorization'],
  // wait_retry_after: a 429 waits, never another identity.
  ['a 429 with Retry-After', { result: blocked('rate_limit', 429, { retryAt: Date.now() + 5_000 }), failureClass: 'rate_limited' }, 'wait_retry_after', 'retry_after'],
  ['a 429 without Retry-After', { result: blocked('rate_limit', 429), failureClass: 'rate_limited' }, 'wait_retry_after', 'rate_limited'],
  // keep_591_fallback: the exact initial headers timeout with at least 30 s left.
  ['the initial headers timeout with 30 s left', { result: failed('timeout', null), headersTimeout: true, remainingMs: 30_000 }, 'keep_591_fallback', 'initial_headers_timeout'],
  ['the initial headers timeout with less left', { result: failed('timeout', null), headersTimeout: true, remainingMs: 29_999 }, 'stop', 'initial_headers_timeout:budget'],
  // paginate_or_incomplete: the final projection lost what the contract needs.
  ['a cut with a cursor', { verdict: 'passed', projection: { lostRequired: true, continuation: true } }, 'paginate_or_incomplete', 'projection_cut:continuation'],
  ['a cut without one, passed before the cut', { verdict: 'passed', projection: { lostRequired: true, continuation: false } }, 'paginate_or_incomplete', 'projection_cut:incomplete'],
]

describe('decideNext: the ladder action for one rung\'s page', () => {
  it.each(rows)('%s', (_name, over, action, reason) => {
    expect(decideNext({ ...base, ...over })).toMatchObject({ action, reason })
  })

  it('covers all eight actions', () => {
    expect(new Set(rows.map(row => row[2])).size).toBe(8)
  })

  it('never sends a page that was there but not extracted to a paid rung', () => {
    const notExtracted = { verdict: 'failed' as const, readiness: { state: 'not_extracted' as const, basis: ['checks_failed'] } }
    // Read again first, whatever comes next.
    expect(decideNext({ ...base, ...notExtracted, channel: browser, next: steel })).toEqual({ action: 'reextract', reason: 'not_extracted' })
    // Once read again: a free rung may still be tried, a paid one never.
    expect(decideNext({ ...base, ...notExtracted, reextracted: true, next: browser })).toEqual({ action: 'next_rung', reason: 'not_extracted' })
    expect(decideNext({ ...base, ...notExtracted, reextracted: true, channel: browser, next: steel })).toEqual({ action: 'stop', reason: 'not_extracted:paid_rung_reads_same_page' })
    // The same holds when the page came from a paid rung and the next one is another vendor.
    expect(decideNext({ ...base, ...notExtracted, reextracted: true, channel: steel, next: { id: 'provider', vendorId: 'other' } }).action).toBe('stop')
  })

  it('reads region_unjudged as not_served first, as the ladder\'s contractReadiness does', () => {
    const unjudged = { verdict: 'failed' as const, readiness: { state: 'not_extracted' as const, basis: ['checks_failed', 'region_unjudged'] } }
    expect(decideNext({ ...base, ...unjudged, channel: browser, next: steel })).toEqual({ action: 'next_rung', reason: 'not_served' })
  })

  it('waits in the same session only on a browser rung, under the 10 s default, with time left to capture', () => {
    const loading = { verdict: 'failed' as const, readiness: { state: 'not_loaded' as const, basis: ['loading_text'] }, next: steel }
    expect(decideNext({ ...base, ...loading, channel: browser, waitedMs: 9_999 }).action).toBe('wait_same_session')
    // An HTTP page cannot wait for scripts: a browser rung may read it.
    expect(decideNext({ ...base, ...loading, channel: http, next: browser })).toEqual({ action: 'next_rung', reason: 'not_loaded' })
    expect(decideNext({ ...base, ...loading, channel: browser, waitedMs: 10_000 })).toEqual({ action: 'next_rung', reason: 'not_loaded' })
    expect(decideNext({ ...base, ...loading, channel: browser, waitedMs: 0, remainingMs: 1_000 })).toEqual({ action: 'next_rung', reason: 'not_loaded' })
    expect(decideNext({ ...base, ...loading, channel: browser, waitedMs: 0, remainingMs: 1_001 }).action).toBe('wait_same_session')
  })

  it('marks a handoff as assisted, and writes the shadow decision beside what the ladder did', () => {
    const decision = decideNext({ ...base, result: blocked('login_wall', 200), failureClass: 'login_required', handoff: 'person' })
    expect(decision.assisted).toBe(true)
    expect(ladderActionDecisionEvent(12, 'http', decision, 'stop')).toEqual({
      at: 12, event: 'ladder_action_decision', channel: 'http',
      detail: { shadow: 'handoff', reason: 'login_wall:person', actual: 'stop', differs: true, assisted: true },
    })
    expect(ladderActionDecisionEvent(3, 'http', { action: 'stop', reason: 'delivered' }, 'stop').detail).toEqual({ shadow: 'stop', reason: 'delivered', actual: 'stop', differs: false })
  })
})
