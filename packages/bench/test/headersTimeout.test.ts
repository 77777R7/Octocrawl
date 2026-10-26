import { afterEach, describe, expect, it, vi } from 'vitest'
import { readinessOf } from '@w2l/runtime'
import { identityBundleFrom, modeIdentity, type FetchResult } from '@w2l/contracts'
import { LadderRunner, type Channel } from '../src/routing/ladder.js'

const url = 'https://www.zalando.de/herrenschuhe/'
const identity = identityBundleFrom(modeIdentity('standard'))

function headersTimeout(): FetchResult {
  return {
    requestedUrl: url, status: 'failed', failureReason: 'timeout', blockReason: null, budgetExceeded: null,
    lane: 'http', escalations: [], handoff: null, markdown: null, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 12_000, bytesWire: 0, bytesDecompressed: 0, requestCount: 1, attemptCount: 1, contentTokens: null, browserMs: 0, externalCostUsd: 0 },
    trace: [{ at: 12_000, lane: 'http', event: 'request_failed', detail: { reason: 'timeout', error: 'HeadersTimeoutError', code: 'UND_ERR_HEADERS_TIMEOUT' } }],
  }
}

function product(): FetchResult {
  const timeout = headersTimeout()
  return { ...timeout, status: 'success', failureReason: null, lane: 'browser_local',
    markdown: '# Shoes\n\nTrail Runner — €79.95',
    evidence: { ...timeout.evidence, httpStatus: 200, contentType: 'text/html', rawBodySha256: 'a'.repeat(64) },
    usage: { ...timeout.usage, wallMs: 6500, bytesWire: 100, bytesDecompressed: 100, contentTokens: 12, browserMs: 6500 }, trace: [] }
}

function channel(id: string, result: FetchResult): Channel & { calls: number } {
  return { id, identity, calls: 0, async fetch() { this.calls++; return result } }
}

describe('HTTP headers-timeout local fallback', () => {
  it('offers one eligible local browser when the HTTP header cap expires with run budget left', async () => {
    const http = channel('http', headersTimeout())
    const browser = channel('browser_local', product())
    const run = await new LadderRunner([http, browser], { mode: 'standard' }).run(url, null, { deadlineAt: Date.now() + 300_000 })
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result.markdown).toContain('€79.95')
    expect(run.summary.attempts[0]?.result).toEqual(headersTimeout())
    expect(browser.calls).toBe(1)
  })
})


afterEach(() => vi.useRealTimers())

const budget = () => ({ deadlineAt: Date.now() + 300_000 })

describe('headers-timeout fallback boundaries', () => {
  it.each([
    ['generic timeout', (r: FetchResult) => ({ ...r, trace: [] })],
    ['body timeout', (r: FetchResult) => ({ ...r, trace: [{ at: 10, lane: 'http' as const, event: 'request_failed', detail: { error: 'BodyTimeoutError', code: 'UND_ERR_BODY_TIMEOUT' } }] })],
    ['run deadline', (r: FetchResult) => ({ ...r, usage: { ...r.usage, deadlineExceeded: true } })],
    ['received status', (r: FetchResult) => ({ ...r, evidence: { ...r.evidence, httpStatus: 503 } })],
    ['received body', (r: FetchResult) => ({ ...r, evidence: { ...r.evidence, rawBodySha256: 'a'.repeat(64) } })],
    ['received bytes', (r: FetchResult) => ({ ...r, usage: { ...r.usage, bytesDecompressed: 100 } })],
    ['later HTTP retry', (r: FetchResult) => ({ ...r, usage: { ...r.usage, attemptCount: 2 } })],
    ['publisher cooldown', (r: FetchResult) => ({ ...r, retryAt: Date.now() + 60_000 })],
    ['robots refusal', (r: FetchResult) => ({ ...r, failureReason: 'policy_denied' as const })],
    ['rate limit', (r: FetchResult) => ({ ...r, status: 'blocked' as const, failureReason: null, blockReason: 'rate_limit' as const })],
  ])('keeps %s terminal', async (_name, modify) => {
    const browser = channel('browser_local', product())
    const run = await new LadderRunner([channel('http', modify(headersTimeout())), browser], { mode: 'standard' }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toBe(0)
  })

  it.each([undefined, Number.POSITIVE_INFINITY, 29_000])('requires a known full local-call budget: %s', async remaining => {
    const browser = channel('browser_local', product())
    const run = await new LadderRunner([channel('http', headersTimeout()), browser], { mode: 'standard' }).run(url, null, remaining === undefined ? {} : { deadlineAt: Date.now() + remaining })
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toBe(0)
  })

  it.each(['absent', 'not served', 'refused', 'bad identity'])('requires an eligible local browser: %s', async kind => {
    const browser = channel('browser_local', product())
    if (kind === 'not served') browser.serves = () => false
    if (kind === 'refused') browser.refusal = () => 'request options refused'
    if (kind === 'bad identity') Object.assign(browser, { identity: undefined })
    const run = await new LadderRunner([channel('http', headersTimeout()), ...(kind === 'absent' ? [] : [browser])], { mode: 'standard' }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toBe(0)
  })

  it('does not treat compatible transport as the initial HTTP rung', async () => {
    const browser = channel('browser_local', product())
    const run = await new LadderRunner([channel('http_compat', headersTimeout()), browser], { mode: 'standard' }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http_compat'])
  })

  it('does not fetch outside the allowlist', async () => {
    const http = channel('http', headersTimeout())
    const browser = channel('browser_local', product())
    const run = await new LadderRunner([http, browser], { mode: 'standard', allowlistedDomains: ['other.example'] }).run(url, null, budget())
    expect(run.result.failureReason).toBe('policy_denied')
    expect(http.calls + browser.calls).toBe(0)
  })

  it('keeps a saved authenticated session on its route', async () => {
    const http = channel('http', headersTimeout())
    const browser = channel('browser_local', product())
    const run = await new LadderRunner([http, browser], { mode: 'authed' }).run(url, { domain: 'www.zalando.de', vendor: 'browser_local_authed', attestedBy: 'operator', attestedAt: new Date().toISOString() }, budget())
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toBe(0)
  })

  // ADR 0007, amendment of 2026-10-26 (Howard, O6): after the fallback browser the ladder goes on by its ordinary rules.
  const blockedBy = (blockReason: 'captcha' | 'bot_detected_generic' | 'geo_restricted'): FetchResult => ({ ...product(), status: 'blocked', blockReason, markdown: null, evidence: { ...product().evidence, httpStatus: 403 } })

  it.each([
    ['captcha', blockedBy('captcha')],
    ['bot check', blockedBy('bot_detected_generic')],
    ['geo block (T013)', blockedBy('geo_restricted')],
    ['empty page', { ...product(), status: 'failed' as const, failureReason: 'empty_unverified' as const, markdown: null }],
  ])('goes on past the fallback browser to the later rungs: %s', async (_kind, answer) => {
    const compat = channel('http_compat', product())
    const browser = channel('browser_local', answer)
    const installed = channel('installed_chrome', product())
    const run = await new LadderRunner([channel('http', headersTimeout()), compat, browser, installed], { mode: 'standard', enhanced: true }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'installed_chrome'])
    // The rungs between http and the fallback browser stay skipped: another HTTP client is not what a header timeout asks for.
    expect(compat.calls).toBe(0)
    expect(browser.calls).toBe(1)
    expect(run.result.lane).toBe('browser_local')
    expect(run.result.markdown).toContain('€79.95')
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ channel: 'http', event: 'ladder_step', detail: expect.objectContaining({ escalate: 'http_headers_timeout' }) }))
  })

  it('reaches a provider the run allows after the fallback browser and the installed Chrome are blocked', async () => {
    const installed = channel('installed_chrome', blockedBy('bot_detected_generic'))
    const paid = { ...channel('provider', product()), vendorId: 'steel', priceCeilingUsd: 1 }
    const run = await new LadderRunner([channel('http', headersTimeout()), channel('browser_local', blockedBy('geo_restricted')), installed, paid], { mode: 'standard', enhanced: true }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'installed_chrome', 'provider'])
    expect(paid.calls).toBe(1)
    expect(run.result.markdown).toContain('€79.95')
  })

  it.each([
    ['timeout', { ...headersTimeout(), lane: 'browser_local' as const }],
    ['rate limit', { ...blockedBy('captcha'), blockReason: 'rate_limit' as const }],
  ])('still ends at the fallback browser on %s, as at any rung', async (_kind, answer) => {
    const installed = channel('installed_chrome', product())
    const paid = { ...channel('provider', product()), vendorId: 'steel', priceCeilingUsd: 1 }
    const run = await new LadderRunner([channel('http', headersTimeout()), channel('browser_local', answer), installed, paid], { mode: 'standard', enhanced: true }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(installed.calls + paid.calls).toBe(0)
  })

  it('goes on past the fallback browser when its page fails the task contract', async () => {
    const installed = channel('installed_chrome', { ...product(), lane: 'installed_chrome', markdown: '# Shoes\n\nTrail Runner — €79.95\n\nIn stock' })
    const run = await new LadderRunner([channel('http', headersTimeout()), channel('browser_local', product()), installed], { mode: 'standard', enhanced: true }, null, null, null,
      { verify: { checks: [{ type: 'markdownIncludes', text: 'In stock' }] } }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'installed_chrome'])
    expect(run.result.markdown).toContain('In stock')
  })

  it('tells the first http rung when a header timeout there can go on to the local browser, and only then', async () => {
    const optionsSeen = async (rest: Channel[], mode: 'standard' | 'authed' = 'standard', session: Parameters<LadderRunner['run']>[1] = null) => {
      let seen: unknown
      const http: Channel = { id: 'http', identity, async fetch(_url, _session, _execution, options) { seen = options; return { ...product(), lane: 'http' } } }
      await new LadderRunner([http, ...rest], { mode }).run(url, session, budget())
      return (seen as { headersTimeoutFallback?: boolean } | undefined)?.headersTimeoutFallback
    }
    expect(await optionsSeen([channel('browser_local', product())])).toBe(true)
    expect(await optionsSeen([channel('http_compat', product()), channel('browser_local', product())])).toBe(true)
    // fastMode leaves the http rungs alone; a compat-first host's ladder ends there too: nothing takes the timeout over.
    expect(await optionsSeen([])).toBeUndefined()
    expect(await optionsSeen([channel('http_compat', product())])).toBeUndefined()
    expect(await optionsSeen([Object.assign(channel('browser_local', product()), { identity: undefined })])).toBeUndefined()
    expect(await optionsSeen([channel('browser_local', product())], 'authed', { domain: 'www.zalando.de', vendor: 'browser_local_authed', attestedBy: 'operator', attestedAt: new Date().toISOString() })).toBeUndefined()
  })

  it('takes the fallback a held header cap promised, though connect and robots time left it under 30 s (44 s timeout)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const deadlineAt = Date.now() + 44_000
    // About 3 s of robots and connect, the held 10 s cap and its timer's lateness: 29 s of the deadline left.
    const http: Channel = { id: 'http', identity, async fetch(_url, _session, _execution, options) {
      expect((options as { headersTimeoutFallback?: boolean }).headersTimeoutFallback).toBe(true)
      vi.setSystemTime(Date.now() + 15_000)
      return headersTimeout()
    } }
    let seen: { deadlineAt?: number } | undefined
    const browser: Channel = { id: 'browser_local', identity, async fetch(_url, _session, execution) { seen = execution; return product() } }
    const run = await new LadderRunner([http, browser], { mode: 'standard' }).run(url, null, { deadlineAt }, { timeout: 44_000 })
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result.markdown).toContain('€79.95')
    // The browser has what is left of the deadline, not 30 s past it.
    expect(seen?.deadlineAt).toBe(deadlineAt)
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_headers_timeout_fallback', detail: expect.objectContaining({ promised: true, remainingMs: 29_000 }) }))
  })

  it('says the caller\'s deadline, not the fallback\'s own 30 s, ended a promised fallback that had less left', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const deadlineAt = Date.now() + 44_000
    const http: Channel = { id: 'http', identity, async fetch() { vi.setSystemTime(Date.now() + 15_000); return headersTimeout() } }
    // The browser stops reading just before the deadline it was given, the caller's here, and says so.
    const partial = { ...product(), status: 'partial' as const, usage: { ...product().usage, deadlineExceeded: true } }
    const run = await new LadderRunner([http, channel('browser_local', partial)], { mode: 'standard' }).run(url, null, { deadlineAt }, { timeout: 44_000 })
    expect(run.result.usage.deadlineExceeded).toBe(true)
    expect(run.result.trace).not.toContainEqual(expect.objectContaining({ event: 'local_fallback_deadline' }))
  })

  it('answers with the fallback browser\'s page when it does the task, and asks no later rung', async () => {
    const installed = channel('installed_chrome', product())
    const run = await new LadderRunner([channel('http', headersTimeout()), channel('browser_local', product()), installed], { mode: 'standard', enhanced: true }, null, null, null,
      { verify: { checks: [{ type: 'markdownIncludes', text: '€79.95' }] } }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(installed.calls).toBe(0)
    expect(run.result.markdown).toContain('€79.95')
  })

  it('caps a hanging local call with its own signal while the run still has time', async () => {
    vi.useFakeTimers()
    const parentDeadline = Date.now() + 300_000
    let seen: { signal?: AbortSignal; deadlineAt?: number } | undefined
    let started!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const browser: Channel = { id: 'browser_local', identity, fetch: async (_url, _session, execution) => {
      seen = execution; started(); return new Promise(() => {})
    } }
    // A later rung is there, but the fallback running out its own 30 s ends the run, as a timeout ends any rung.
    const installed = channel('installed_chrome', product())
    const pending = new LadderRunner([channel('http', headersTimeout()), browser, installed], { mode: 'standard', enhanced: true }).run(url, null, { deadlineAt: parentDeadline })
    await didStart
    expect(seen?.deadlineAt).toBe(Date.now() + 30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    const run = await pending
    expect(seen?.signal?.aborted).toBe(true)
    expect(run.result.failureReason).toBe('timeout')
    expect(run.result.usage.deadlineExceeded).not.toBe(true)
    expect(run.summary.attempts).toHaveLength(2)
    expect(installed.calls).toBe(0)
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'local_fallback_deadline' }))
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_headers_timeout_fallback_expired' }))
  })

  it('propagates caller cancellation during fallback', async () => {
    const controller = new AbortController()
    let started!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const browser: Channel = { id: 'browser_local', identity, fetch: async () => { started(); return new Promise(() => {}) } }
    const pending = new LadderRunner([channel('http', headersTimeout()), browser], { mode: 'standard' }).run(url, null, { ...budget(), signal: controller.signal })
    const rejected = expect(pending).rejects.toThrow('caller cancelled')
    await didStart
    controller.abort(new Error('caller cancelled'))
    await rejected
  })
})


describe('fallback deadline and context accounting', () => {
  it('retains a local deadline on the attempt without reporting the whole run exhausted', async () => {
    const answer = { ...product(), status: 'partial' as const, usage: { ...product().usage, deadlineExceeded: true } }
    const run = await new LadderRunner([channel('http', headersTimeout()), channel('browser_local', answer)], { mode: 'standard' }).run(url, null, budget())
    expect(run.result.status).toBe('partial')
    expect(run.result.markdown).toContain('€79.95')
    expect(run.result.usage.deadlineExceeded).toBeUndefined()
    expect(readinessOf(run.result)).toMatchObject({ state: 'not_loaded', basis: ['deadline_exceeded'] })
    expect(run.summary.attempts[1]?.result).toEqual(answer)
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_step', channel: 'browser_local', detail: expect.objectContaining({ localDeadlineExceeded: true, escalate: null }) }))
  })

  it('still reports an actual caller deadline reached during fallback', async () => {
    vi.useFakeTimers()
    let started!: () => void
    const didStart = new Promise<void>(resolve => { started = resolve })
    const browser: Channel = { id: 'browser_local', identity, fetch: async () => { started(); return new Promise(() => {}) } }
    const pending = new LadderRunner([channel('http', headersTimeout()), browser], { mode: 'standard' }).run(url, null, { deadlineAt: Date.now() + 30_000 })
    await didStart
    await vi.advanceTimersByTimeAsync(30_000)
    const run = await pending
    expect(run.result.failureReason).toBe('timeout')
    expect(run.result.usage.deadlineExceeded).toBe(true)
  })

  it('does not repeat a browser already attempted before HTTP', async () => {
    const browser = channel('browser_local', { ...headersTimeout(), lane: 'browser_local', failureReason: 'empty_unverified' })
    const run = await new LadderRunner([browser, channel('http', headersTimeout()), channel('browser_local', product())], { mode: 'standard' }).run(url, null, budget())
    expect(run.channelsTried).toEqual(['browser_local', 'http'])
    expect(browser.calls).toBe(1)
  })

  it('passes the existing task context through the local scope', async () => {
    const cookieSession = { id: 'same-task', cookieHeader: async () => '', store: async () => 0, browserCookies: async () => [], storeBrowserChanges: async () => ({ kept: 0, removed: 0 }) }
    const onRobotsOverride = () => {}
    const onRetryAfter = () => {}
    let seen: unknown
    const browser: Channel = { id: 'browser_local', identity, fetch: async (_url, _session, execution) => { seen = execution; return product() } }
    await new LadderRunner([channel('http', headersTimeout()), browser], { mode: 'standard' }).run(url, null, { ...budget(), cookieSession, onRobotsOverride, onRetryAfter })
    expect(seen).toMatchObject({ cookieSession, onRetryAfter })
    expect((seen as { cookieSession: unknown }).cookieSession).toBe(cookieSession)
  })
})


it('ignores an unrelated local-deadline trace', () => {
  const result = { ...product(), status: 'partial' as const, trace: [{ at: 0, lane: 'browser_local' as const, event: 'local_fallback_deadline', detail: { trigger: 'unrelated' } }] }
  expect(readinessOf(result)).toMatchObject({ state: 'ready', basis: [] })
})
