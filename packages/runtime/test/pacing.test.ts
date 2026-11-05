import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { softBlockSignal } from '../src/pacing.js'

function result(over: Partial<FetchResult> & { httpStatus?: number } = {}): FetchResult {
  const { httpStatus = 200, ...rest } = over
  return {
    requestedUrl: 'https://fixture.test/a', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [],
    markdown: 'MAIN', links: [], truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: 'https://fixture.test/a', httpStatus, redirectChain: [], contentType: 'text/html', rawBodySha256: 'a', artifacts: [] },
    usage: { wallMs: 5, bytesWire: 10, bytesDecompressed: 10, requestCount: 1, attemptCount: 1, contentTokens: 4, browserMs: 0, externalCostUsd: null },
    trace: [], ...rest,
  }
}

describe('softBlockSignal: what in a page\'s result says the site is pushing back', () => {
  it('names a rate limit: a blocked/rate_limit result, or a 429 or 503 however the result ended', () => {
    expect(softBlockSignal(result({ status: 'blocked', blockReason: 'rate_limit', httpStatus: 429 }))).toBe('rate_limited')
    expect(softBlockSignal(result({ status: 'failed', failureReason: 'http_error', httpStatus: 503 }))).toBe('rate_limited')
    expect(softBlockSignal(result({ httpStatus: 429 }))).toBe('rate_limited')
  })
  it('names a challenge page: Cloudflare, a CAPTCHA or a generic bot check; a login wall and a geo block are not pacing signals', () => {
    for (const blockReason of ['cloudflare_challenge', 'captcha', 'bot_detected_generic'] as const) expect(softBlockSignal(result({ status: 'blocked', blockReason, httpStatus: 403 }))).toBe('challenge')
    for (const blockReason of ['login_wall', 'geo_restricted'] as const) expect(softBlockSignal(result({ status: 'blocked', blockReason, httpStatus: 200 }))).toBeNull()
  })
  it('names a page delivered in place of the one asked for, and a failed task contract', () => {
    expect(softBlockSignal(result({ warnings: [{ code: 'redirected_off_page', message: 'sent to /' }] }))).toBe('redirected_off_page')
    expect(softBlockSignal(result({ verification: { status: 'failed', verifier: 'v', contractSha256: 'c', reason: null, failed: ['x'], undecided: [] } as never }))).toBe('verification_failed')
  })
  it('sees nothing in a plain page, a 404, or a passed contract', () => {
    expect(softBlockSignal(result())).toBeNull()
    expect(softBlockSignal(result({ status: 'failed', failureReason: 'http_error', httpStatus: 404 }))).toBeNull()
    expect(softBlockSignal(result({ verification: { status: 'not_requested' } }))).toBeNull()
  })
})
