import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { Frontier } from '../src/frontier.js'
import { softBlockSignal, type SoftBlockSignal } from '../src/pacing.js'

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

describe('Frontier.noteResult: when a signal stops counting on a host', () => {
  const host = 'fixture.test'
  const frontier = () => new Frontier({ seedUrl: 'https://fixture.test/', perHostMinDelayMs: 0 })
  const slowTo32s = (f: Frontier, signal: SoftBlockSignal) => { for (let i = 0; i < 10; i++) f.noteResult(host, signal, 1_000) }

  it('settles when a page read again answers the same, at the wait its own signal set', () => {
    const f = frontier()
    slowTo32s(f, 'redirected_off_page')
    expect(f.hostDelayMs(host)).toBe(32_000)
    expect(f.noteResult(host, 'redirected_off_page', 1_000, 'redirected_off_page')).toMatchObject({ change: 'settled', delayMs: 0 })
    expect(f.settled(host, 'redirected_off_page')).toBe(true)
    expect(f.pacing()[host]).toMatchObject({ settled: ['redirected_off_page'] })
    expect(f.pacing()[host]?.adaptive).toBeUndefined()
  })

  it('does not settle on a first read, on a wait another signal set, or on a 429', () => {
    const first = frontier()
    slowTo32s(first, 'redirected_off_page')
    first.noteResult(host, 'redirected_off_page', 1_000)
    expect(first.settled(host, 'redirected_off_page')).toBe(false)
    const limited = frontier()
    slowTo32s(limited, 'rate_limited')
    expect(limited.noteResult(host, 'redirected_off_page', 1_000, 'redirected_off_page')?.change).not.toBe('settled')
    expect(limited.noteResult(host, 'rate_limited', 1_000, 'rate_limited')?.change).not.toBe('settled')
    expect(limited.settled(host, 'redirected_off_page')).toBe(false)
    // A wait two signals built up is neither's.
    const mixed = frontier()
    for (let i = 0; i < 8; i++) mixed.noteResult(host, 'rate_limited', 1_000)
    mixed.noteResult(host, 'rate_limited', 1_000)
    mixed.noteResult(host, 'redirected_off_page', 1_000)
    expect(mixed.hostDelayMs(host)).toBe(32_000)
    expect(mixed.noteResult(host, 'redirected_off_page', 1_000, 'redirected_off_page')?.change).not.toBe('settled')
  })

  it('takes a settled signal for no news: it neither slows the host nor counts as a normal page', () => {
    const f = new Frontier({ seedUrl: 'https://fixture.test/', perHostMinDelayMs: 0, settledByHost: new Map([[host, ['redirected_off_page']]]) })
    // A 429 streak goes on through it, and slows the host as two in a row.
    expect(f.noteResult(host, 'rate_limited', 1_000)).toBeNull()
    expect(f.noteResult(host, 'redirected_off_page', 1_000, 'redirected_off_page')).toBeNull()
    expect(f.noteResult(host, 'rate_limited', 1_000)?.change).toBe('slowed')
  })
})

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
    const sentHome = { requestedUrl: 'https://fixture.test/exhibitor/a', evidence: { ...result().evidence, finalUrl: 'https://fixture.test/' } }
    expect(softBlockSignal(result({ ...sentHome, warnings: [{ code: 'redirected_off_page', message: 'sent to /' }] }))).toBe('redirected_off_page')
    // A page a script replaced with one as deep says nothing of the pace (39 of 60 IDS exhibitors at any speed, 2026-11-06).
    expect(softBlockSignal(result({ requestedUrl: 'https://fixture.test/exhibitor/a', evidence: { ...result().evidence, finalUrl: 'https://fixture.test/all/list/?go=x' }, warnings: [{ code: 'redirected_off_page', message: 'replaced' }] }))).toBeNull()
    expect(softBlockSignal(result({ verification: { status: 'failed', verifier: 'v', contractSha256: 'c', reason: null, failed: ['x'], undecided: [] } as never }))).toBe('verification_failed')
  })
  it('takes a contract failed because the page was not read as no signal: a timeout or a lockdown miss is not the site pushing back', () => {
    expect(softBlockSignal(result({ status: 'failed', failureReason: 'timeout', verification: { status: 'failed', verifier: 'v', contractSha256: 'c', reason: 'page_not_read', checks: [] } as never }))).toBeNull()
  })
  it('sees nothing in a plain page, a 404, or a passed contract', () => {
    expect(softBlockSignal(result())).toBeNull()
    expect(softBlockSignal(result({ status: 'failed', failureReason: 'http_error', httpStatus: 404 }))).toBeNull()
    expect(softBlockSignal(result({ verification: { status: 'not_requested' } }))).toBeNull()
  })
})
