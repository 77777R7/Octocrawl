import { describe, expect, it } from 'vitest'
import {
  CONTENTFUL_STATUS,
  identityBundleFrom,
  modeIdentity,
  QUALITY_ESCALATION_MAX_CONFIDENCE,
  RENDERED_LOW_YIELD_MAX_TOKENS,
  type FetchResult,
  type HandoffRequest,
  type IdentityBundle,
  type RobotsOverrideApplied,
} from '@w2l/contracts'
import { LadderRunner, sessionRejection, type Channel, type HumanHandoff } from '../src/routing/ladder.js'
import { MemoryRoutingHistory } from '../src/routing/vendorRouter.js'
import { loadSessionForHost, MemorySessionStore, sessionCoversHost, type SessionSnapshot } from '../src/routing/sessionStore.js'

const COHERENT = identityBundleFrom(modeIdentity('standard'))

function blockedResult(url: string, blockReason: FetchResult['blockReason']): FetchResult {
  return {
    requestedUrl: url,
    status: 'blocked',
    failureReason: null,
    blockReason,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    handoff: null,
    markdown: null,
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: 403, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 10, bytesWire: 0, bytesDecompressed: 0, requestCount: 1, attemptCount: 1, contentTokens: null, browserMs: 0, externalCostUsd: null },
    trace: [],
  }
}

function contentfulResult(url: string, lane: FetchResult['lane'], wallMs = 50): FetchResult {
  return {
    requestedUrl: url,
    status: 'success',
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    lane,
    escalations: [],
    handoff: null,
    markdown: 'MAIN CONTENT',
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 12, browserMs: 0, externalCostUsd: null },
    trace: [],
  }
}

function failedResult(url: string, failureReason: FetchResult['failureReason']): FetchResult {
  return {
    ...blockedResult(url, null),
    status: 'failed',
    failureReason,
  }
}

function providerErrorResult(url: string, vendorId: string): FetchResult {
  return {
    ...failedResult(url, 'provider_error'),
    lane: 'provider',
    trace: [{ at: 0, lane: 'provider', event: 'provider_failed', detail: { vendor: vendorId } }],
  }
}

function channel(
  id: string,
  responses: readonly FetchResult[],
  vendorId?: string,
  identity: IdentityBundle | undefined = COHERENT,
): Channel & { calls: string[] } {
  const calls: string[] = []
  return {
    id,
    vendorId,
    identity,
    calls,
    async fetch(url: string): Promise<FetchResult> {
      calls.push(url)
      const r = responses.shift()
      if (r === undefined) throw new Error(`channel ${id} exhausted`)
      return r
    },
  }
}

const ALLOWED_ALL: Parameters<typeof LadderRunner.prototype.run>['1'] = { mode: 'authed', allowlistedDomains: ['example.com', '*.example.net'] }

describe('LadderRunner', () => {
  it('stops at http when http is contentful — no escalation is cheaper', async () => {
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    expect(run.result.lane).toBe('http')
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toEqual([])
  })

  it('escalates bot_gate from http to the next channel', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('records two-level end-to-end time separately from summed attempt wallMs', async () => {
    const http: Channel = { id: 'http', identity: COHERENT, fetch: async url => { await new Promise(resolve => setTimeout(resolve, 25)); return { ...blockedResult(url, 'cloudflare_challenge'), usage: { ...blockedResult(url, 'cloudflare_challenge').usage, wallMs: 100 } } } }
    const browser: Channel = { id: 'browser_local', identity: COHERENT, fetch: async url => { await new Promise(resolve => setTimeout(resolve, 25)); return { ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, wallMs: 100 } } } }
    const run = await new LadderRunner([http, browser], { mode: 'authed' }).run('https://example.com/p')
    expect(run.summary.wallMs).toBe(200)
    expect(run.summary.totalMs).toBeGreaterThanOrEqual(45)
    expect(run.summary.totalMs).toBeLessThan(run.summary.wallMs)
  })

  it('does NOT escalate rate_limited — slowing down is the fix, not a stronger lane', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'rate_limit')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.blockReason).toBe('rate_limit')
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toEqual([])
  })

  it('governance refuses a URL outside the allowlist before any channel runs', async () => {
    const http = channel('http', [contentfulResult('https://evil.test/p', 'http')])
    const runner = new LadderRunner([http], ALLOWED_ALL)

    const run = await runner.run('https://evil.test/p')
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('policy_denied')
    expect(run.channelsTried).toEqual([])
    expect(http.calls).toEqual([])
  })

  it('governance admits wildcarded hosts', async () => {
    const http = channel('http', [contentfulResult('https://shop.example.net/p', 'http')])
    const runner = new LadderRunner([http], ALLOWED_ALL)
    const run = await runner.run('https://shop.example.net/p')
    expect(run.result.status).toBe('success')
  })

  it('mode gates channels: standard mode never reaches a provider', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const vendor = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, vendor], { mode: 'standard' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('blocked')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(vendor.calls).toEqual([])
  })
})

describe('LadderRunner — multi-vendor routing', () => {
  it('tries vendors in declaration order with no history', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, bb, steel], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    expect(bb.calls).toHaveLength(1)
    expect(steel.calls).toHaveLength(0)
  })

  it('fails over to the second vendor on provider_error', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [providerErrorResult('https://example.com/p', 'browserbase')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, bb, steel], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    expect(bb.calls).toHaveLength(1)
    expect(steel.calls).toHaveLength(1)
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'provider', 'provider'])
  })

  it('history ranking promotes a vendor with better domain success', async () => {
    const history = new MemoryRoutingHistory()
    // Steel has 5/5 contentful on this domain, Browserbase 0/3.
    for (let i = 0; i < 5; i++) {
      await history.record('example.com', 'steel', { contentful: true, wallMs: 800, costUsd: 0.01, failureClass: null })
    }
    for (let i = 0; i < 3; i++) {
      await history.record('example.com', 'browserbase', { contentful: false, wallMs: 900, costUsd: 0.01, failureClass: 'provider_error' })
    }

    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, bb, steel], { mode: 'authed' }, history)

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    // Steel went first and won; browserbase never ran.
    expect(steel.calls).toHaveLength(1)
    expect(bb.calls).toHaveLength(0)
  })

  it('records vendor outcomes against domain history', async () => {
    const history = new MemoryRoutingHistory()
    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'browserbase')
    const runner = new LadderRunner([http, browser, bb], { mode: 'authed' }, history)

    await runner.run('https://example.com/p')
    const recorded = await history.read('example.com')
    expect(recorded.vendors.browserbase).toMatchObject({ attempts: 1, contentful: 1 })
  })
})

describe('LadderRunner — human handoff', () => {
  const handoffRequest: HandoffRequest = {
    reason: 'captcha_required',
    liveViewUrl: 'https://live.example/session-1',
    rationale: 'The target demands human verification.',
  }

  it('pauses and returns the handoff request when a channel asks for it', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
    ], 'steel')
    const runner = new LadderRunner([http, browser, vendor], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.handoffRequested).toBe(true)
    expect(run.result.handoff?.liveViewUrl).toBe('https://live.example/session-1')
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'provider'])
  })

  it('invokes the human, saves nothing, and retries the same channel with the snapshot', async () => {
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'test',
      attestedAt: new Date().toISOString(),
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'secret', domain: '.example.com', path: '/' }],
    }
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
      contentfulResult('https://example.com/p', 'provider'),
    ], 'steel')
    const received: { url: string; request: HandoffRequest }[] = []
    const handoff: HumanHandoff = {
      async takeOver(url, request) {
        received.push({ url, request })
        return session
      },
    }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(received).toHaveLength(1)
    expect(received[0]!.request.liveViewUrl).toBe('https://live.example/session-1')
    expect(run.result.status).toBe('success')
    expect(run.channelsTried).toEqual(['provider', 'provider(retry)'])
    // The human acted and the retry succeeded: the run is DONE, not still
    // asking. "Still needs a human" must never follow a completed takeover.
    expect(run.handoffRequested).toBe(false)
  })

  it('a failed retry after the human acts is reported as a failed retry, not as still needing a human', async () => {
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'human',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
    }
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
      blockedResult('https://example.com/p', 'captcha'),
    ], 'steel')
    const handoff: HumanHandoff = { async takeOver() { return session } }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider(retry)'])
    expect(run.result.status).toBe('blocked')
    expect(run.handoffRequested).toBe(false)
    expect(run.ladderTrace.some((t) => t.event === 'ladder_handoff_retry_failed')).toBe(true)
  })

  it('aborts when the human declines', async () => {
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
      contentfulResult('https://example.com/p', 'provider'),
    ], 'steel')
    const handoff: HumanHandoff = { async takeOver() { return null } }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('blocked')
    expect(run.channelsTried).toEqual(['provider'])
  })

  it('with no human configured, reports the pause point instead of looping', async () => {
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
    ], 'steel')
    const runner = new LadderRunner([vendor], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.handoffRequested).toBe(true)
    expect(run.channelsTried).toEqual(['provider'])
  })
})

describe('LadderRunner — consuming FetchResult.escalations', () => {
  function thinHttpSuccess(url: string): FetchResult {
    const r = contentfulResult(url, 'http')
    return {
      ...r,
      usage: { ...r.usage, contentTokens: 60 },
      trace: [
        ...r.trace,
        { at: 10, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 60, confidence: 0.2 } },
      ],
    }
  }

  function emptyUnverified(url: string): FetchResult {
    return {
      ...failedResult(url, 'empty_unverified'),
      escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }],
    }
  }

  it('honours an empty_unverified subject escalation and tries the next rung', async () => {
    const http = channel('http', [emptyUnverified('https://example.com/p')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('escalates a thin, low-confidence http success to the browser (quality signal)', async () => {
    const http = channel('http', [thinHttpSuccess('https://example.com/p')])
    // The browser genuinely improves on the thin http answer.
    const browser = channel('browser_local', [
      {
        ...contentfulResult('https://example.com/p', 'browser_local'),
        usage: { ...contentfulResult('https://example.com/p', 'browser_local').usage, contentTokens: 800 },
      },
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  function clientRenderedHttpSuccess(url: string): FetchResult {
    const r = contentfulResult(url, 'http')
    return {
      ...r,
      warnings: [{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (empty_table_with_scripts); this HTTP capture may be a shell.' }],
      trace: [...r.trace, { at: 10, lane: 'http', event: 'quality_client_rendered', detail: { reason: 'empty_table_with_scripts', markers: [], emptyTables: 1, textChars: 180, scriptChars: 1_500 } }],
    }
  }

  it('offers a client-rendered http success to the browser and keeps whichever answer holds more', async () => {
    const url = 'https://example.com/p'
    const rendered = { ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, contentTokens: 800 } }
    const better = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [rendered])], { mode: 'authed' }).run(url)
    expect(better.channelsTried).toEqual(['http', 'browser_local'])
    expect(better.result).toMatchObject({ status: 'success', lane: 'browser_local' })
    expect(better.result.warnings).toBeUndefined()
    expect(better.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'quality_client_rendered', improved: true }])
    expect(better.ladderTrace[0]).toMatchObject({ event: 'ladder_step', channel: 'http', detail: { status: 'success', escalate: 'quality_client_rendered' } })

    // The browser found less: the http page stays the answer, warning and all, and the hop did not pay off.
    const thinner = { ...contentfulResult(url, 'browser_local'), markdown: 'LESS', usage: { ...contentfulResult(url, 'browser_local').usage, contentTokens: 3 } }
    const kept = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [thinner])], { mode: 'authed' }).run(url)
    // The kept page says that the browser lane did not improve on it, after its own caveat; the count and confidence are the http lane's extract figures.
    expect(kept.result).toMatchObject({ status: 'success', lane: 'http', markdown: 'MAIN CONTENT', warnings: [{ code: 'client_rendered_suspected' }, { code: 'low_content_yield', message: 'The http lane extracted 12 tokens; the browser lane did not improve it.' }] })
    expect(kept.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'quality_client_rendered', improved: false }])
    expect(kept.ladderTrace.at(-1)).toMatchObject({ event: 'ladder_best_kept', channel: 'http' })
  })

  it('accepts the browser result even when it is also thin — one quality pass, not a loop', async () => {
    const http = channel('http', [thinHttpSuccess('https://example.com/p')])
    const browser = channel('browser_local', [thinHttpSuccess('https://example.com/p')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('http') // the browser's thin success IS the answer
    expect(run.result.trace.some((t) => t.event === 'quality_low_yield')).toBe(true)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('audits every step with channel, vendor and escalation reason', async () => {
    const http = channel('http', [emptyUnverified('https://example.com/p')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    const steps = run.ladderTrace.filter((t) => t.event === 'ladder_step')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({
      channel: 'http',
      detail: { status: 'failed', escalate: 'subject_escalations' },
    })
    expect(steps[1]).toMatchObject({ channel: 'browser_local', detail: { escalate: null } })
  })
})

describe('LadderRunner — session store wiring', () => {
  it('loads a saved session for the domain when the caller passes none', async () => {
    const snapshot: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 't',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'v', domain: '.example.com', path: '/' }],
    }
    const store = new MemorySessionStore()
    await store.save(snapshot)

    const received: (SessionSnapshot | null | undefined)[] = []
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')])
    const orig = http.fetch
    http.fetch = async (url, session) => {
      received.push(session)
      return orig(url, session)
    }

    const runner = new LadderRunner([http], { mode: 'authed' }, null, null, store)
    await runner.run('https://example.com/p')

    expect(received).toHaveLength(1)
    expect(received[0]?.domain).toBe('example.com')
    expect(received[0]?.cookies?.[0]?.name).toBe('sid')
  })

  it('saves the handoff snapshot so the next run resumes', async () => {
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'human',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
      resume: { steelProfileId: 'prof-1' },
    }
    const store = new MemorySessionStore()
    const request: HandoffRequest = {
      reason: 'captcha_required',
      liveViewUrl: 'https://live.example/session-1',
      rationale: 'The target demands human verification.',
    }
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: request },
      contentfulResult('https://example.com/p', 'provider'),
    ], 'steel')
    const handoff: HumanHandoff = { async takeOver() { return session } }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff, store)

    await runner.run('https://example.com/p')
    const saved = await store.load('example.com')
    expect(saved?.vendor).toBe('steel')
    expect(saved?.resume).toEqual({ steelProfileId: 'prof-1' })
  })
})

describe('LadderRunner — best-so-far content', () => {
  function thinHttp(url: string): FetchResult {
    return {
      ...contentfulResult(url, 'http'),
      usage: { ...contentfulResult(url, 'http').usage, contentTokens: 20 },
      trace: [
        { at: 0, lane: 'http', event: 'extract', detail: {} },
        { at: 5, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 20, confidence: 0.1 } },
      ],
    }
  }

  it('HTTP success then browser timeout returns the HTTP content, not the failure', async () => {
    const http = channel('http', [thinHttp('https://example.com/p')])
    const browser = channel('browser_local', [
      failedResult('https://example.com/p', 'timeout'),
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result.lane).toBe('http')
    expect(run.result.status).toBe('success')
    expect(run.result.markdown).toBe('MAIN CONTENT')
  })

  it('browser content that is WORSE than the thin http result is discarded in favour of the http result', async () => {
    const http = channel('http', [thinHttp('https://example.com/p')])
    // The browser answered, but with less content than the http result that
    // triggered the escalation in the first place.
    const browser = channel('browser_local', [
      {
        ...contentfulResult('https://example.com/p', 'browser_local'),
        usage: { ...contentfulResult('https://example.com/p', 'browser_local').usage, contentTokens: 8 },
      },
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('http')
    expect(run.result.usage.contentTokens).toBe(20)
    // The quality hop did not improve things — the record says so, in the escalations and in a warning the reader sees without the trace.
    expect(run.result.escalations).toContainEqual(
      expect.objectContaining({ from: 'http', to: 'browser_local', improved: false }),
    )
    expect(run.result.warnings).toEqual([{ code: 'low_content_yield', message: 'The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.' }])
  })

  it('a thin http result with no further rung to offer it to says the browser lane was not available', async () => {
    const run = await new LadderRunner([channel('http', [thinHttp('https://example.com/p')])], { mode: 'authed' }).run('https://example.com/p')
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result).toMatchObject({ status: 'success', lane: 'http', markdown: 'MAIN CONTENT', escalations: [] })
    expect(run.result.warnings).toEqual([{ code: 'low_content_yield', message: 'The http lane extracted 20 tokens at confidence 0.1; the browser lane was not available to this request.' }])
    // A plain http success carries no such warning: the http lane raised no quality event on it.
    const plain = await new LadderRunner([channel('http', [contentfulResult('https://example.com/p', 'http')])], { mode: 'authed' }).run('https://example.com/p')
    expect(plain.result.warnings).toBeUndefined()
  })

  it('better browser content replaces the http result and the escalation is marked improved', async () => {
    const http = channel('http', [thinHttp('https://example.com/p')])
    const browser = channel('browser_local', [
      {
        ...contentfulResult('https://example.com/p', 'browser_local'),
        usage: { ...contentfulResult('https://example.com/p', 'browser_local').usage, contentTokens: 800 },
      },
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.result.usage.contentTokens).toBe(800)
    expect(run.result.escalations.some((e) => e.improved === true)).toBe(true)
    // The rendered page is the answer: nothing was kept thin, so no low_content_yield.
    expect(run.result.warnings).toBeUndefined()
  })
})

describe('LadderRunner — a thin rendered answer', () => {
  const url = 'https://example.com/p'
  /** The browser lane's answer, with its own extraction's confidence and the main content's tokens. */
  function rendered(contentTokens: number, confidence: number): FetchResult {
    const base = contentfulResult(url, 'browser_local')
    return { ...base, usage: { ...base.usage, contentTokens }, trace: [{ at: 1, lane: 'browser_local', event: 'extract', detail: { pageType: 'listing', strategy: 'list', confidence } }] }
  }
  const run = (result: FetchResult) => new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), channel('browser_local', [result])], { mode: 'authed' }).run(url)

  it('carries low_content_yield when its own extraction found it thin and unsure, and stays success', async () => {
    const thin = await run(rendered(RENDERED_LOW_YIELD_MAX_TOKENS, 0))
    expect(thin.result).toMatchObject({ status: 'success', lane: 'browser_local' })
    expect(thin.result.warnings).toEqual([{ code: 'low_content_yield', message: `The browser_local lane extracted ${RENDERED_LOW_YIELD_MAX_TOKENS} tokens at confidence 0; no lane after it was left to try.` }])
  })

  it('carries none when it holds more, or its extraction is sure of it', async () => {
    expect((await run(rendered(RENDERED_LOW_YIELD_MAX_TOKENS + 1, 0))).result.warnings).toBeUndefined()
    expect((await run(rendered(20, QUALITY_ESCALATION_MAX_CONFIDENCE + 0.1))).result.warnings).toBeUndefined()
  })
})

describe('LadderRunner — a page with no main content', () => {
  const url = 'https://example.com/p'
  const PAGE = '[Home](https://example.com/)\n\n- [Docs](https://example.com/docs)'
  /** HTTP found no main content: failed, the whole page kept as evidence, the browser asked for. */
  function noMainContent(): FetchResult {
    return {
      ...failedResult(url, 'empty_unverified'),
      evidence: { ...failedResult(url, 'empty_unverified').evidence, httpStatus: 200 },
      markdown: PAGE,
      escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }],
    }
  }
  const browserFailure = (reason: FetchResult['failureReason']): FetchResult => ({ ...failedResult(url, reason), lane: 'browser_local' })

  it('keeps the HTTP page as evidence when the browser rung fails without a page', async () => {
    const run = await new LadderRunner([channel('http', [noMainContent()]), channel('browser_local', [browserFailure('connection_error')])], { mode: 'standard' }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', markdown: PAGE })
    expect(run.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: false }])
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_evidence_kept', channel: 'http', detail: { kept: 'http', failed: 'browser_local', reason: 'connection_error' } }))
    expect(run.summary.attempts.map((attempt) => attempt.result.failureReason)).toEqual(['empty_unverified', 'connection_error'])
  })

  it('keeps a client-rendered shell\'s caveat on the evidence it keeps, and the rung\'s own ask names the hop once', async () => {
    // The HTTP rung found no main region on a shell: its failed result carries the warning and the event beside its ask.
    const shell: FetchResult = {
      ...noMainContent(),
      warnings: [{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (script_shell); this HTTP capture may be a shell.' }],
      trace: [{ at: 10, lane: 'http', event: 'quality_client_rendered', detail: { reason: 'script_shell', markers: [], emptyTables: 0, textChars: 14, scriptChars: 2_258 } }],
    }
    const kept = await new LadderRunner([channel('http', [shell]), channel('browser_local', [browserFailure('connection_error')])], { mode: 'standard' }).run(url)
    // The evidence kept says that the browser lane did not improve on it; a shell with no main content gives no token count.
    expect(kept.result).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', markdown: PAGE, warnings: [{ code: 'client_rendered_suspected' }, { code: 'low_content_yield', message: 'The http lane found no main content; the browser lane did not improve it.' }] })
    expect(kept.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: false }])
    expect(kept.ladderTrace.filter((t) => t.event === 'ladder_step')[0]).toMatchObject({ channel: 'http', detail: { status: 'failed', escalate: 'subject_escalations' } })
    // The rendered page replaces it without the caveat, and no second hop is stamped on it.
    const rendered = await new LadderRunner([channel('http', [shell]), channel('browser_local', [contentfulResult(url, 'browser_local')])], { mode: 'standard' }).run(url)
    expect(rendered.result).toMatchObject({ status: 'success', lane: 'browser_local', markdown: 'MAIN CONTENT', escalations: [] })
    expect(rendered.result.warnings).toBeUndefined()
  })

  it('answers with the browser rung\'s own page or block instead', async () => {
    const rendered: FetchResult = { ...noMainContent(), lane: 'browser_local', escalations: [], markdown: 'Rendered whole page' }
    const renderedRun = await new LadderRunner([channel('http', [noMainContent()]), channel('browser_local', [rendered])], { mode: 'standard' }).run(url)
    expect(renderedRun.result).toMatchObject({ lane: 'browser_local', markdown: 'Rendered whole page' })
    const blocked = { ...blockedResult(url, 'captcha'), lane: 'browser_local' as const }
    const blockedRun = await new LadderRunner([channel('http', [noMainContent()]), channel('browser_local', [blocked])], { mode: 'standard' }).run(url)
    expect(blockedRun.result).toMatchObject({ status: 'blocked', lane: 'browser_local' })
  })

  it('keeps the HTTP page as evidence on the timeout when the deadline ends the browser rung', async () => {
    const hanging: Channel = {
      id: 'browser_local',
      identity: COHERENT,
      fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
    }
    const run = await new LadderRunner([channel('http', [noMainContent()]), hanging], { mode: 'standard' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', lane: 'http', markdown: PAGE, usage: { deadlineExceeded: true } })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'deadline_exceeded', detail: { channel: 'browser_local', kept: null, evidence: 'http' } }))
  })
})

describe('LadderRunner — an answer without content', () => {
  const url = 'https://example.com/p'
  /** `includeTags` named nothing: success with empty Markdown, which the HTTP rung offers to the browser when the page itself reads as thin. */
  function emptyAnswer(lane: FetchResult['lane']): FetchResult {
    const result = contentfulResult(url, lane)
    return {
      ...result,
      markdown: '',
      usage: { ...result.usage, contentTokens: 0 },
      trace: lane === 'http' ? [{ at: 5, lane, event: 'quality_low_yield', detail: { contentTokens: 0, confidence: 0 } }] : [],
    }
  }
  const vendors = () => [channel('provider', [emptyAnswer('provider')], 'browserbase'), channel('provider', [emptyAnswer('provider')], 'steel')] as const

  it('gives way to a later rung that finds the page blocked', async () => {
    for (const reason of ['login_wall', 'cloudflare_challenge'] as const) {
      const blocked = { ...blockedResult(url, reason), lane: 'browser_local' as const }
      const run = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [blocked])], { mode: 'standard' }).run(url)
      expect(run.result).toMatchObject({ status: 'blocked', blockReason: reason, lane: 'browser_local', markdown: null })
      expect(run.ladderTrace.map((event) => [event.event, event.channel])).toEqual([['ladder_step', 'http'], ['ladder_empty_answer_dropped', 'http'], ['ladder_step', 'browser_local']])
      expect(run.ladderTrace[1]!.detail).toEqual({ dropped: 'http', blockedAt: 'browser_local', blockReason: reason })
    }
    // A vendor rung that then reads the page answers, as after any block; content the HTTP rung did produce stays the answer.
    const blocked = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const [browserbase, steel] = vendors()
    const viaVendor = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [blocked]), browserbase, steel], { mode: 'authed' }).run(url)
    expect(viaVendor.result).toMatchObject({ status: 'success', lane: 'provider', markdown: '' })
    expect(viaVendor.channelsTried).toEqual(['http', 'browser_local', 'provider'])
    const thin: FetchResult = { ...emptyAnswer('http'), markdown: 'MAIN CONTENT', usage: { ...emptyAnswer('http').usage, contentTokens: 12 } }
    const kept = await new LadderRunner([channel('http', [thin]), channel('browser_local', [blocked])], { mode: 'standard' }).run(url)
    expect(kept.result).toMatchObject({ status: 'success', lane: 'http', markdown: 'MAIN CONTENT' })
  })

  it('is confirmed by the next rung that repeats it, and no vendor rung is asked', async () => {
    const [browserbase, steel] = vendors()
    const run = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [emptyAnswer('browser_local')]), browserbase, steel], { mode: 'authed' }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'success', lane: 'http', markdown: '' })
    expect(run.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'quality_low_yield', improved: false }])
    expect(run.ladderTrace[1]).toMatchObject({ event: 'ladder_step', channel: 'browser_local', detail: { status: 'success', escalate: null, confirmsEmpty: 'http' } })
    expect([...browserbase.calls, ...steel.calls]).toEqual([])
  })

  it('stays the answer when the next rung fails without a page, and is not the partial answer of a run that met a block', async () => {
    const unreachable = { ...failedResult(url, 'connection_error'), lane: 'browser_local' as const }
    const run = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [unreachable])], { mode: 'standard' }).run(url)
    expect(run.result).toMatchObject({ status: 'success', lane: 'http', markdown: '' })
    // The deadline ends a vendor rung after the browser rung found the page blocked.
    const hanging: Channel = {
      id: 'provider',
      vendorId: 'steel',
      identity: COHERENT,
      fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
    }
    const blocked = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const cut = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [blocked]), hanging], { mode: 'authed' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(cut.result).toMatchObject({ status: 'failed', failureReason: 'timeout', markdown: null, usage: { deadlineExceeded: true } })
  })
})

describe('LadderRunner — identity on contentful results', () => {
  function mismatchedContentful(url: string): FetchResult {
    return {
      ...contentfulResult(url, 'provider'),
      trace: [
        {
          at: 1,
          lane: 'provider',
          event: 'identity_mismatch',
          detail: { declared: 'A', sent: 'B' },
        },
      ],
    }
  }

  it('an identity_mismatch on a contentful 200 is NOT the answer — the next channel runs', async () => {
    const bb = channel('provider', [mismatchedContentful('https://example.com/p')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([bb, steel], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider'])
    expect(run.result.status).toBe('success')
    expect(run.result.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    expect(run.ladderTrace.some((t) => t.detail.escalate === 'identity_rejected')).toBe(true)
  })

  it('identity_unobserved on a contentful 200 is also rejected — unobserved is not agreement', async () => {
    const bb = channel('provider', [
      {
        ...contentfulResult('https://example.com/p', 'provider'),
        trace: [{ at: 1, lane: 'provider', event: 'identity_unobserved', detail: { declared: 'A' } }],
      },
    ], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([bb, steel], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider'])
    expect(run.result.status).toBe('success')
    expect(run.result.trace.some((t) => t.event === 'identity_unobserved')).toBe(false)
  })

  it('ONLY vendor + mismatch = a clear non-contentful failure, never a success', async () => {
    // The page came with its html formats: they go with the Markdown.
    const bb = channel('provider', [{ ...mismatchedContentful('https://example.com/p'), html: '<main>MAIN CONTENT</main>', rawHtml: '<html><body><main>MAIN CONTENT</main></body></html>' }], 'browserbase')
    const runner = new LadderRunner([bb], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(run.result.markdown).toBeNull()
    expect(run.result).not.toHaveProperty('html')
    expect(run.result).not.toHaveProperty('rawHtml')
    expect(CONTENTFUL_STATUS.has(run.result.status)).toBe(false)
  })

  it('LAST vendor + unobserved = a clear non-contentful failure too', async () => {
    const bb = channel('provider', [blockedResult('https://example.com/p', 'bot_detected_generic')], 'browserbase')
    const steel = channel('provider', [
      {
        ...contentfulResult('https://example.com/p', 'provider'),
        trace: [{ at: 1, lane: 'provider', event: 'identity_unobserved', detail: { declared: 'A' } }],
      },
    ], 'steel')
    const runner = new LadderRunner([bb, steel], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(CONTENTFUL_STATUS.has(run.result.status)).toBe(false)
  })

  it('a handoff retry with an identity anomaly cannot slip through as success', async () => {
    const request: HandoffRequest = {
      reason: 'captcha_required',
      liveViewUrl: 'https://live.example/session-1',
      rationale: 'The target demands human verification.',
    }
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'human',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browserbase',
    }
    const bb = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: request },
      mismatchedContentful('https://example.com/p'),
    ], 'browserbase')
    const handoff: HumanHandoff = { async takeOver() { return session } }
    const runner = new LadderRunner([bb], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider(retry)'])
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(CONTENTFUL_STATUS.has(run.result.status)).toBe(false)
    expect(run.handoffRequested).toBe(false)
  })

  it('history records contentful=0 with failureClass=identity_mismatch for a mismatched fetch', async () => {
    const history = new MemoryRoutingHistory()
    const bb = channel('provider', [mismatchedContentful('https://example.com/p')], 'browserbase')
    const runner = new LadderRunner([bb], { mode: 'research' }, history)

    await runner.run('https://example.com/p')
    const domain = await history.read('example.com')
    expect(domain.vendors.browserbase).toMatchObject({
      attempts: 1,
      contentful: 0,
      lastFailureClass: 'identity_mismatch',
    })
  })
})

describe('LadderRunner — session gating by mode', () => {
  const handoffRequest: HandoffRequest = {
    reason: 'captcha_required',
    liveViewUrl: 'https://live.example/session-1',
    rationale: 'The target demands human verification.',
  }

  it('standard mode never loads a saved session, even when the store has one', async () => {
    const store = new MemorySessionStore()
    await store.save({
      domain: 'example.com',
      attestedBy: 't',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'v', domain: '.example.com', path: '/' }],
    })
    const seen: (SessionSnapshot | null | undefined)[] = []
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')])
    const orig = http.fetch
    http.fetch = async (url, session) => {
      seen.push(session)
      return orig(url, session)
    }
    const runner = new LadderRunner([http], { mode: 'standard' }, null, null, store)

    await runner.run('https://example.com/p')
    expect(seen).toEqual([null])
  })

  it('a handoff request in standard mode is denied, not executed', async () => {
    const http = channel('http', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
    ])
    const calls: string[] = []
    const handoff: HumanHandoff = {
      async takeOver(url) {
        calls.push(url)
        return null
      },
    }
    const runner = new LadderRunner([http], { mode: 'standard' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(calls).toEqual([])
    expect(run.handoffRequested).toBe(false)
    expect(run.ladderTrace.some((t) => t.detail.handoff === 'denied: mode is not authed')).toBe(true)
  })
})

describe('LadderRunner — declared identity is mandatory', () => {
  it('a channel with no identity bundle never reaches fetch', async () => {
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')], undefined, undefined)
    delete (http as { identity?: IdentityBundle }).identity
    const runner = new LadderRunner([http], { mode: 'standard' })

    const run = await runner.run('https://example.com/p')
    expect(http.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(run.result.trace.some((t) => t.event === 'identity_unobserved')).toBe(true)
    expect(run.ladderTrace.some((t) => t.event === 'ladder_identity_refused')).toBe(true)
  })

  it('a contradictory bundle stops the ladder instead of trying another fake identity', async () => {
    const broken: IdentityBundle = {
      ...COHERENT,
      clientHints: { ...COHERENT.clientHints, 'sec-ch-ua-platform': '"Windows"' },
    }
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')], undefined, broken)
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'standard' })

    const run = await runner.run('https://example.com/p')
    expect(http.calls).toEqual([])
    expect(browser.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(run.result.trace.some((t) => t.event === 'identity_mismatch')).toBe(true)
  })
})

describe('LadderRunner — deadline and fetch options', () => {
  const url = 'https://example.com/p'
  function thinHttp(): FetchResult {
    return { ...contentfulResult(url, 'http'), trace: [{ at: 5, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 12, confidence: 0.1 } }] }
  }
  /** A rung that only ends when its execution stops, like a page load that never settles. */
  function hanging(id: string): Channel {
    return {
      id,
      identity: COHERENT,
      fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
    }
  }

  it('a deadline while the browser rung runs returns the HTTP content as partial, not an error', async () => {
    const run = await new LadderRunner([channel('http', [thinHttp()]), hanging('browser_local')], { mode: 'standard' })
      .run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'partial', lane: 'http', markdown: 'MAIN CONTENT', failureReason: null, budgetExceeded: null, usage: { deadlineExceeded: true } })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'deadline_exceeded', detail: { channel: 'browser_local', kept: 'http' } }))
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_deadline_exceeded', channel: 'browser_local' }))
  })

  it('with nothing usable the deadline is failed/timeout, while cancellation still rejects', async () => {
    const runner = new LadderRunner([hanging('http')], { mode: 'standard' })
    const run = await runner.run(url, undefined, { deadlineAt: Date.now() + 100 })
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', budgetExceeded: null, lane: 'http', markdown: null, usage: { deadlineExceeded: true } })
    const controller = new AbortController()
    const cancelled = runner.run(url, undefined, { signal: controller.signal, deadlineAt: Date.now() + 5_000 })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('a rung that reports the deadline itself ends the ladder without trying the next rung', async () => {
    const timedOut = failedResult(url, 'timeout')
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const run = await new LadderRunner([channel('http', [{ ...timedOut, usage: { ...timedOut.usage, deadlineExceeded: true } }]), browser], { mode: 'standard' })
      .run(url, undefined, { deadlineAt: Date.now() + 5_000 })
    expect(browser.calls).toEqual([])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', usage: { deadlineExceeded: true } })
  })

  it('waitFor starts at a rung that can wait and hands it the fetch options', async () => {
    const http = channel('http', [contentfulResult(url, 'http')])
    const seen: unknown[] = []
    const browser: Channel = {
      id: 'browser_local',
      identity: COHERENT,
      waitsFor: true,
      fetch: async (target, _session, _execution, options) => { seen.push(options); return contentfulResult(target, 'browser_local') },
    }
    const run = await new LadderRunner([http, browser], { mode: 'standard' }).run(url, undefined, {}, { waitFor: 1_000, onlyMainContent: false })
    expect(http.calls).toEqual([])
    expect(seen).toEqual([{ waitFor: 1_000, onlyMainContent: false }])
    expect(run.channelsTried).toEqual(['browser_local'])
    expect(run.ladderTrace[0]).toMatchObject({ event: 'ladder_channel_skipped', channel: 'http', detail: { reason: expect.stringContaining('waitFor') } })
  })

  it('waitFor with no rung that can wait is an honest failure, not an HTTP answer that ignored it', async () => {
    const http = channel('http', [contentfulResult(url, 'http')])
    const run = await new LadderRunner([http], { mode: 'standard' }).run(url, undefined, {}, { waitFor: 1_000 })
    expect(http.calls).toEqual([])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'policy_denied', markdown: null })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'wait_for_unavailable' }))
  })
})

describe('LadderRunner — a recorded robots override', () => {
  const url = 'https://example.com/report'
  const robotsOverride = { reason: 'The publisher links this report itself.', recordedBy: 'analyst' }
  const rules = [{ pattern: '/', allow: false }]
  /** What the HTTP lane reports the moment it sets a rule aside (ExecutionContext.onRobotsOverride). */
  function applied(): RobotsOverrideApplied {
    return {
      trace: [
        { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://example.com/robots.txt', robotsSha256: 'a'.repeat(64), crawlDelayMs: null } },
        { at: 1, lane: 'http', event: 'robots_disallowed', detail: { url, appliedRules: rules } },
        { at: 1, lane: 'http', event: 'robots_overridden', detail: { url, appliedRules: rules, ...robotsOverride } },
      ],
      warning: { code: 'robots_overridden', message: 'https://example.com/robots.txt disallows this URL (rule /); it was fetched under an override recorded by analyst: The publisher links this report itself.' },
    }
  }
  /** A rung's own result after it set the rule aside: its trace and warnings say so. */
  const overridden = (result: FetchResult): FetchResult => ({ ...result, trace: [...applied().trace, ...result.trace], warnings: [applied().warning] })
  /** A rung that sets the rule aside, says so, and answers with `result`; with null it only ends when its execution stops. */
  function overriding(id: string, result: FetchResult | null): Channel {
    return {
      id,
      identity: COHERENT,
      fetch: (_url, _session, execution) => {
        execution?.onRobotsOverride?.(applied())
        if (result !== null) return Promise.resolve(result)
        return new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true }))
      },
    }
  }
  const events = (result: FetchResult) => result.trace.map((event) => event.event)

  it('keeps the override on the timeout it builds for a rung the deadline cut before it answered', async () => {
    const heard: RobotsOverrideApplied[] = []
    const run = await new LadderRunner([overriding('http', null)], { mode: 'standard' })
      .run(url, undefined, { deadlineAt: Date.now() + 100, onRobotsOverride: (report) => heard.push(report) }, { robotsOverride })
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', lane: 'http', warnings: [applied().warning], usage: { deadlineExceeded: true } })
    expect(events(run.result)).toEqual(['robots_checked', 'robots_disallowed', 'robots_overridden', 'deadline_exceeded'])
    // The rung returned nothing: what it reported is all the run has, and the run's own caller hears it too.
    expect(run.summary.attempts).toEqual([])
    expect(heard).toEqual([applied()])
  })

  it('keeps it on a later rung\'s answer, once, and leaves the result of the rung that applied it as it is', async () => {
    const skipped: FetchResult = { ...failedResult(url, 'policy_denied'), lane: 'browser_local_authed', trace: [{ at: 0, lane: 'browser_local_authed', event: 'authed_session_skipped', detail: { reason: 'no_local_session' } }] }
    const run = await new LadderRunner([overriding('http', overridden(blockedResult(url, 'cloudflare_challenge'))), channel('authed_session', [skipped])], { mode: 'authed' })
      .run(url, undefined, {}, { robotsOverride })
    expect(run.channelsTried).toEqual(['http', 'authed_session'])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'policy_denied', lane: 'browser_local_authed', warnings: [applied().warning] })
    expect(events(run.result)).toEqual(['robots_checked', 'robots_disallowed', 'robots_overridden', 'authed_session_skipped'])
    expect(run.result.trace.slice(0, 3).every((event) => event.lane === 'http')).toBe(true)

    const own = overridden(contentfulResult(url, 'http'))
    const answered = await new LadderRunner([overriding('http', own)], { mode: 'standard' }).run(url, undefined, {}, { robotsOverride })
    expect(answered.result).toEqual(own)
  })

  it('ends at the local rungs once a rule was set aside: no vendor rung runs, and the answer says why', async () => {
    const provider = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const run = await new LadderRunner([overriding('http', overridden(blockedResult(url, 'cloudflare_challenge'))), provider], { mode: 'research' })
      .run(url, undefined, {}, { robotsOverride })
    expect(provider.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result).toMatchObject({ status: 'blocked', lane: 'http', warnings: [applied().warning] })
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'provider', detail: { vendorId: 'steel', reason: expect.stringContaining('robots override') } }))

    // An override no rung had to apply (robots.txt allowed the URL) changes nothing: the block escalates to the vendor as before.
    const reached = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const escalated = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), reached], { mode: 'research' })
      .run(url, undefined, {}, { robotsOverride })
    expect(escalated.channelsTried).toEqual(['http', 'provider'])
    expect(escalated.result).toMatchObject({ status: 'success', lane: 'provider' })
    expect(escalated.result.warnings).toBeUndefined()
  })
})

describe('LadderRunner — a saved login goes first', () => {
  const saved = (domain: string): SessionSnapshot => ({
    domain,
    attestedBy: 'test',
    attestedAt: '2026-10-03T00:00:00.000Z',
    vendor: 'browser_local_authed',
    cookies: [{ name: 'sid', value: 'secret', domain: `.${domain}`, path: '/' }],
  })

  it('tries the authed rung before the public rungs, which would take a logged-out 200 as the answer', async () => {
    const url = 'https://www.example.com/account'
    const http = channel('http', [contentfulResult(url, 'http')])
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const authed = channel('authed_session', [contentfulResult(url, 'browser_local_authed')])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, browser, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.channelsTried).toEqual(['authed_session'])
    expect(run.result.lane).toBe('browser_local_authed')
    expect(run.ladderTrace.some((t) => t.event === 'ladder_session_first' && t.detail?.domain === 'example.com')).toBe(true)
  })

  it('ends at the authed rung when the site refuses the saved login, instead of answering with the logged-out page', async () => {
    const url = 'https://example.com/account'
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [{ ...blockedResult(url, 'login_wall'), lane: 'browser_local_authed' }])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.channelsTried).toEqual(['authed_session'])
    expect(run.result.status).toBe('blocked')
    expect(run.result.blockReason).toBe('login_wall')
    expect(http.calls).toEqual([])
    expect(run.ladderTrace.some((t) => t.event === 'ladder_session_rejected')).toBe(true)
  })

  it('a redirect to the site\'s login page under the saved login is login_wall, never the page\'s content', async () => {
    const url = 'https://example.com/secure'
    const landedOnLogin: FetchResult = { ...contentfulResult(url, 'browser_local_authed'), markdown: 'Login Page', evidence: { ...contentfulResult(url, 'browser_local_authed').evidence, finalUrl: 'https://example.com/login', redirectChain: [url, 'https://example.com/login'] } }
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [landedOnLogin])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.result.status).toBe('blocked')
    expect(run.result.blockReason).toBe('login_wall')
    expect(http.calls).toEqual([])
    expect(run.ladderTrace.find((t) => t.event === 'ladder_session_rejected')?.detail).toMatchObject({ redirectedTo: 'https://example.com/login' })
  })

  it('reads a login page as a redirect to one only when the page asked for was not a login page', () => {
    const at = (finalUrl: string): FetchResult => ({ ...contentfulResult('https://example.com/x', 'browser_local'), evidence: { ...contentfulResult('https://example.com/x', 'browser_local').evidence, finalUrl } })
    expect(sessionRejection('https://example.com/account', at('https://example.com/users/sign_in?next=%2Faccount'))).not.toBeNull()
    expect(sessionRejection('https://example.com/account', at('https://example.com/account'))).toBeNull()
    expect(sessionRejection('https://example.com/account', at('https://example.com/authors/jane'))).toBeNull()
    expect(sessionRejection('https://example.com/login', at('https://example.com/login?x=1'))).toBeNull()
    // A slug that mentions a login word is a page, not a login endpoint.
    expect(sessionRejection('https://github.com/acme/old-name', at('https://github.com/acme/auth-service'))).toBeNull()
    expect(sessionRejection('https://example.com/q/123', at('https://example.com/questions/123/jwt-auth-in-express'))).toBeNull()
    expect(sessionRejection('https://example.com/settings', at('https://example.com/settings/auth'))).toBeNull()
    expect(sessionRejection('https://example.com/p/1', at('https://example.com/blog/how-to-login'))).toBeNull()
    expect(sessionRejection('https://example.com/docs/single-sign-on', at('https://example.com/docs/sso'))).toBeNull()
    expect(sessionRejection('https://www.amazon.com/gp/css/order-history', at('https://www.amazon.com/ap/signin?openid=x'))).not.toBeNull()
    expect(sessionRejection('https://www.linkedin.com/in/x', at('https://www.linkedin.com/authwall?trk=x'))).not.toBeNull()
    expect(sessionRejection('https://example.com/admin', at('https://example.com/login.php'))).not.toBeNull()
  })

  it('keeps the public order when no login is saved for the host, or the mode is not authed', async () => {
    const url = 'https://other.org/p'
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [])
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.channelsTried).toEqual(['http'])

    const standardUrl = 'https://example.com/p'
    const http2 = channel('http', [contentfulResult(standardUrl, 'http')])
    const run2 = await new LadderRunner([http2, channel('authed_session', [])], { mode: 'standard' }, null, null, store).run(standardUrl)
    expect(run2.channelsTried).toEqual(['http'])
    expect(run2.ladderTrace.some((t) => t.event === 'ladder_session_loaded')).toBe(false)
  })

  it('a session saved for a parent domain covers its subdomains, not a lookalike host', async () => {
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    expect((await loadSessionForHost(store, 'shop.www.example.com'))?.domain).toBe('example.com')
    expect(await loadSessionForHost(store, 'notexample.com')).toBeNull()
    expect(sessionCoversHost('example.com', 'www.example.com')).toBe(true)
    expect(sessionCoversHost('.example.com', 'example.com')).toBe(true)
    expect(sessionCoversHost('example.com', 'badexample.com')).toBe(false)
  })
})
